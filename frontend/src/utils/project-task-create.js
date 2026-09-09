export function versionStrategyCopy(task) {
  if (task?.version_strategy_type === 'custom') return `固定使用 v${task.version_strategy_value}`
  return '由 AI 选择 major、minor 或 patch，平台根据当前版本计算最终版本号'
}

export function buildCreateProjectTaskBody({ binding, title, requirement, responsibleUserId, versionStrategy }) {
  return {
    nodeId: binding.node_id,
    bindingId: binding.id,
    title,
    requirement,
    responsibleUserId,
    versionStrategy
  }
}

export function buildProjectTaskAgentPrompt({
  projectName,
  projectId,
  prototypeName,
  prototypeId,
  menuPath,
  task,
  handoffCode,
  expiresAt
}) {
  const taskId = task?.taskId || task?.id || ''
  return [
    '你是伏羲原型修改 Agent。请严格按 Task v2 完成一次项目绑定修订交付。权威 ID 是 taskId + candidateId，不要使用 prototype_changes / 裸 changeId 写入。',
    '',
    '【任务上下文】',
    `- 项目：${projectName || ''}（${projectId}）`,
    `- 原型：${prototypeName || ''}（${prototypeId}）`,
    `- 菜单路径：${menuPath || '未设置'}`,
    `- 权威任务 ID：taskId=${taskId}`,
    `- 节点：nodeId=${task?.node_id || ''}`,
    `- 绑定：bindingId=${task?.binding_id || ''}`,
    `- 基础版本：v${task?.base_version_number ?? ''}`,
    `- 版本策略：${versionStrategyCopy(task)}`,
    `- 任务码：${handoffCode || '（请先 accept_project_task）'}`,
    `- 任务码有效期：${expiresAt || '—'}`,
    '',
    '【必须执行】',
    '1. 若任务尚未接受，调用 accept_project_task，参数使用 projectId 与 taskId。',
    '2. 使用返回的 sourceDownloadUrl 下载当前正式版本源码；不要凭空重建，也不要调用 checkout_prototype。',
    '3. 在源码上实现修改要求后打包 ZIP，调用 submit_task_candidate；参数必须使用 projectId、taskId。AI 决定版本号时传入 versionType=major、minor 或 patch。',
    '4. 上传后确认存在唯一待审修订（candidateId，status=ready）。是否采用由项目负责人决定，不要自行宣称已上线。',
    '',
    '【修改要求】',
    task?.requirement || ''
  ].join('\n')
}

export async function startBoundProjectTask({
  projectId,
  projectName,
  binding,
  menuPath,
  title,
  requirement,
  versionStrategy,
  responsibleUserId,
  createProjectTask,
  acceptProjectTask
}) {
  if (!binding?.id || !binding.node_id) {
    throw new Error('当前菜单尚未绑定原型')
  }
  if (responsibleUserId == null) {
    throw new Error('缺少任务负责人')
  }
  const created = await createProjectTask(projectId, buildCreateProjectTaskBody({
    binding,
    title,
    requirement,
    responsibleUserId,
    versionStrategy
  }))
  let task = created?.data?.data
  if (!task?.id) throw new Error('创建任务失败')
  let handoffCode = null
  let expiresAt = null
  if (Number(task.responsible?.user_id) === Number(responsibleUserId)) {
    const accepted = await acceptProjectTask(projectId, task.id)
    const payload = accepted?.data?.data || {}
    task = payload.task || task
    handoffCode = payload.handoffCode || null
    expiresAt = payload.expiresAt || null
  }
  return {
    task,
    taskId: task.taskId || task.id,
    handoffCode,
    expiresAt,
    prompt: buildProjectTaskAgentPrompt({
      projectName,
      projectId,
      prototypeName: binding.prototype_name,
      prototypeId: binding.prototype_id,
      menuPath: menuPath || binding.menu_path,
      task,
      handoffCode,
      expiresAt
    })
  }
}
