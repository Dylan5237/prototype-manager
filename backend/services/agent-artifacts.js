const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const ARTIFACTS = {
  mcp: {
    fileName: 'mcp.zip',
    expectedEntry: /(?:^|\/)src\/server\.js$/,
    rootName: 'fuxi-platform-mcp'
  },
  skill: {
    fileName: 'skill.zip',
    expectedEntry: /(?:^|\/)SKILL\.md$/,
    rootName: 'fuxi-skyui-prototype'
  }
};

const FORBIDDEN_SEGMENTS = new Set([
  '.git', '.svn', '.hg', 'node_modules', '.npmrc', '.env',
  '.credentials.json', 'credentials.json', 'mcp-credentials.json',
  'tests', '__tests__', 'coverage', 'logs', 'uploads', 'repos'
]);

function artifactRoot() {
  return path.resolve(process.env.FUXI_AGENT_RELEASE_ROOT || path.join(__dirname, '../data/agent-releases'));
}

function assertSafeReleaseId(releaseId) {
  const value = String(releaseId || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/.test(value)) {
    const error = new Error('releaseId 格式无效');
    error.code = 'INVALID_RELEASE_ID';
    error.status = 400;
    throw error;
  }
  return value;
}

function assertKind(kind) {
  if (!Object.prototype.hasOwnProperty.call(ARTIFACTS, kind)) {
    const error = new Error('制品类型只支持 mcp 或 skill');
    error.code = 'INVALID_ARTIFACT_KIND';
    error.status = 400;
    throw error;
  }
  return kind;
}

function safeChild(root, child) {
  const base = path.resolve(root) + path.sep;
  const resolved = path.resolve(root, child);
  if (!resolved.startsWith(base)) {
    const error = new Error('制品路径越界');
    error.code = 'ARTIFACT_PATH_OUTSIDE_ROOT';
    error.status = 400;
    throw error;
  }
  return resolved;
}

function releaseDirectory(releaseId) {
  return safeChild(artifactRoot(), assertSafeReleaseId(releaseId));
}

function artifactFile(releaseId, kind) {
  const definition = ARTIFACTS[assertKind(kind)];
  return safeChild(releaseDirectory(releaseId), definition.fileName);
}

function ensureDirectory(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function pathSegments(relativePath) {
  return String(relativePath || '').replace(/\\/g, '/').split('/').filter(Boolean);
}

function assertSafeZipEntry(entryName) {
  const normalized = String(entryName || '').replace(/\\/g, '/');
  const segments = pathSegments(normalized);
  if (!segments.length || normalized.startsWith('/') || segments.some(segment => segment === '..' || segment === '.')) {
    const error = new Error(`ZIP 条目路径不安全: ${entryName}`);
    error.code = 'ARTIFACT_UNSAFE_PATH';
    error.status = 400;
    throw error;
  }
  if (segments.some(segment => FORBIDDEN_SEGMENTS.has(segment) || segment.endsWith('.log'))) {
    const error = new Error(`ZIP 包含禁止文件: ${entryName}`);
    error.code = 'ARTIFACT_FORBIDDEN_ENTRY';
    error.status = 400;
    throw error;
  }
  return segments.join('/');
}

function validateZip(filePath, kind) {
  const definition = ARTIFACTS[assertKind(kind)];
  let zip;
  try {
    zip = new AdmZip(filePath);
  } catch (error) {
    const wrapped = new Error(`${kind} ZIP 无法读取`);
    wrapped.code = 'ARTIFACT_INVALID_ZIP';
    wrapped.status = 400;
    throw wrapped;
  }
  const entries = zip.getEntries().map(entry => ({
    name: assertSafeZipEntry(entry.entryName),
    isDirectory: entry.isDirectory
  }));
  if (!entries.some(entry => !entry.isDirectory && definition.expectedEntry.test(entry.name))) {
    const error = new Error(`${kind} ZIP 缺少必要入口`);
    error.code = 'ARTIFACT_ENTRY_MISSING';
    error.status = 400;
    throw error;
  }
  return {
    size: fs.statSync(filePath).size,
    sha256: sha256File(filePath),
    entries: entries.filter(entry => !entry.isDirectory).map(entry => entry.name)
  };
}

function walkDirectory(root, onFile, relative = '') {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      const error = new Error(`制品源目录不允许符号链接: ${entry.name}`);
      error.code = 'ARTIFACT_SYMLINK_FORBIDDEN';
      error.status = 400;
      throw error;
    }
    if (FORBIDDEN_SEGMENTS.has(entry.name) || entry.name.endsWith('.log') || entry.name.endsWith('.zip')) continue;
    const absolute = path.join(root, entry.name);
    const childRelative = relative ? path.posix.join(relative, entry.name) : entry.name;
    if (entry.isDirectory()) walkDirectory(absolute, onFile, childRelative);
    else onFile(absolute, childRelative.replace(/\\/g, '/'));
  }
}

