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

  // 2. 找到最新zip
  const uploadsDir = path.join(__dirname, 'backend', 'uploads');
  const zips = fs.readdirSync(uploadsDir)
    .filter(f => f.startsWith('nvwa-upload-') && f.endsWith('.zip'))
    .map(f => ({ name: f, path: path.join(uploadsDir, f), time: fs.statSync(path.join(uploadsDir, f)).mtime }))
    .sort((a, b) => b.time - a.time);
  
  if (zips.length === 0) {
    console.log('No zip found');
    return;
  }
  
  const zipPath = zips[0].path;
  console.log('Using zip:', zips[0].name);

  // 3. 上传
  const zipData = fs.readFileSync(zipPath);
  const boundary = '----FormBoundary' + Date.now();
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="versionControl.zip"\r\nContent-Type: application/zip\r\n\r\n`),
    zipData,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);

  const uploadRes = await request({
    hostname: 'localhost', port: 3001, path: '/api/prototypes/mob70p9rmbi5xx/upload',
    method: 'POST', headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length
    }
  }, body);
  
  console.log('Upload result:', uploadRes.success, uploadRes.data?.entry_file);
  
  // 4. 验证README
  const readmeRes = await request({
    hostname: 'localhost', port: 3001, path: '/api/prototypes/mob70p9rmbi5xx/readme',
    method: 'GET', headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('README:', readmeRes.success, readmeRes.data ? readmeRes.data.file_path : 'null');
  
  // 5. 清理
  fs.unlinkSync(zipPath);
}

main().catch(console.error);
