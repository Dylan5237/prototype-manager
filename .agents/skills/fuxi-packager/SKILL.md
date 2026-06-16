# 伏羲打包上传技能 (fuxi-packager)

将指定前端项目打包为ZIP（自动包含README.md），并上传到伏羲原型管理平台。

## 用途

- 快速打包AI生成的原型项目
- 自动识别并包含项目中的README.md作为设计文档
- 一键上传到伏羲平台平台进行管理和预览

## 参数

| 参数 | 说明 | 示例 |
|---|---|---|
| `projectPath` | 项目目录路径 | `AuthComponent`, `versionControl` |
| `prototypeName` | 原型名称（如省略则使用项目目录名） | `权限校验原型` |
| `prototypeDesc` | 原型描述 | `基于Vue3的权限管理组件` |
| `versionNote` | 版本更新说明（业务性描述，可选；不提供时自动从 git 变更生成） | `修复登录页样式，优化表单校验` |
| `categoryId` | 分类ID（可选） | `1` |
| `entryFile` | 入口HTML文件（自动检测，通常无需指定） | `dist/index.html` |

## 使用方式

### 方式一：直接描述（推荐）
直接描述需求即可触发打包上传流程：

```
把 AuthComponent 项目打包上传到伏羲
```

### 方式二：命令行脚本
使用内置脚本直接执行：

```bash
# 基础用法
node .agents/skills/fuxi-packager/pack-and-upload.js <项目路径> [原型名称] [描述] [版本更新说明]

# 示例
node .agents/skills/fuxi-packager/pack-and-upload.js AuthComponent "权限校验原型" "基于Vue3的权限管理组件" "修复登录页样式，优化表单校验"
```

或带详细参数：

```
打包 versionControl 项目，命名为"版本管理系统"，描述"药品版本控制原型"，上传到伏羲
```

## 内置脚本流程

执行时会自动完成以下步骤：

1. **终止开发服务器** — 检测并终止项目关联的 dev server 进程（Vite 5173、webpack 8080 等常见端口），避免文件占用
2. **构建检测** — 如果存在 `package.json` 且有 `build` 脚本，自动执行 `npm run build`
3. **打包ZIP** — 使用 `Compress-Archive` 打包项目目录，自动排除无用文件
4. **登录伏羲平台** — 使用默认账号 `admin / admin123` 获取JWT Token
5. **创建/查找原型** — 按名称查找已有原型，不存在则创建
6. **上传ZIP** — 调用 `/api/prototypes/:id/upload` 上传
7. **验证README** — 确认后端成功提取README到设计文档
8. **清理临时文件** — 删除本地ZIP包

## 打包包含规则

以下文件/目录会被打入 ZIP 包：

| 包含项 | 说明 |
|---|---|
| `dist/` 目录 | 构建产物，部署用 |
| 根目录 `.md` 文件 | README.md、设计文档等 |
| `docs/` 目录下的 `.md` | 文档目录 |
| 其他源码文件 | 无 `dist/` 时的兜底方案 |

以下文件/目录**不会**被打入 ZIP 包：

| 排除项 | 原因 |
|---|---|
| `node_modules/` | 依赖目录，体积过大 |
| `.git/` | 版本控制，与原型无关 |
| `.venv/` | Python 虚拟环境 |
| 根目录下的图片文件（.png/.jpg/.svg 等） | 截图/设计稿，非运行所需 |

## 环境要求

- 伏羲平台默认地址：`http://192.168.2.145`（内网服务器）
- 后端已初始化默认管理员账号 `admin / admin123`
- 支持通过环境变量 `FUXI_API_URL` 自定义平台地址，例如：
  ```bash
  # 切换到其他服务器
  set FUXI_API_URL=http://192.168.2.145
  node pack-and-upload.js AuthComponent

  # 回本地开发环境
  set FUXI_API_URL=http://localhost:3001
  node pack-and-upload.js AuthComponent
  ```

## 示例场景

### 场景1：首次上传新项目
```
把 AuthComponent 打包上传到伏羲，命名为"权限组件原型"
```
→ 终止 dev server → 构建 → 打包 → 创建新原型 → 上传 → 提取README

### 场景2：更新已有原型
```
重新打包 versionControl 并更新到伏羲
```
→ 找到已有"versionControl"原型 → 覆盖上传最新文件 → 更新README

### 场景3：批量上传
```
把当前目录下所有子项目都打包上传到伏羲
```
→ 遍历目录 → 逐个打包上传 → 按目录名命名原型

## 注意事项

- 打包前会自动终止项目关联的开发服务器进程，确保文件不被占用
- 打包时会排除根目录下的文档和图片文件，上传后系统会自动处理嵌套根目录
- 如果项目使用Vite/Webpack，脚本会自动检测并执行 build
- README文件会被系统提取并在"设计文档"Tab中展示
- 如需指定分类，先通过伏羲前端创建分类后获取ID
