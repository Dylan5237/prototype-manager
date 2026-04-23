const http = require('http');

// 测试AuthComponent预览
http.get('http://localhost:3001/preview/moay9ovcl16tso/index.html', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Content-Type:', res.headers['content-type']);
    console.log('Has base tag:', data.includes('<base href="/preview/moay9ovcl16tso/">'));
    console.log('--- First 500 chars ---');
    console.log(data.substring(0, 500));
  });
});
