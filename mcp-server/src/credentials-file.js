'use strict';

const os = require('node:os');
const path = require('node:path');

// Installable onboarding hosts. Each gets its own credentials file so the
// derived `*.instance.lock` cannot SIGTERM another host's MCP runtime.
const NAMED_HOST_CLIENTS = Object.freeze(['workbuddy', 'cursor', 'codex']);

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function fuxiHomeDir() {
  return path.join(os.homedir(), '.fuxi');
}

function legacyCredentialsFile() {
  return path.join(fuxiHomeDir(), 'mcp-credentials.json');
}

function normalizeClientName(client) {
  const name = String(client || '').trim().toLowerCase();
  return NAMED_HOST_CLIENTS.includes(name) ? name : '';
}

function hostCredentialsFile(client) {
  const name = normalizeClientName(client);
  return name ? path.join(fuxiHomeDir(), `mcp-credentials-${name}.json`) : null;
}

// Resolution: explicit CLI/manifest path → named-host path → inherited env →
// legacy ~/.fuxi/mcp-credentials.json. Named hosts win over a shared env value
// so a parent MCP session cannot pull another host onto its lock file.
function resolveCredentialsFile({ client, explicit } = {}) {
  const chosen = firstNonEmpty(explicit);
  if (chosen) return path.resolve(chosen);
  const hostPath = hostCredentialsFile(client);
  if (hostPath) return hostPath;
  const fromEnv = firstNonEmpty(process.env.FUXI_CREDENTIALS_FILE);
  if (fromEnv) return path.resolve(fromEnv);
  return legacyCredentialsFile();
}

module.exports = {
  NAMED_HOST_CLIENTS,
  firstNonEmpty,
  fuxiHomeDir,
  legacyCredentialsFile,
  hostCredentialsFile,
  resolveCredentialsFile
};
