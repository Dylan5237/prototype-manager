const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const scriptPath = path.resolve(__dirname, '../scripts/verify-production-release.ps1');
const script = fs.readFileSync(scriptPath, 'utf8');

test('production verifier pins a supported explicit onboarding host', () => {
  assert.match(script, /\[ValidateSet\('workbuddy','cursor'\)\]\[string\]\$BootstrapHost\s*=\s*'workbuddy'/);
  assert.match(script, /agent-bootstrap\?host=\$bootstrapHostQuery/);
  assert.match(script, /\$bootstrap\.data\.host\.id/);
  assert.doesNotMatch(script, /deliver_project/);
});

test('production verifier follows the current bootstrap session and canonical onboarding contract', () => {
  assert.match(script, /\$bootstrap\.data\.bootstrapSession/);
  assert.match(script, /\$bootstrap\.data\.canonicalOnboarding/);
  assert.match(script, /bootstrap-session\?client=\$bootstrapHostQuery/);
  assert.match(script, /fuxi-bootstrap\/2/);
  assert.match(script, /check_connection/);
  assert.match(script, /Canonical onboarding SHA-256 mismatch/);
});

test('production verifier authenticates package reads with manifest install token and verifies artifact digests', () => {
  assert.match(script, /\$manifest\.installToken/);
  assert.match(script, /\$manifest\.artifacts\.skill/);
  assert.match(script, /\$manifest\.artifacts\.mcp/);
  assert.match(script, /Get-FileHash\s+-LiteralPath\s+\$Path\s+-Algorithm SHA256/);
  assert.match(script, /fuxi-prototype\/SKILL\.md/);
  assert.match(script, /fuxi-platform-mcp\/src\/server\.js/);
});

test('production verifier result omits short-lived credentials and connect code', () => {
  const outputStart = script.lastIndexOf('[pscustomobject]@{');
  assert.ok(outputStart >= 0, 'final result object is missing');
  const output = script.slice(outputStart);
  assert.doesNotMatch(output, /credential|installToken|connectCode/i);
  assert.doesNotMatch(output, /bootstrapId/i);
  assert.match(output, /bootstrapHost=\$BootstrapHost/);
  assert.match(output, /canonicalOnboardingSha256=\$canonicalOnboardingSha256/);
});

test('full production build gate executes the verifier contract regression', () => {
  const buildScriptPath = path.resolve(__dirname, '../scripts/build-release.ps1');
  const buildScript = fs.readFileSync(buildScriptPath, 'utf8');
  assert.match(buildScript, /verify-production-release-contract\.test\.js/);
  assert.match(buildScript, /release-verifier-contract/);
});
