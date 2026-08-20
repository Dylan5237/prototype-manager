const fs = require('fs');
const path = require('path');

const MAX_REFERENCES = 2000;
const MAX_ERRORS = 50;
const SCANNABLE_EXTENSIONS = new Set(['.html', '.htm', '.js', '.mjs', '.cjs', '.css']);

function isRemoteReference(reference) {
  return /^(?:https?:|data:|blob:|mailto:|javascript:|#|\/\/)/i.test(reference);
}

function normalizeReference(reference) {
  let value = String(reference || '').trim();
  if (!value || isRemoteReference(value)) return null;
  try { value = decodeURIComponent(value); } catch (error) { /* keep the raw path */ }
  value = value.split('#', 1)[0].split('?', 1)[0].trim();
  return value || null;
}

function referenceCandidates(content, extension) {
  const refs = [];
  const add = value => {
    const normalized = normalizeReference(value);
    if (normalized) refs.push(normalized);
  };
  if (extension === '.html' || extension === '.htm') {
    for (const match of content.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) add(match[1]);
    for (const match of content.matchAll(/url\(\s*["']?([^\)"']+)["']?\s*\)/gi)) add(match[1]);
  } else if (extension === '.css') {
    for (const match of content.matchAll(/url\(\s*["']?([^\)"']+)["']?\s*\)/gi)) add(match[1]);
  } else {
    for (const match of content.matchAll(/(?:import|fetch|new\s+URL)\s*\(\s*["']([^"']+)["']/g)) add(match[1]);
    for (const match of content.matchAll(/\bfrom\s*["']([^"']+)["']/g)) add(match[1]);
  }
  return [...new Set(refs)];
}

function isLikelyLocalModule(reference) {
  return reference.startsWith('.') || reference.startsWith('/') || /\.(?:css|html?|js|mjs|cjs|json|svg|png|jpe?g|gif|webp|woff2?|ttf|ico)(?:$|[?#])/i.test(reference);
}

function resolveReference(root, fromFile, reference) {
  const relative = reference.startsWith('/')
    ? reference.slice(1)
    : path.relative(root, path.resolve(path.dirname(path.join(root, fromFile)), reference));
  const fullPath = path.resolve(root, relative);
  const bounded = fullPath === root || fullPath.startsWith(`${root}${path.sep}`);
  return { fullPath, relative: path.relative(root, fullPath).replace(/\\/g, '/'), bounded };
}

function validateCandidateDirectory(candidateRoot, entryFile) {
  const root = path.resolve(candidateRoot);
  const errors = [];
  const warnings = [];
  const queue = [String(entryFile || '').replace(/\\/g, '/')];
  const visited = new Set();
  const checkedReferences = new Set();

  const addError = error => {
    if (errors.length < MAX_ERRORS) errors.push(error);
  };

  if (!fs.existsSync(root)) {
    return { ok: false, mode: 'static', errors: [{ code: 'CANDIDATE_ROOT_MISSING', message: '候选目录不存在' }], warnings, filesChecked: 0, referencesChecked: 0 };
  }
  if (!entryFile || !fs.existsSync(path.join(root, entryFile))) {
    return { ok: false, mode: 'static', errors: [{ code: 'ENTRY_FILE_MISSING', message: '候选入口文件不存在' }], warnings, filesChecked: 0, referencesChecked: 0 };
  }

  while (queue.length) {
    const relativeFile = queue.shift();
    if (visited.has(relativeFile)) continue;
    visited.add(relativeFile);
    const fullPath = path.resolve(root, relativeFile);
    if (!fullPath.startsWith(`${root}${path.sep}`) || !fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      addError({ code: 'MISSING_REFERENCE', file: relativeFile, message: `引用文件不存在：${relativeFile}` });
      continue;
    }
    const extension = path.extname(relativeFile).toLowerCase();
    if (!SCANNABLE_EXTENSIONS.has(extension)) continue;
    let content;
    try { content = fs.readFileSync(fullPath, 'utf8'); } catch (error) {
      addError({ code: 'REFERENCE_READ_FAILED', file: relativeFile, message: `无法读取引用文件：${relativeFile}` });
      continue;
    }
    if (!content.trim()) {
      addError({ code: 'EMPTY_ENTRY', file: relativeFile, message: `入口或依赖文件为空：${relativeFile}` });
    }
    if ((extension === '.html' || extension === '.htm') && /(?:src|href)\s*=\s*["']\/src\//i.test(content)) {
      addError({ code: 'SOURCE_PATH_REFERENCE', file: relativeFile, message: '入口引用了不可部署的 /src/ 路径' });
    }

    for (const reference of referenceCandidates(content, extension)) {
      if (checkedReferences.size >= MAX_REFERENCES) {
        addError({ code: 'TOO_MANY_REFERENCES', message: '候选引用数量超过校验上限' });
        break;
      }
      if (!isLikelyLocalModule(reference)) continue;
      const key = `${relativeFile}\n${reference}`;
      if (checkedReferences.has(key)) continue;
      checkedReferences.add(key);
      const resolved = resolveReference(root, relativeFile, reference);
      if (!resolved.bounded) {
        addError({ code: 'REFERENCE_OUTSIDE_CANDIDATE', file: relativeFile, reference, message: `引用越过候选目录：${reference}` });
        continue;
      }
      if (!fs.existsSync(resolved.fullPath) || !fs.statSync(resolved.fullPath).isFile()) {
        addError({ code: 'MISSING_REFERENCE', file: relativeFile, reference, message: `引用文件不存在：${reference}` });
        continue;
      }
      if (SCANNABLE_EXTENSIONS.has(path.extname(resolved.relative).toLowerCase())) queue.push(resolved.relative);
    }
  }

  if (!errors.length && visited.size === 1) warnings.push('入口未发现可扫描的脚本或样式依赖，仍需浏览器预览确认');
  return {
    ok: errors.length === 0,
    mode: 'static',
    errors,
    warnings,
    filesChecked: visited.size,
    referencesChecked: checkedReferences.size
  };
}

module.exports = { validateCandidateDirectory, referenceCandidates, resolveReference };
