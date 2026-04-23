const http = require('http');

// 获取HTML并解析资源
http.get('http://localhost:3001/preview/moaxn4isexrlpx/index.html', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('HTML Content-Type:', res.headers['content-type']);
    console.log('---');
    const scripts = data.match(/src=["']([^"']+)["']/g);
    const styles = data.match(/href=["']([^"']+)["']/g);
    console.log('Scripts:', scripts);
    console.log('Styles:', styles);
  });
});

// 检查JS返回的Content-Type
http.get('http://localhost:3001/preview/moaxn4isexrlpx/assets/index-Du5gawDq.js', (res) => {
  console.log('JS Content-Type:', res.headers['content-type']);
});