function createZipFromDirectory(sourceRoot, targetFile, kind) {
  const definition = ARTIFACTS[assertKind(kind)];
  const source = path.resolve(sourceRoot || '');
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
    const error = new Error(`${kind} 制品源目录不存在`);
    error.code = 'ARTIFACT_SOURCE_NOT_FOUND';
    error.status = 503;
    throw error;
  }

  const zip = new AdmZip();
  let fileCount = 0;
  walkDirectory(source, (absolute, relative) => {
    zip.addFile(path.posix.join(definition.rootName, relative), fs.readFileSync(absolute));
    fileCount += 1;
  });
  if (!fileCount) {
    const error = new Error(`${kind} 制品源目录为空`);
    error.code = 'ARTIFACT_SOURCE_EMPTY';
    error.status = 400;
    throw error;
  }
  ensureDirectory(path.dirname(targetFile));
  const tempFile = `${targetFile}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempFile, zip.toBuffer());
  fs.renameSync(tempFile, targetFile);
  return validateZip(targetFile, kind);
}

function prepareArtifactBundle({ releaseId, mcpDir, skillDir }) {
  const safeReleaseId = assertSafeReleaseId(releaseId);
  const root = artifactRoot();
  const stage = safeChild(root, `.staging-${safeReleaseId}-${process.pid}-${Date.now()}`);
  if (fs.existsSync(releaseDirectory(safeReleaseId))) {
    const error = new Error('releaseId 的制品已经存在');
    error.code = 'ARTIFACT_RELEASE_ALREADY_EXISTS';
    error.status = 409;
    throw error;
  }
  ensureDirectory(stage);
  try {
    const mcpPath = path.join(stage, ARTIFACTS.mcp.fileName);
    const skillPath = path.join(stage, ARTIFACTS.skill.fileName);
    const mcp = createZipFromDirectory(mcpDir, mcpPath, 'mcp');
    const skill = createZipFromDirectory(skillDir, skillPath, 'skill');
    return {
      releaseId: safeReleaseId,
      stage,
      artifacts: {
        mcp: { ...mcp, fileName: ARTIFACTS.mcp.fileName },
        skill: { ...skill, fileName: ARTIFACTS.skill.fileName }
      }
    };
  } catch (error) {
    fs.rmSync(stage, { recursive: true, force: true });
    throw error;
  }
}

function commitArtifactBundle(bundle) {
  const finalDir = releaseDirectory(bundle.releaseId);
  if (fs.existsSync(finalDir)) {
    const error = new Error('releaseId 的制品已经存在');
    error.code = 'ARTIFACT_RELEASE_ALREADY_EXISTS';
    error.status = 409;
    throw error;
  }
  ensureDirectory(path.dirname(finalDir));
  fs.renameSync(bundle.stage, finalDir);
  return finalDir;
}

function discardArtifactBundle(bundle) {
  if (bundle && bundle.stage) fs.rmSync(bundle.stage, { recursive: true, force: true });
}

function removeArtifactBundle(releaseId) {
  fs.rmSync(releaseDirectory(releaseId), { recursive: true, force: true });
}

function getArtifactMetadata(releaseId, kind) {
  const filePath = artifactFile(releaseId, kind);
  if (!fs.existsSync(filePath)) return null;
  const metadata = validateZip(filePath, kind);
  return { ...metadata, path: filePath, fileName: ARTIFACTS[kind].fileName };
}

module.exports = {
  ARTIFACTS,
  artifactRoot,
  artifactFile,
  validateZip,
  prepareArtifactBundle,
  commitArtifactBundle,
  discardArtifactBundle,
  removeArtifactBundle,
  getArtifactMetadata
};
