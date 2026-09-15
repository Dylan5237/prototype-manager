const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function writeFileAtomic(file, data, options = {}) {
  const encoding = options.encoding;
  const mode = options.mode;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const writeOptions = {};
  if (encoding) writeOptions.encoding = encoding;
  if (mode !== undefined) writeOptions.mode = mode;
  fs.writeFileSync(temp, data, Object.keys(writeOptions).length ? writeOptions : undefined);
  try {
    fs.renameSync(temp, file);
    if (mode !== undefined) {
      try { fs.chmodSync(file, mode); } catch (chmodError) {}
    }
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES' || error.code === 'EEXIST') {
      try {
        fs.copyFileSync(temp, file);
        if (mode !== undefined) {
          try { fs.chmodSync(file, mode); } catch (chmodError) {}
        }
      } finally {
        fs.rmSync(temp, { force: true });
      }
      return;
    }
    try { fs.rmSync(temp, { force: true }); } catch (cleanupError) {}
    throw error;
  }
}

function writeJsonAtomic(file, value, options = {}) {
  const mode = options.mode === undefined ? 0o600 : options.mode;
  writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode });
}

module.exports = {
  writeFileAtomic,
  writeJsonAtomic
};
