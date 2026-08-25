const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function parseSemver(value) {
  const label = String(value || '').trim().replace(/^v/, '');
  const match = label.match(SEMVER_PATTERN);
  if (!match) return null;
  return {
    label,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
    build: match[5] || ''
  };
}

function compareIdentifiers(left, right) {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);
  if (leftNumeric && rightNumeric) return Number(left) - Number(right);
  if (leftNumeric) return -1;
  if (rightNumeric) return 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareSemver(left, right) {
  const a = typeof left === 'string' ? parseSemver(left) : left;
  const b = typeof right === 'string' ? parseSemver(right) : right;
  if (!a || !b) throw new Error('版本号必须符合 SemVer 规范');
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] > b[key] ? 1 : -1;
  }
  if (!a.prerelease.length && !b.prerelease.length) return 0;
  if (!a.prerelease.length) return 1;
  if (!b.prerelease.length) return -1;
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    if (index >= a.prerelease.length) return -1;
    if (index >= b.prerelease.length) return 1;
    const result = compareIdentifiers(a.prerelease[index], b.prerelease[index]);
    if (result) return result > 0 ? 1 : -1;
  }
  return 0;
}

function bumpVersion(currentLabel, bumpType = 'patch') {
  const current = parseSemver(currentLabel || '0.0.0') || parseSemver('0.0.0');
  switch (bumpType) {
    case 'major': return `${current.major + 1}.0.0`;
    case 'minor': return `${current.major}.${current.minor + 1}.0`;
    case 'patch': return `${current.major}.${current.minor}.${current.patch + 1}`;
    default: throw new Error('版本升级类型必须是 major、minor 或 patch');
  }
}

function normalizeVersionStrategy({ type, value } = {}, currentLabel = '0.0.0') {
  const normalizedType = type === 'custom' ? 'custom' : 'auto';
  if (normalizedType === 'auto') return { type: 'auto', value: null };
  const label = String(value || '').trim().replace(/^v/, '');
  if (!parseSemver(label)) throw new Error('自定义版本号必须符合 SemVer，例如 1.2.3');
  if (compareSemver(label, currentLabel || '0.0.0') <= 0) {
    throw new Error(`自定义版本号必须高于当前版本 v${currentLabel || '0.0.0'}`);
  }
  return { type: 'custom', value: label };
}

function resolveVersionLabel({ strategyType = 'auto', strategyValue = null, chosenType = 'patch', currentLabel = '0.0.0' } = {}) {
  if (strategyType === 'custom') {
    const normalized = normalizeVersionStrategy({ type: 'custom', value: strategyValue }, currentLabel);
    return normalized.value;
  }
  const label = bumpVersion(currentLabel, chosenType || 'patch');
  return label;
}

module.exports = {
  SEMVER_PATTERN,
  parseSemver,
  compareSemver,
  bumpVersion,
  normalizeVersionStrategy,
  resolveVersionLabel
};
