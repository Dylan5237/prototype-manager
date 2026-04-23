const http = require('http');

http.get('http://localhost:3001/preview/moaxn4isexrlpx/index.html', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Has base tag:', data.includes('<base href='));
    
    // 检查JS路径是否从绝对路径变为相对路径
    const hasAbsoluteJs = data.includes('src="/assets/');
    const hasRelativeJs = data.includes('src="assets/');
    console.log('Has absolute JS path:', hasAbsoluteJs);
    console.log('Has relative JS path:', hasRelativeJs);
    
    // 检查CSS路径
    const hasAbsoluteCss = data.includes('href="/assets/');
    const hasRelativeCss = data.includes('href="assets/');
    console.log('Has absolute CSS path:', hasAbsoluteCss);
    console.log('Has relative CSS path:', hasRelativeCss);
    
    // 检查favicon
    const hasAbsoluteFavicon = data.includes('href="/favicon');
    const hasRelativeFavicon = data.includes('href="favicon');
    console.log('Has absolute favicon:', hasAbsoluteFavicon);
    console.log('Has relative favicon:', hasRelativeFavicon);
    
    // 外部CDN不应被修改
    const hasHttpLink = data.includes('href="http');
    console.log('Has external http link:', hasHttpLink);
  });
});

// 测试JS资源是否能正常访问
http.get('http://localhost:3001/preview/moaxn4isexrlpx/assets/index-Du5gawDq.js', (res) => {
  console.log('JS Resource Status:', res.statusCode);
  console.log('JS Content-Type:', res.headers['content-type']);
});
