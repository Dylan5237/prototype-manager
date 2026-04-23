const http = require('http');

// 测试HTML预览
http.get('http://localhost:3001/preview/moaxn4isexrlpx/index.html', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('HTML Status:', res.statusCode);
    console.log('Has base tag:', data.includes('<base href='));
    const match = data.match(/<base href="([^"]+)"/);
    console.log('Base path:', match ? match[1] : 'not found');
  });
});

// 测试静态资源
http.get('http://localhost:3001/preview/moaxn4isexrlpx/assets/index-DStVwvTw.css', (res) => {
  console.log('CSS Status:', res.statusCode);
});

http.get('http://localhost:3001/preview/moaxn4isexrlpx/assets/index-Du5gawDq.js', (res) => {
  console.log('JS Status:', res.statusCode);
});
