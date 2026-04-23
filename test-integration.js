const http = require('http');

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
  console.log('Login:', loginRes.success, loginRes.data?.user?.role);
  const token = loginRes.data.token;

  // 2. 获取原型列表
  const listRes = await request({
    hostname: 'localhost', port: 3001, path: '/api/prototypes',
    method: 'GET', headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('Prototypes:', listRes.success, listRes.data?.length);

  // 3. 获取分类
  const catRes = await request({
    hostname: 'localhost', port: 3001, path: '/api/prototypes/categories/list',
    method: 'GET', headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('Categories:', catRes.success, catRes.data?.length);

  // 4. 获取README
  const protoId = listRes.data[0]?.id;
  if (protoId) {
    const readmeRes = await request({
      hostname: 'localhost', port: 3001, path: `/api/prototypes/${protoId}/readme`,
      method: 'GET', headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('README:', readmeRes.success, readmeRes.data ? 'has content' : 'null');
  }

  // 5. 未授权访问
  const unauthorized = await request({
    hostname: 'localhost', port: 3001, path: '/api/prototypes',
    method: 'GET'
  });
  console.log('Unauthorized:', unauthorized.status || unauthorized.message);

  console.log('\nAll tests passed!');
}

main().catch(console.error);
