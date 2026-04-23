const http = require('http');
const fs = require('fs');
const path = require('path');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  // 1. 创建原型
  const createRes = await request({
    hostname: 'localhost',
    port: 3001,
    path: '/api/prototypes',
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  }, JSON.stringify({
    name: '权限校验原型',
    description: 'AuthComponent项目测试',
    githubUrl: ''
  }));
  console.log('Create:', JSON.stringify(createRes, null, 2));

  const id = createRes.data.id;

  // 2. 上传zip
  const zipPath = path.join(__dirname, 'backend', 'uploads', 'auth-test.zip');
  const zipData = fs.readFileSync(zipPath);
  const boundary = '----FormBoundary' + Date.now();
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="auth-test.zip"\r\nContent-Type: application/zip\r\n\r\n`),
    zipData,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);

  const uploadRes = await request({
    hostname: 'localhost',
    port: 3001,
    path: `/api/prototypes/${id}/upload`,
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length
    }
  }, body);
  console.log('Upload:', JSON.stringify(uploadRes, null, 2));

  // 3. 获取详情
  const detailRes = await request({
    hostname: 'localhost',
    port: 3001,
    path: `/api/prototypes/${id}`,
    method: 'GET'
  });
  console.log('Detail name:', detailRes.data.name);
  console.log('Detail desc:', detailRes.data.description);

  // 4. 测试预览HTML
  const previewReq = await new Promise((resolve, reject) => {
    http.get('http://localhost:3001/preview/' + id + '/index.html', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
  console.log('Preview status:', previewReq.status);
  console.log('Preview Content-Type:', previewReq.headers['content-type']);
  console.log('Has base tag:', previewReq.body.includes('<base href='));
  
  // 检查是否有外部CDN链接被错误修改
  const hasUnpkg = previewReq.body.includes('https://unpkg.com');
  console.log('Has unpkg CDN:', hasUnpkg);
  
  // 检查本地路径是否被改为相对路径
  const hasRelativeFavicon = previewReq.body.includes('href="favicon.svg"') || previewReq.body.includes("href='favicon.svg'");
  console.log('Favicon is relative:', hasRelativeFavicon);
}

main().catch(console.error);
