const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const MAX_ZIP_BYTES = 100 * 1024 * 1024;
const ENTRY_CANDIDATES = ['dist/index.html', 'build/index.html', 'index.html', 'public/index.html'];
const HARD_FORBIDDEN = ['node_modules', 'src', '.git', '.svn', '.venv'];
const WARN_FORBIDDEN = ['tests', '__tests__', 'uploads', 'data', 'repos'];
const README_CANDIDATES = ['README.md', 'readme.md', 'README.MD', 'docs/README.md', 'docs/readme.md', 'Docs/README.md', 'Docs/readme.md'];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

class ZipError extends Error {
  constructor(message, code = 'INVALID_ZIP') {
    super(message);
    this.code = code;
  }
}

function normalizePath(entry) {
  return String(entry || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function sanitizePath(entry) {
  const parts = normalizePath(entry).split('/').filter(Boolean);
  if (parts.some(part => part === '..' || part === '.')) return null;
  const target = parts.join('/');
  return target ? target : null;
}

function isForbidden(entry, hard) {
  const rel = normalizePath(entry);
  const set = hard ? HARD_FORBIDDEN : WARN_FORBIDDEN;
  return set.some(part => {
    const segment = `/${part}/`;
    return rel === part || rel.startsWith(`${part}/`) || rel.includes(segment);
  });
}

function findEntryFromList(entries) {
  const present = new Set(entries);
  for (const candidate of ENTRY_CANDIDATES) {
    if (present.has(candidate)) return candidate;
  }
  if (present.has('index.html')) return 'index.html';
  return null;
}

function hasForbiddenInHtml(content) {
  if (!content || !content.length) return false;
  const text = content.toString('utf8');
  return /(?:"|'|\(|\s)\/src\//.test(text);
}

function findReadme(entries) {
  const present = new Set(entries);
  for (const candidate of README_CANDIDATES) {
    if (present.has(candidate)) return candidate;
  }
  return null;
}

function collectFileEntries(root, base = '') {
  const result = [];
  const stack = [{ dir: root, prefix: base }];
  while (stack.length) {
    const { dir, prefix } = stack.pop();
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const cur = prefix ? `${prefix}/${item.name}` : item.name;
      const absolute = path.join(dir, item.name);
      if (item.isDirectory()) {
        if (HARD_FORBIDDEN.includes(item.name) || WARN_FORBIDDEN.includes(item.name)) continue;
        stack.push({ dir: absolute, prefix: cur });
      } else if (item.isFile()) {
        result.push({ entry: cur, absolute });
      }
    }
  }
  return result;
}

function pickBundleFiles(projectRoot) {
  const dist = path.join(projectRoot, 'dist');
  const build = path.join(projectRoot, 'build');
  const preference = fs.existsSync(dist) ? dist : fs.existsSync(build) ? build : projectRoot;
  const files = collectFileEntries(preference)
    .map(f => ({
      entry: f.entry,
      absolute: f.absolute
    }));
  const markdown = collectFileEntries(projectRoot)
    .filter(f => f.entry === 'README.md' || f.entry.toLowerCase() === 'readme.md' || f.entry.startsWith('docs/'));
  const combined = new Map(files.map(f => [f.entry, f]));
  for (const f of markdown) {
    if (!combined.has(f.entry)) combined.set(f.entry, f);
  }
  return {
    files: Array.from(combined.values()),
    sourceType: preference === projectRoot ? 'project-root' : preference === dist ? 'dist' : 'build'
  };
}

function analyzeHtmlContent(content) {
  const warnings = [];
  const text = content.toString('utf8');
  const assetMatches = text.match(/(?:src|href)\s*=\s*["']\/assets\//g) || [];
  if (assetMatches.length) {
    warnings.push(`Entry HTML uses ${assetMatches.length} absolute /assets/ path(s); prefer relative paths.`);
  }
  return { warnings };
}

function validateZipFile(zipPath) {
  let stat;
  try {
    stat = fs.statSync(zipPath);
  } catch (e) {
    throw new ZipError('ZIP file not found', 'FILE_NOT_FOUND');
  }
  if (stat.size > MAX_ZIP_BYTES) {
    throw new ZipError(`ZIP exceeds ${MAX_ZIP_BYTES / 1024 / 1024} MB limit`, 'ZIP_TOO_LARGE');
  }

  const buffer = fs.readFileSync(zipPath);
  let entries;
  let entryHtml;
  let entryHtmlPath;
  try {
    const parsed = parseZipBuffer(buffer);
    entries = parsed.entries;
    const entryFile = findEntryFromList(entries.map(e => e.name));
    if (!entryFile) {
      throw new ZipError('ZIP has no recognizable entry file', 'ENTRY_FILE_NOT_FOUND');
    }
    const htmlEntry = parsed.entries.find(e => e.name === entryFile);
    entryHtml = htmlEntry ? (htmlEntry.decompressed || Buffer.alloc(0)) : Buffer.alloc(0);
    entryHtmlPath = entryFile;
  } catch (e) {
    if (e instanceof ZipError) throw e;
    throw new ZipError(`Cannot read ZIP: ${e.message}`, 'INVALID_ZIP');
  }

  const errors = [];
  const warnings = [];
  for (const entry of entries) {
    if (entry.forbiddenHard) errors.push(`Forbidden entry: ${entry.name}`);
    if (entry.forbiddenWarn) warnings.push(`Excluded in backend runtime: ${entry.name}`.replace('Excluded in', 'Outside'));
  }
  if (hasForbiddenInHtml(entryHtml)) {
    errors.push('Entry HTML references /src/, which is not a deployable path');
  }
  warnings.push(...analyzeHtmlContent(entryHtml).warnings);

  const rootEntries = entries.map(e => e.name);
  const readme = findReadme(rootEntries);
  if (!readme) warnings.push('No README.md found at recognized locations; platform design view will be empty');
  return {
    ok: errors.length === 0 && !entryHtmlPath ? false : errors.length === 0,
    sizeBytes: stat.size,
    entryFile: entryHtmlPath,
    readme: readme || null,
    rootLayout: detectRootLayout(entries.map(e => e.name)),
    errors,
    warnings,
    files: { included: entries.map(e => e.name).slice(0, 300), forbidden: errors.map(e => e) }
  };
}

function detectRootLayout(names) {
  const nonWrapper = names.filter(n => !n.includes('/')).length;
  const dirs = new Set(names.map(n => n.split('/')[0]).filter(Boolean));
  if (dirs.size <= 1 && nonWrapper > 0) return 'single-wrapper';
  if (dirs.size > 1) return 'nested';
  return 'flat';
}

function parseZipBuffer(buffer) {
  const entries = [];
  let offset = 0;
  if (buffer.length < 22) throw new ZipError('ZIP is too small');

  // Find end-of-central-directory record by scanning backward.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError('End of central directory not found');

  const cdCount = buffer.readUInt16LE(eocd + 10);
  const cdOffset = buffer.readUInt32LE(eocd + 16);
  let cur = cdOffset;
  for (let i = 0; i < cdCount; i++) {
    if (buffer.readUInt32LE(cur) !== 0x02014b50) throw new ZipError('Invalid central directory record');
    const compression = buffer.readUInt16LE(cur + 10);
    const compSize = buffer.readUInt32LE(cur + 20);
    const uncompSize = buffer.readUInt32LE(cur + 24);
    const nameLength = buffer.readUInt16LE(cur + 28);
    const extraLength = buffer.readUInt16LE(cur + 30);
    const commentLength = buffer.readUInt16LE(cur + 32);
    const localOffset = buffer.readUInt32LE(cur + 42);
    const nameBytes = buffer.subarray(cur + 46, cur + 46 + nameLength);
    const name = normalizePath(nameBytes.toString('utf8'));
    const safe = sanitizePath(name);
    if (!safe) throw new ZipError(`Unsafe ZIP entry name: ${name}`, 'UNSAFE_ENTRY');

    // Verify local header and locate compressed data.
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new ZipError('Invalid local header');
    const lNameLen = buffer.readUInt16LE(localOffset + 26);
    const lExtraLen = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const dataSlice = buffer.subarray(dataStart, dataStart + compSize);
    let decompressed = null;
    if (compression === 0) {
      decompressed = dataSlice;
    } else if (compression === 8) {
      try {
        decompressed = zlib.inflateRawSync(dataSlice);
      } catch (e) {
        throw new ZipError(`Cannot inflate entry ${name}: ${e.message}`);
      }
    } else {
      throw new ZipError(`Unsupported ZIP compression method ${compression} for ${name}`);
    }
    if (decompressed && decompressed.length !== uncompSize) {
      throw new ZipError(`Size mismatch for entry ${name}`);
    }
    entries.push({
      name,
      compressedSize: compSize,
      uncompressedSize: uncompSize,
      decompressed,
      forbiddenHard: isForbidden(name, true),
      forbiddenWarn: isForbidden(name, false)
    });
    cur += 46 + nameLength + extraLength + commentLength;
  }
  return { entries };
}

function buildZip(files) {
  const sections = [];
  let offset = 0;
  const central = [];
  const now = new Date(1980, 0, 1);
  for (const file of files) {
    let data = fs.readFileSync(file.absolute);
    const useDeflate = data.length > 32;
    const compressed = useDeflate ? zlib.deflateRawSync(data) : data;
    const name = file.entry;
    const nameBuffer = Buffer.from(name, 'utf8');
    const date = dosDateTime(file.mtime || now);
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(date.time, 10);
    local.writeUInt16LE(date.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    const localBlock = Buffer.concat([local, nameBuffer, compressed]);
    sections.push(localBlock);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(useDeflate ? 8 : 0, 10);
    centralHeader.writeUInt16LE(date.time, 12);
    centralHeader.writeUInt16LE(date.date, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([centralHeader, nameBuffer]));
    offset += localBlock.length;
  }

  const centralSize = central.reduce((sum, b) => sum + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  const body = Buffer.concat([...sections, ...central, eocd]);
  // Recompute sizes with verification for large outputs.
  return body;
}

function dosDateTime(date) {
  const d = new Date(date);
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const datePart = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date: datePart };
}

function packProject(projectRoot, outputPath) {
  let absoluteRoot;
  try {
    absoluteRoot = path.resolve(projectRoot);
    if (!fs.statSync(absoluteRoot).isDirectory()) throw new Error('not a directory');
  } catch (e) {
    throw new ZipError('Project path does not exist or is not a directory', 'PROJECT_NOT_FOUND');
  }
  const { files, sourceType } = pickBundleFiles(absoluteRoot);
  const entry = findEntryFromList(files.map(f => f.entry));
  if (!entry) {
    throw new ZipError('No recognizable entry file in project output', 'ENTRY_FILE_NOT_FOUND');
  }
  const outputDir = path.dirname(path.resolve(outputPath));
  if (!fs.existsSync(outputDir)) {
    throw new ZipError('Output directory does not exist', 'OUTPUT_DIR_NOT_FOUND');
  }
  const zipBuffer = buildZip(files);
  fs.writeFileSync(path.resolve(outputPath), zipBuffer);
  const validation = validateZipFile(path.resolve(outputPath));
  return {
    ok: validation.ok,
    zipPath: path.resolve(outputPath),
    entryFile: normalizeEntryAfterUpload(entry),
    sourceType,
    includedFiles: files.map(f => f.entry),
    excludedFiles: [],
    sizeBytes: zipBuffer.length,
    warnings: validation.warnings,
    errors: validation.errors
  };
}

function validateProject(projectRoot) {
  let absoluteRoot;
  try {
    absoluteRoot = path.resolve(projectRoot);
    if (!fs.statSync(absoluteRoot).isDirectory()) throw new Error('not a directory');
  } catch (e) {
    throw new ZipError('Project path does not exist or is not a directory', 'PROJECT_NOT_FOUND');
  }
  const { files, sourceType } = pickBundleFiles(absoluteRoot);
  const entry = findEntryFromList(files.map(f => f.entry));
  const errors = [];
  const warnings = [];
  const included = [];
  const excluded = [];
  for (const file of files) {
    if (isForbidden(file.entry, true)) {
      errors.push(`Forbidden project file: ${file.entry}`);
      continue;
    }
    if (isForbidden(file.entry, false)) {
      excluded.push(file.entry);
      continue;
    }
    included.push(file.entry);
  }
  if (!entry) {
    errors.push('No recognizable entry file in project output');
  } else {
    const entryFile = files.find(f => f.entry === entry);
    if (entryFile) {
      const content = fs.readFileSync(entryFile.absolute);
      if (hasForbiddenInHtml(content)) {
        errors.push('Entry HTML references /src/, which is not a deployable path');
      }
      warnings.push(...analyzeHtmlContent(content).warnings);
    }
  }
  const sizeBytes = files.reduce((sum, f) => {
    try { return sum + fs.statSync(f.absolute).size; } catch (e) { return sum; }
  }, 0);
  if (sizeBytes > MAX_ZIP_BYTES) {
    errors.push(`Project bundle exceeds ${MAX_ZIP_BYTES / 1024 / 1024} MB limit`);
  }
  const readme = findReadme(files.map(f => f.entry));
  if (!readme) warnings.push('No README.md at recognized locations; platform design view will be empty');
  return {
    ok: errors.length === 0,
    entryFile: entry,
    readme: readme || null,
    sourceType,
    sizeBytes,
    warnings,
    errors,
    files: { included: included.slice(0, 300), excluded: excluded.slice(0, 100) }
  };
}

function normalizeEntryAfterUpload(entry) {
  return String(entry || '').replace(/^(dist|build|public)\//, '');
}

module.exports = {
  validateProject,
  validateZipFile,
  packProject,
  buildZip,
  parseZipBuffer,
  findEntryFromList,
  MAX_ZIP_BYTES,
  ZipError
};
