const http = require('http');

// 测试AuthComponent预览
http.get('http://localhost:3001/preview/moaydmex90r8sn/index.html', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('=== AuthComponent Preview ===');
    console.log('Status:', res.statusCode);
    const baseMatch = data.match(/<base href="([^"]+)"/);
    console.log('Base tag:', baseMatch ? baseMatch[1] : 'not found');
    // CDN不应被修改
    console.log('Has unpkg:', data.includes('https://unpkg.com'));
  });
});
