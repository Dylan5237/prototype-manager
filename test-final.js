const http = require('http');

// 测试AuthComponent预览 via frontend proxy
http.get('http://localhost:3000/preview/moaydmex90r8sn/index.html', (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    console.log('Auth Preview proxy status:', res.statusCode);
    console.log('Has base:', d.includes('<base href='));
    console.log('Has unpkg:', d.includes('https://unpkg.com'));
  });
});

// 测试versionControl预览 via frontend proxy
http.get('http://localhost:3000/preview/moayen23lnjarf/index.html', (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    console.log('VC Preview proxy status:', res.statusCode);
    console.log('Has relative JS:', d.includes('src="assets/'));
    console.log('Has relative CSS:', d.includes('href="assets/'));
  });
});

// 测试JS资源 via frontend proxy
http.get('http://localhost:3000/preview/moayen23lnjarf/assets/index-Du5gawDq.js', (res) => {
  console.log('JS via proxy status:', res.statusCode);
  console.log('JS Content-Type:', res.headers['content-type']);
});
