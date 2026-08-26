const EVENT_DEFINITIONS = Object.freeze({
  login_success: { label: '登录成功', category: '访问', effective: false },
  login_failed: { label: '登录失败', category: '访问', effective: false },
  user_registered: { label: '注册用户', category: '访问', effective: false },
  mcp_connected: { label: 'MCP 接入', category: '接入', effective: true },
  prototype_opened: { label: '打开原型', category: '访问', effective: false },
  prototype_previewed: { label: '预览原型', category: '使用', effective: true },
  prototype_created: { label: '创建原型', category: '产出', effective: true },
  prototype_updated: { label: '更新原型', category: '产出', effective: true },
  prototype_deleted: { label: '删除原型', category: '管理', effective: true },
  prototype_restored: { label: '恢复原型', category: '管理', effective: true },
  prototype_hard_deleted: { label: '彻底删除原型', category: '管理', effective: true },
  prototype_downloaded: { label: '下载原型', category: '交付', effective: true },
  prototype_shared: { label: '分享原型', category: '交付', effective: true },
  prototype_share_revoked: { label: '取消分享', category: '交付', effective: true },
  version_created: { label: '创建版本', category: '产出', effective: true },
  version_rollback: { label: '回滚版本', category: '产出', effective: true },
  version_deleted: { label: '删除版本', category: '管理', effective: true },
  version_updated: { label: '更新版本说明', category: '管理', effective: true },
  project_opened: { label: '打开项目', category: '访问', effective: false },
  project_created: { label: '创建项目', category: '产出', effective: true },
  project_updated: { label: '更新项目', category: '产出', effective: true },
  project_deleted: { label: '删除项目', category: '管理', effective: true },
  project_prototype_bound: { label: '绑定原型', category: '协作', effective: true },
  project_prototype_unbound: { label: '解绑原型', category: '协作', effective: true },
  project_member_added: { label: '添加项目成员', category: '协作', effective: true },
  project_member_removed: { label: '移除项目成员', category: '协作', effective: true },
  checkout_created: { label: '签出模块', category: '协作', effective: true },
  checkin_completed: { label: '签入模块', category: '协作', effective: true },
  checkout_released: { label: '释放签出', category: '协作', effective: true },
  snapshot_created: { label: '创建快照', category: '协作', effective: true },
  snapshot_restored: { label: '恢复快照', category: '协作', effective: true },
  snapshot_deleted: { label: '删除快照', category: '协作', effective: true },
  repository_provisioned: { label: '创建协作仓库', category: '协作', effective: true },
  comment_created: { label: '发表评论', category: '反馈', effective: true },
  comment_deleted: { label: '删除评论', category: '反馈', effective: true },
  handoff_redeemed: { label: '领取任务交接', category: '协作', effective: true },
  change_created: { label: '创建修改任务', category: '协作', effective: true },
  change_updated: { label: '更新修改任务', category: '协作', effective: true },
  change_cancelled: { label: '取消修改任务', category: '协作', effective: true },
  preview_validated: { label: '完成预览校验', category: '协作', effective: true },
  candidate_uploaded: { label: '上传候选版本', category: '协作', effective: true },
  candidate_previewed: { label: '预览候选版本', category: '协作', effective: true },
  change_adopted: { label: '采用修改', category: '协作', effective: true },
  change_rejected: { label: '拒绝修改', category: '协作', effective: true },
  admin_usage_viewed: { label: '查看使用总览', category: '管理', effective: false }
});

const ALL_EVENT_TYPES = Object.freeze(Object.keys(EVENT_DEFINITIONS));
const EFFECTIVE_EVENT_TYPES = Object.freeze(
  ALL_EVENT_TYPES.filter(eventType => EVENT_DEFINITIONS[eventType].effective)
);

function getEventDefinition(eventType) {
  return EVENT_DEFINITIONS[eventType] || { label: eventType, category: '其他', effective: false };
}

module.exports = {
  EVENT_DEFINITIONS,
  ALL_EVENT_TYPES,
  EFFECTIVE_EVENT_TYPES,
  getEventDefinition
};
