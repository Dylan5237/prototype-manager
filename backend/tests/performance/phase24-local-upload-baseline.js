#!/usr/bin/env node

/*
 * 阶段 24 本地写入型上传预备基线。
 *
 * 仅启动进程内的临时 Express + SQLite，repos/uploads/ZIP 都位于系统临时目录。
 * 它不读取 16077/16088 配置，不会连接远端或部署任何内容。
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { monitorEventLoopDelay, performance } = require('node:perf_hooks');
const AdmZip = require('adm-zip');

const SIZES_MB = [1, 20, 80];
const DEFAULT_ROUNDS = 3;

function parseOptions(argv) {
  const options = { rounds: DEFAULT_ROUNDS };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--rounds') {
      options.rounds = Number(argv[index + 1]);
      index += 1;
    }
  }
  if (!Number.isInteger(options.rounds) || options.rounds < 3) {
    throw new Error('--rounds 必须是不小于 3 的整数');
  }
  return options;
}

function percentile(values, percentileValue) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * percentileValue) - 1)];
}

function toMiB(bytes) {
  return Number((bytes / 1024 / 1024).toFixed(2));
}

function createRandomFile(filePath, sizeBytes) {
  const descriptor = fs.openSync(filePath, 'w');
  try {
    let remaining = sizeBytes;
    while (remaining > 0) {
      const chunk = crypto.randomBytes(Math.min(remaining, 1024 * 1024));
      fs.writeSync(descriptor, chunk);
      remaining -= chunk.length;
    }
  } finally {
    fs.closeSync(descriptor);
  }
}

function createFixtureZip(fixturesRoot, sizeMb) {
  const rawPath = path.join(fixturesRoot, `payload-${sizeMb}mb.bin`);
  const zipPath = path.join(fixturesRoot, `prototype-${sizeMb}mb.zip`);
  createRandomFile(rawPath, sizeMb * 1024 * 1024);
  const zip = new AdmZip();
  zip.addFile('index.html', Buffer.from(`<!doctype html><title>phase24-${sizeMb}mb</title>`, 'utf8'));
  zip.addLocalFile(rawPath, 'assets', 'payload.bin');
  zip.writeZip(zipPath);
  fs.rmSync(rawPath, { force: true });
  return { path: zipPath, bytes: fs.statSync(zipPath).size, payloadBytes: sizeMb * 1024 * 1024 };
}

function multipartRequest({ baseUrl, token, filePath, fileName, fields }) {
  return new Promise((resolve, reject) => {
    const boundary = `----fuxi-phase24-${crypto.randomUUID()}`;
    const fileStat = fs.statSync(filePath);
    const chunks = [];
    for (const [name, value] of Object.entries(fields)) {
      chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`, 'utf8'));
    }
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/zip\r\n\r\n`,
      'utf8'
    ));
    const head = Buffer.concat(chunks);
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
    const url = new URL(baseUrl);
    const request = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': head.length + fileStat.size + tail.length
      }
    }, response => {
      const responseChunks = [];
      response.on('data', chunk => responseChunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        body: Buffer.concat(responseChunks).toString('utf8')
      }));
    });
    request.on('error', reject);
    request.write(head);
    fs.createReadStream(filePath)
      .on('error', reject)
      .on('end', () => request.end(tail))
      .pipe(request, { end: false });
  });
}

function getJson(baseUrl, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl);
    const request = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8'))
      }));
    });
    request.on('error', reject);
    request.end();
  });
}

async function measureUpload(upload) {
  const eventLoop = monitorEventLoopDelay({ resolution: 10 });
  let rssPeakBytes = process.memoryUsage().rss;
  const sample = setInterval(() => {
    rssPeakBytes = Math.max(rssPeakBytes, process.memoryUsage().rss);
  }, 5);
  eventLoop.enable();
  const utilizationBefore = performance.eventLoopUtilization();
  const startedAt = performance.now();
  try {
    const response = await upload();
    await new Promise(resolve => setTimeout(resolve, 20));
    return {
      response,
      elapsedMs: performance.now() - startedAt,
      rssPeakMiB: toMiB(rssPeakBytes),
      eventLoopDelayP95Ms: Number((eventLoop.percentile(95) / 1e6).toFixed(2)),
      eventLoopDelayMaxMs: Number((eventLoop.max / 1e6).toFixed(2)),
      eventLoopUtilization: Number(performance.eventLoopUtilization(utilizationBefore).utilization.toFixed(4))
    };
  } finally {
    clearInterval(sample);
    eventLoop.disable();
  }
}

function insertPrototype(database, reposRoot, id) {
  const now = new Date().toISOString();
  database.run(
    `INSERT INTO prototypes (id, name, description, entry_file, created_by, created_at, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, id, 'phase24 local upload baseline', 'index.html', 1, now, now, 'uploaded']
  );
  const repoDir = path.join(reposRoot, id);
  fs.mkdirSync(repoDir, { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'index.html'), '<!doctype html><title>baseline</title>', 'utf8');
}

function countVersions(database, prototypeId) {
  return database.queryOne(
    'SELECT COUNT(*) AS count FROM prototype_versions WHERE prototype_id = ?',
    [prototypeId]
  ).count;
}

async function main() {
  const { rounds } = parseOptions(process.argv.slice(2));
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-phase24-local-upload-'));
  const reposRoot = path.join(tempRoot, 'repos');
  const uploadsRoot = path.join(tempRoot, 'uploads');
  const fixturesRoot = path.join(tempRoot, 'fixtures');
  fs.mkdirSync(reposRoot, { recursive: true });
  fs.mkdirSync(uploadsRoot, { recursive: true });
  fs.mkdirSync(fixturesRoot, { recursive: true });
  process.env.FUXI_REPOS_DIR = reposRoot;
  process.env.FUXI_UPLOADS_DIR = uploadsRoot;

  const database = require('../../database/db');
  const { generateToken } = require('../../middleware/auth');
  const { router: prototypeRouter } = require('../../routes/prototypes');
  const express = require('express');
  let server;

  try {
    await database.initDatabase({ path: path.join(tempRoot, 'app.db'), persist: false });
    database.run(
      'INSERT INTO users (id, username, password_hash, nickname, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [1, 'phase24-uploader', 'test-hash', 'phase24 uploader', '["uploader"]', new Date().toISOString()]
    );
    const token = generateToken({ id: 1, username: 'phase24-uploader', role: ['uploader'] });
    const app = express();
    app.use('/api/prototypes', prototypeRouter);
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    const fixtures = new Map(SIZES_MB.map(sizeMb => [sizeMb, createFixtureZip(fixturesRoot, sizeMb)]));
    const measurements = new Map(SIZES_MB.map(sizeMb => [sizeMb, []]));

    for (const sizeMb of SIZES_MB) {
      const fixture = fixtures.get(sizeMb);
      for (let round = 1; round <= rounds; round += 1) {
        const prototypeId = `phase24-${sizeMb}mb-${round}`;
        insertPrototype(database, reposRoot, prototypeId);
        const baseUrl = `http://127.0.0.1:${port}/api/prototypes/${prototypeId}/upload`;
        const beforeVersions = countVersions(database, prototypeId);
        const metric = await measureUpload(() => multipartRequest({
          baseUrl,
          token,
          filePath: fixture.path,
          fileName: path.basename(fixture.path),
          fields: { versionNote: `phase24 ${sizeMb}MB round ${round}`, versionType: 'patch' }
        }));
        assert.equal(metric.response.status, 200, `上传 ${sizeMb}MB/${round} 应成功: ${metric.response.body}`);
        assert.equal(countVersions(database, prototypeId), beforeVersions + 1, '每次成功上传必须写入一个正式版本');
        const readback = await getJson(`http://127.0.0.1:${port}/api/prototypes/${prototypeId}`, token);
        assert.equal(readback.status, 200, '上传后详情回读必须成功');
        assert.equal(readback.body.data.version, beforeVersions + 1, '回读版本号必须匹配本次正式版本写入');
        assert.equal(readback.body.data.entry_file, 'index.html', '回读入口文件必须来自上传 ZIP');
        assert.equal(fs.statSync(path.join(reposRoot, prototypeId, 'assets', 'payload.bin')).size, fixture.payloadBytes);
        measurements.get(sizeMb).push(metric);
      }
    }

    // 真实 multipart 损坏 ZIP：路由应在任何版本写入前拒绝，保留当前内容。
    const failedPrototypeId = 'phase24-invalid-zip';
    insertPrototype(database, reposRoot, failedPrototypeId);
    const invalidZip = path.join(fixturesRoot, 'malformed.zip');
    fs.writeFileSync(invalidZip, 'not a zip', 'utf8');
    const failed = await multipartRequest({
      baseUrl: `http://127.0.0.1:${port}/api/prototypes/${failedPrototypeId}/upload`,
      token,
      filePath: invalidZip,
      fileName: 'malformed.zip',
      fields: { versionNote: 'should fail before version write', versionType: 'patch' }
    });
    assert.equal(failed.status, 400, `损坏 ZIP 必须被拒绝: ${failed.body}`);
    assert.equal(countVersions(database, failedPrototypeId), 0, '失败上传不得留下正式版本半成品');
    assert.match(fs.readFileSync(path.join(reposRoot, failedPrototypeId, 'index.html'), 'utf8'), /baseline/);

    const summary = SIZES_MB.map(sizeMb => {
      const rows = measurements.get(sizeMb);
      const fixture = fixtures.get(sizeMb);
      return {
        payloadMb: sizeMb,
        zipBytes: fixture.bytes,
        rounds: rows.length,
        p50Ms: Number(percentile(rows.map(row => row.elapsedMs), 0.5).toFixed(2)),
        p95Ms: Number(percentile(rows.map(row => row.elapsedMs), 0.95).toFixed(2)),
        maxMs: Number(Math.max(...rows.map(row => row.elapsedMs)).toFixed(2)),
        failures: rows.filter(row => row.response.status !== 200).length,
        sampledRssPeakMiB: Number(Math.max(...rows.map(row => row.rssPeakMiB)).toFixed(2)),
        eventLoopDelayP95Ms: Number(Math.max(...rows.map(row => row.eventLoopDelayP95Ms)).toFixed(2)),
        eventLoopDelayMaxMs: Number(Math.max(...rows.map(row => row.eventLoopDelayMaxMs)).toFixed(2)),
        eventLoopUtilizationMax: Number(Math.max(...rows.map(row => row.eventLoopUtilization)).toFixed(4))
      };
    });
    console.log(JSON.stringify({
      scope: 'local temporary SQLite/Express only; not a 16077 or 16088 acceptance result',
      roundsPerSize: rounds,
      failureCheck: 'malformed ZIP multipart rejected with no formal version row',
      metrics: {
        latency: 'p50/p95/max use nearest-rank milliseconds',
        memory: 'sampledRssPeakMiB is in-process sampled RSS during each request',
        eventLoop: 'monitorEventLoopDelay p95/max and eventLoopUtilization are observability fields, not acceptance thresholds'
      },
      results: summary
    }, null, 2));
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    database.closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
