const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { performance } = require('perf_hooks');

const { packProject, validateProject, validateZipFile } = require('../../src/fuxi-zip');

const SAMPLE_MEGABYTES = [1, 20, 80];
const platformRoot = path.resolve(__dirname, '..', '..', '..');

function argumentValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function elapsed(start) {
  return Number((performance.now() - start).toFixed(2));
}

function writeRandomFile(filePath, megabytes) {
  const handle = fs.openSync(filePath, 'w');
  try {
    for (let index = 0; index < megabytes; index += 1) {
      fs.writeSync(handle, crypto.randomBytes(1024 * 1024));
    }
  } finally {
    fs.closeSync(handle);
  }
}

function createFixture(root, megabytes) {
  const projectRoot = path.join(root, `project-${megabytes}mb`);
  const dist = path.join(projectRoot, 'dist');
  const assets = path.join(dist, 'assets');
  fs.mkdirSync(assets, { recursive: true });
  fs.writeFileSync(
    path.join(dist, 'index.html'),
    '<!doctype html><html><body><h1>Fuxi performance fixture</h1></body></html>\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(projectRoot, 'README.md'),
    `# Fuxi phase 20 fixture\n\nruntime_profile: static-html\n\nPayload: ${megabytes} MB\n`,
    'utf8'
  );
  writeRandomFile(path.join(assets, 'payload.bin'), megabytes);
  return projectRoot;
}

function measureSample(fixtureRoot, megabytes) {
  const projectRoot = createFixture(fixtureRoot, megabytes);
  const zipPath = path.join(fixtureRoot, `fixture-${megabytes}mb.zip`);
  const rssBefore = process.memoryUsage().rss;

  let started = performance.now();
  const projectValidation = validateProject(projectRoot);
  const validateProjectMs = elapsed(started);

  started = performance.now();
  const packed = packProject(projectRoot, zipPath);
  const packProjectMs = elapsed(started);

  started = performance.now();
  const zipValidation = validateZipFile(zipPath);
  const validateZipMs = elapsed(started);

  const rssAfter = process.memoryUsage().rss;
  if (!projectValidation.ok || !packed.ok || !zipValidation.ok) {
    throw new Error(`Fixture ${megabytes} MB did not pass the Fuxi delivery gates.`);
  }

  return {
    requestedPayloadBytes: megabytes * 1024 * 1024,
    projectBytes: projectValidation.sizeBytes,
    zipBytes: packed.sizeBytes,
    includedFileCount: packed.includedFiles.length,
    entryFile: packed.entryFile,
    readme: zipValidation.readme,
    timingsMs: {
      validateProject: validateProjectMs,
      packProjectIncludingFirstZipValidation: packProjectMs,
      secondValidateZip: validateZipMs
    },
    processRssBytes: {
      before: rssBefore,
      after: rssAfter,
      delta: rssAfter - rssBefore,
      note: 'Synchronous operations prevent interval sampling; this is end-state delta, not peak RSS.'
    }
  };
}

function frontendArtifacts(distRoot) {
  if (!fs.existsSync(distRoot)) return { status: 'missing', path: distRoot, javascript: [], css: [] };
  const assetsRoot = path.join(distRoot, 'assets');
  const files = fs.existsSync(assetsRoot) ? fs.readdirSync(assetsRoot) : [];
  const describe = extension => files
    .filter(file => file.endsWith(extension))
    .map(file => ({ file, bytes: fs.statSync(path.join(assetsRoot, file)).size }))
    .sort((left, right) => right.bytes - left.bytes);
  return {
    status: 'present',
    path: distRoot,
    javascript: describe('.js'),
    css: describe('.css')
  };
}

function safeRemoveFixture(fixtureRoot) {
  const tempRoot = path.resolve(os.tmpdir());
  const resolved = path.resolve(fixtureRoot);
  if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith('fuxi-phase20-baseline-')) {
    throw new Error(`Refusing to remove unexpected fixture path: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

function main() {
  const outputPath = path.resolve(argumentValue('--output', path.join(platformRoot, '.release', 'phase20-performance-baseline.json')));
  const distRoot = path.resolve(argumentValue('--frontend-dist', path.join(platformRoot, 'frontend', 'dist')));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-phase20-baseline-'));

  try {
    const samples = SAMPLE_MEGABYTES.map(size => measureSample(fixtureRoot, size));
    const report = {
      schema: 'fuxi-phase20-performance-baseline/1',
      generatedAt: new Date().toISOString(),
      environment: {
        platform: process.platform,
        arch: process.arch,
        node: process.version,
        cpuModel: os.cpus()[0]?.model || 'unknown',
        logicalCpuCount: os.cpus().length,
        totalMemoryBytes: os.totalmem()
      },
      frontend: frontendArtifacts(distRoot),
      packaging: {
        implementation: 'mcp-server/src/fuxi-zip.js',
        samples
      },
      pendingRealEnvironmentMeasurements: [
        'MCP connection code to first successful check_connection',
        'agent manifest check/download/hash/staging/smoke/switch/heartbeat',
        '16077 validate/pack/upload/extract/version-write/readback/preview',
        'first prototype generation pass rate and repair rounds'
      ]
    };

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    process.stdout.write(`${JSON.stringify({
      status: 'PASS',
      output: outputPath,
      sampleCount: samples.length,
      largestZipBytes: Math.max(...samples.map(sample => sample.zipBytes)),
      largestJavascriptBytes: report.frontend.javascript[0]?.bytes || null
    }, null, 2)}\n`);
  } finally {
    safeRemoveFixture(fixtureRoot);
  }
}

main();
