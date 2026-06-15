const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { initDatabase } = require('./database/db');
const { initDefaultAdmin } = require('./services/db-users');
const { migrateFromJson } = require('./routes/prototypes');
const authRoutes = require('./routes/auth');
const { router: prototypeRoutes } = require('./routes/prototypes');
const groupRoutes = require('./routes/groups');
const previewRoutes = require('./routes/preview');
const { initProxy } = require('./services/github');

const app = express();
const PORT = process.env.PORT || 3001;

// 确保目录存在
const dirs = ['uploads', 'data', 'repos'];
dirs.forEach(dir => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

async function startServer() {
  // 初始化代理检测
  await initProxy();
  
  // 初始化数据库
  await initDatabase();
  
  // 初始化默认管理员
  initDefaultAdmin();
  
  // 迁移旧数据（如果存在）
  const oldDataPath = path.join(__dirname, 'data', 'prototypes.json');
  if (fs.existsSync(oldDataPath)) {
    try {
      const oldData = JSON.parse(fs.readFileSync(oldDataPath, 'utf-8'));
      migrateFromJson(oldData);
      fs.renameSync(oldDataPath, oldDataPath + '.backup');
      console.log('[系统] 旧数据已迁移到SQLite');
    } catch (e) {
      console.log('[系统] 旧数据迁移失败:', e.message);
    }
  }
  
  // 中间件
  app.use(cors());
  app.use(express.json());
  
  // API路由
  app.use('/api/auth', authRoutes);
  app.use('/api/groups', groupRoutes);
  app.use('/api/prototypes', prototypeRoutes);
  
  // 静态文件服务 - 用于预览原型
  app.use('/preview', previewRoutes);
  
  // 健康检查
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });
  
  app.listen(PORT, () => {
    console.log(`伏羲元构后端运行在 http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('服务器启动失败:', err);
  process.exit(1);
});
