const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { performance } = require('perf_hooks');

const { packProject, validateProject, validateZipFile } = require('../../src/fuxi-zip');

const SAMPLE_MEGABYTES = [1, 20, 80];
const ITERATIONS = 10;
const platformRoot = path.resolve(__dirname, '..', '..', '..');

function argumentValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function elapsed(start) {
  return Number((performance.now() - start).toFixed(2));
}

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
}

function summarize(values) {
  const numbers = values.filter(value => Number.isFinite(value));
  if (!numbers.length) return { sampleCount: 0, p50Ms: null, p95Ms: null, maxMs: null, failures: values.length };
  return {
    sampleCount: numbers.length,
    p50Ms: percentile(numbers, 0.5),
    p95Ms: percentile(numbers, 0.95),
    maxMs: Math.max(...numbers),
    failures: values.length - numbers.length
  };
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
    '<!doctype html><html><body><h1>Fuxi phase 24 fixture</h1></body></html>\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(projectRoot, 'README.md'),
    `# Fuxi phase 24 fixture\n\nruntime_profile: static-html\n\nPayload: ${megabytes} MB\n`,
    'utf8'
  );
  writeRandomFile(path.join(assets, 'payload.bin'), megabytes);
  return projectRoot;
}

function measureOnce(projectRoot, zipPath) {
  const timings = {};
  let started = performance.now();
  const projectValidation = validateProject(projectRoot);
  timings.validateProject = elapsed(started);

  started = performance.now();
  const packed = packProject(projectRoot, zipPath);
  timings.packProjectIncludingFirstZipValidation = elapsed(started);

  started = performance.now();
  const zipValidation = validateZipFile(zipPath);
  timings.validateZipReadback = elapsed(started);

  if (!projectValidation.ok || !packed.ok || !zipValidation.ok) {
    throw new Error(`Fixture ${path.basename(projectRoot)} did not pass the Fuxi delivery gates.`);
  }
  return { ...timings, zipBytes: packed.sizeBytes, entryFile: packed.entryFile, readme: zipValidation.readme };
}

function safeRemoveFixture(fixtureRoot) {
  const tempRoot = path.resolve(os.tmpdir());
  const resolved = path.resolve(fixtureRoot);
  if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith('fuxi-phase24-baseline-')) {
    throw new Error(`Refusing to remove unexpected fixture path: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

function main() {
  const outputPath = path.resolve(argumentValue('--output', path.join(platformRoot, '.release', 'phase24-local-packaging-baseline.json')));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-phase24-baseline-'));
  try {
    const samples = SAMPLE_MEGABYTES.map(megabytes => {
      const projectRoot = createFixture(fixtureRoot, megabytes);
      const zipPath = path.join(fixtureRoot, `fixture-${megabytes}mb.zip`);
      const runs = [];
      const failures = [];
      for (let iteration = 1; iteration <= ITERATIONS; iteration += 1) {
        try {
          runs.push({ iteration, ...measureOnce(projectRoot, zipPath) });
        } catch (error) {
          failures.push({ iteration, code: error.code || 'BASELINE_FAILED', message: error.message });
        }
      }
      return {
        payloadBytes: megabytes * 1024 * 1024,
        zipBytes: runs.at(-1)?.zipBytes || null,
        entryFile: runs.at(-1)?.entryFile || null,
        readme: runs.at(-1)?.readme || null,
        runs,
        failures,
        timingsMs: {
          validateProject: summarize(runs.map(run => run.validateProject)),
          packProjectIncludingFirstZipValidation: summarize(runs.map(run => run.packProjectIncludingFirstZipValidation)),
          validateZipReadback: summarize(runs.map(run => run.validateZipReadback))
        }
      };
    });

    const report = {
      schema: 'fuxi-phase24-local-packaging-baseline/1',
      generatedAt: new Date().toISOString(),
      environment: {
        platform: process.platform,
        arch: process.arch,
        node: process.version,
        cpuModel: os.cpus()[0]?.model || 'unknown',
        logicalCpuCount: os.cpus().length,
        totalMemoryBytes: os.totalmem()
      },
      iterationsPerSize: ITERATIONS,
      samples,
      unverifiedChains: [
        'MCP 接入首次连接与认证',
        'Skill/MCP 更新下载、切换、heartbeat 与回滚',
        '真实 Agent 原型生成、截图质量与修复轮次',
        '16077 上传、解压、版本写入、回读和预览'
      ],
      notes: [
        'packProjectIncludingFirstZipValidation includes the implementation\'s first ZIP validation.',
        'This report measures local packaging only; it does not claim remote or AI-generation acceptance.'
      ]
    };
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    process.stdout.write(`${JSON.stringify({
      status: 'PASS',
      output: outputPath,
      sampleSizes: SAMPLE_MEGABYTES,
      iterationsPerSize: ITERATIONS,
      totalRuns: samples.reduce((sum, sample) => sum + sample.runs.length, 0),
      failures: samples.reduce((sum, sample) => sum + sample.failures.length, 0),
      slowestPackP95Ms: Math.max(...samples.map(sample => sample.timingsMs.packProjectIncludingFirstZipValidation.p95Ms || 0))
    }, null, 2)}\n`);
  } finally {
    safeRemoveFixture(fixtureRoot);
  }
}

main();
