const net = require('net');
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');

// 常见代理软件默认端口（按优先级排序）
// 排除1080等通用端口，避免误检测其他服务
const COMMON_PROXY_PORTS = [7890, 7897, 7898, 10808, 10809, 8123, 9090];

/**
 * 检查端口是否开放
 */
function checkPortOpen(host, port, timeout = 2000) {
  const portNum = parseInt(port, 10);
  if (!portNum || isNaN(portNum) || portNum <= 0 || portNum > 65535) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(portNum, host);
  });
}

/**
 * 尝试读取 Windows 系统代理设置（注册表）
 */
async function getWindowsSystemProxy() {
  try {
    const { execSync } = require('child_process');
    const result = execSync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer',
      { encoding: 'utf-8', windowsHide: true }
    );
    const match = result.match(/ProxyServer\s+REG_SZ\s+(\S+)/);
    if (match) {
      const proxy = match[1].trim();
      // 格式可能是 "127.0.0.1:7890" 或 "http=127.0.0.1:7890;https=127.0.0.1:7890"
      const httpsMatch = proxy.match(/https=(\S+?)(?:;|$)/);
      const httpMatch = proxy.match(/http=(\S+?)(?:;|$)/);
      const simpleMatch = proxy.match(/(\d+\.\d+\.\d+\.\d+):(\d+)/);
      if (httpsMatch) return `http://${httpsMatch[1]}`;
      if (httpMatch) return `http://${httpMatch[1]}`;
      if (simpleMatch) return `http://${simpleMatch[1]}:${simpleMatch[2]}`;
    }
  } catch (e) {
    // 注册表读取失败，忽略
  }
  return null;
}

/**
 * 检测可用代理
 * 优先级：环境变量 > Windows注册表 > 常见端口探测
 */
async function detectProxy() {
  // 1. 环境变量（最高优先级，用户手动指定）
  const envProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY;
  if (envProxy) {
    console.log(`[代理] 使用环境变量代理: ${envProxy}`);
    return envProxy;
  }

  // 2. Windows 系统代理
  const systemProxy = await getWindowsSystemProxy();
  if (systemProxy) {
    const hostMatch = systemProxy.replace(/^http:\/\//, '').match(/([^:]+):(\d+)/);
    if (hostMatch) {
      const isOpen = await checkPortOpen(hostMatch[1], hostMatch[2]);
      if (isOpen) {
        console.log(`[代理] 使用系统代理: ${systemProxy}`);
        return systemProxy;
      }
    }
  }

  // 3. 探测常见代理端口
  for (const port of COMMON_PROXY_PORTS) {
    if (await checkPortOpen('127.0.0.1', port)) {
      const proxyUrl = `http://127.0.0.1:${port}`;
      console.log(`[代理] 自动探测到代理: ${proxyUrl}`);
      return proxyUrl;
    }
  }

  return null;
}

/**
 * 设置全局代理环境变量（git 等工具会自动读取）
 */
function setupEnvProxy(proxyUrl) {
  if (!proxyUrl) return;
  process.env.HTTP_PROXY = proxyUrl;
  process.env.HTTPS_PROXY = proxyUrl;
  // 确保本地请求不走代理
  process.env.NO_PROXY = 'localhost,127.0.0.1';
}

/**
 * 创建支持代理的 HTTPS 请求函数
 */
function createHttpsRequest(proxyUrl) {
  return (options, callback) => {
    const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;
    return https.request({ ...options, agent }, callback);
  };
}

/**
 * 使用代理检查 URL 是否可达
 */
async function checkUrlAccessibleViaProxy(url, proxyUrl, timeout = 10000) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : require('http');
    const options = {
      method: 'HEAD',
      timeout,
    };
    
    if (proxyUrl && url.startsWith('https')) {
      options.agent = new HttpsProxyAgent(proxyUrl);
    }
    
    const req = client.request(url, options, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

module.exports = {
  detectProxy,
  setupEnvProxy,
  createHttpsRequest,
  checkUrlAccessibleViaProxy,
  checkPortOpen
};
