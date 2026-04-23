const fs = require('fs');
const path = require('path');
const { saveReadme } = require('./db-prototypes');

function extractReadme(prototypeId) {
  const repoDir = path.join(__dirname, '../repos', prototypeId);
  if (!fs.existsSync(repoDir)) return false;
  
  // 查找README文件，按优先级（支持子目录）
  const candidates = [
    'README.md', 'readme.md', 'README.MD',
    'docs/README.md', 'docs/readme.md',
    'Docs/README.md', 'Docs/readme.md'
  ];
  
  // 先直接查找
  for (const candidate of candidates) {
    const fullPath = path.join(repoDir, candidate);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        if (content.length > 1024 * 1024) {
          console.log(`[README] 原型 ${prototypeId} 的README超过1MB，已截断`);
          saveReadme(prototypeId, {
            content: content.substring(0, 1024 * 1024),
            filePath: candidate
          });
        } else {
          saveReadme(prototypeId, { content, filePath: candidate });
        }
        console.log(`[README] 已提取原型 ${prototypeId} 的README: ${candidate}`);
        return true;
      } catch (e) {
        console.log(`[README] 读取失败 ${candidate}:`, e.message);
      }
    }
  }
  
  // 如果在根目录没找到，在子目录中查找（处理未正确扁平化的zip）
  const items = fs.readdirSync(repoDir, { withFileTypes: true });
  for (const item of items) {
    if (item.isDirectory() && !item.name.startsWith('.')) {
      for (const candidate of candidates) {
        const fullPath = path.join(repoDir, item.name, candidate);
        if (fs.existsSync(fullPath)) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const filePath = `${item.name}/${candidate}`;
            if (content.length > 1024 * 1024) {
              saveReadme(prototypeId, {
                content: content.substring(0, 1024 * 1024),
                filePath
              });
            } else {
              saveReadme(prototypeId, { content, filePath });
            }
            console.log(`[README] 已提取原型 ${prototypeId} 的README: ${filePath}`);
            return true;
          } catch (e) {
            console.log(`[README] 读取失败 ${candidate}:`, e.message);
          }
        }
      }
    }
  }
  
  return false;
}

module.exports = { extractReadme };
