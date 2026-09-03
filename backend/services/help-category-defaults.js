const HELP_CATEGORY_DEFAULTS = [
  {
    slug: 'beginner',
    name: '基础入门',
    description: '第一次使用伏羲平台时需要掌握的基础路径。',
    categoryType: 'general',
    sortOrder: 10
  },
  {
    slug: 'beginner-platform',
    name: '平台操作',
    description: '账号、原型、发布、分享和平台界面操作。',
    categoryType: 'platform',
    parentSlug: 'beginner',
    sortOrder: 10
  },
  {
    slug: 'beginner-ai',
    name: 'AI 原型设计',
    description: '使用 AI 创建和修改第一个可交付原型。',
    categoryType: 'ai_prototype',
    parentSlug: 'beginner',
    sortOrder: 20
  },
  {
    slug: 'beginner-platform-account',
    name: '账号与导航',
    description: '注册登录、顶部导航和帮助中心使用。',
    categoryType: 'platform',
    parentSlug: 'beginner-platform',
    sortOrder: 10
  },
  {
    slug: 'beginner-platform-mcp',
    name: 'MCP 与 Skill 接入',
    description: '把伏羲能力接入已有 AI 工具。',
    categoryType: 'platform',
    parentSlug: 'beginner-platform',
    sortOrder: 20
  },
  {
    slug: 'beginner-ai-create',
    name: '创建第一个原型',
    description: '从需求、规范选择到生成和交付校验。',
    categoryType: 'ai_prototype',
    parentSlug: 'beginner-ai',
    sortOrder: 10
  },
  {
    slug: 'beginner-platform-publish',
    name: '发布与分享',
    description: '预览、版本、发布和分享链接。',
    categoryType: 'platform',
    parentSlug: 'beginner-platform',
    sortOrder: 30
  },
  {
    slug: 'advanced',
    name: '进阶使用',
    description: '面向持续交付、团队协作和质量控制的进阶能力。',
    categoryType: 'general',
    sortOrder: 20
  },
  {
    slug: 'advanced-platform',
    name: '平台操作',
    description: '项目、成员、版本安全和协作管理。',
    categoryType: 'platform',
    parentSlug: 'advanced',
    sortOrder: 10
  },
  {
    slug: 'advanced-ai',
    name: 'AI 原型设计',
    description: 'profile、质量门禁和 AI 修改工作流。',
    categoryType: 'ai_prototype',
    parentSlug: 'advanced',
    sortOrder: 20
  },
  {
    slug: 'advanced-platform-project',
    name: '项目协作',
    description: '项目菜单、成员、签出签入和候选审核。',
    categoryType: 'platform',
    parentSlug: 'advanced-platform',
    sortOrder: 10
  },
  {
    slug: 'advanced-platform-safety',
    name: '版本与安全',
    description: '版本 CAS、快照、恢复和高风险操作边界。',
    categoryType: 'platform',
    parentSlug: 'advanced-platform',
    sortOrder: 20
  },
  {
    slug: 'advanced-ai-quality',
    name: '质量校验与交付',
    description: '构建、静态检查、打包、回读和预览验收。',
    categoryType: 'ai_prototype',
    parentSlug: 'advanced-ai',
    sortOrder: 10
  },
  {
    slug: 'advanced-ai-profile',
    name: '规范与运行时选择',
    description: '选择 prototype spec、runtime profile 和输出模式。',
    categoryType: 'ai_prototype',
    parentSlug: 'advanced-ai',
    sortOrder: 20
  }
];

module.exports = { HELP_CATEGORY_DEFAULTS };
