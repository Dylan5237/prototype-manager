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
  // 1. 登录
  const loginRes = await request({
    hostname: 'localhost', port: 3001, path: '/api/auth/login',
    method: 'POST', headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({ username: 'admin', password: 'admin123' }));
  const token = loginRes.data.token;
  console.log('Logged in as:', loginRes.data.user.username);

  // 2. 查找已有的原型
  const listRes = await request({
    hostname: 'localhost', port: 3001, path: '/api/prototypes',
    method: 'GET', headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('List response:', JSON.stringify(listRes).substring(0, 200));
  
  const prototypes = listRes.data || [];
  let proto = prototypes.find(p => p.name.includes('权限'));
  let protoId;
  
  if (proto) {
    protoId = proto.id;
    console.log('Found existing prototype:', proto.name, protoId);
  } else {
    const createRes = await request({
      hostname: 'localhost', port: 3001, path: '/api/prototypes',
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    }, JSON.stringify({ name: '权限校验原型', description: 'AuthComponent项目（含README）' }));
    protoId = createRes.data.id;
    console.log('Created prototype:', protoId);
  }

  // 3. 上传zip
  const zipPath = path.join(__dirname, 'backend', 'uploads', 'auth-component-with-readme.zip');
  const zipData = fs.readFileSync(zipPath);
  const boundary = '----FormBoundary' + Date.now();
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="auth-component.zip"\r\nContent-Type: application/zip\r\n\r\n`),
    zipData,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);

  const uploadRes = await request({
    hostname: 'localhost', port: 3001, path: `/api/prototypes/${protoId}/upload`,
    method: 'POST', headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length
    }
  }, body);
  console.log('Upload result:', uploadRes.success, uploadRes.data?.entry_file);

  // 4. 验证README
  const readmeRes = await request({
    hostname: 'localhost', port: 3001, path: `/api/prototypes/${protoId}/readme`,
    method: 'GET', headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('README:', readmeRes.success, readmeRes.data ? (readmeRes.data.file_path + ' (' + (readmeRes.data.content?.length || 0) + ' chars)') : 'null');
}

main().catch(console.error);
