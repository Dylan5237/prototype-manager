const http = require('http');
const fs = require('fs');
const path = require('path');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { resolve(body); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  // 创建原型
  const createRes = await request({
    hostname: 'localhost', port: 3001, path: '/api/prototypes',
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }
  }, JSON.stringify({ name: 'versionControl原型', description: '版本管理系统', githubUrl: '' }));
  console.log('Created:', createRes.data.name);
  const id = createRes.data.id;

  // 上传zip
  const zipPath = path.join(__dirname, 'backend', 'uploads', 'test-prototype.zip');
  const zipData = fs.readFileSync(zipPath);
  const boundary = '----FormBoundary' + Date.now();
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.zip"\r\nContent-Type: application/zip\r\n\r\n`),
    zipData,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  await request({
    hostname: 'localhost', port: 3001, path: `/api/prototypes/${id}/upload`,
    method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length }
  }, body);

  // 测试预览HTML
  const preview = await new Promise((resolve, reject) => {
    http.get(`http://localhost:3001/preview/${id}/index.html`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
  console.log('Preview status:', preview.status);
  
  const baseMatch = preview.body.match(/<base href="([^"]+)"/);
  console.log('Base tag:', baseMatch ? baseMatch[1] : 'not found');
  
  // 检查JS路径
  const hasAbsJs = preview.body.includes('src="/assets/');
  const hasRelJs = preview.body.includes('src="assets/');
  console.log('JS absolute path:', hasAbsJs);
  console.log('JS relative path:', hasRelJs);
  
  // 检查CSS路径
  const hasAbsCss = preview.body.includes('href="/assets/');
  const hasRelCss = preview.body.includes('href="assets/');
  console.log('CSS absolute path:', hasAbsCss);
  console.log('CSS relative path:', hasRelCss);
  
  // 测试JS资源可访问性
  http.get(`http://localhost:3001/preview/${id}/assets/index-Du5gawDq.js`, (res) => {
    console.log('JS resource status:', res.statusCode);
    console.log('JS Content-Type:', res.headers['content-type']);
  });
  
  // 测试CSS资源可访问性
  http.get(`http://localhost:3001/preview/${id}/assets/index-DStVwvTw.css`, (res) => {
    console.log('CSS resource status:', res.statusCode);
  });
}

main().catch(console.error);
