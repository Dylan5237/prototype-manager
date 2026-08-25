export function buildPrototypePrompt({ requirement, mode, attachmentName, attachmentPath }) {
  const strict = mode === 'implementation-proof'
  const attachment = attachmentName ? [
    '- 附件文件名：' + attachmentName + '；先完整读取，再与文字需求合并；冲突时以文字需求为准。'
  ] : []
  const requirementWithAttachment = [
    requirement?.trim(),
    attachmentName ? '需求附件：' + attachmentName : '',
    attachmentName
      ? '需求附件本地路径：' + (attachmentPath || '未能由浏览器自动读取，请在生成前补充可访问的完整本地路径。')
      : ''
  ].filter(Boolean).join('\n')
  const lines = [
    '请使用已安装的伏羲原型交付能力创建一个新的前端原型。',
    '',
    '【固定模式】',
    '- operation mode: create；必须创建新原型，不得复用、覆盖或更新已有原型。',
    '- outputMode: ' + (strict ? 'implementation-proof（按选定组件规范）' : 'alignment（快速验证）') + '。',
    '- runtime profile: 根据需求、选定 prototype spec 和已有项目证据选择；SkyUI 不是默认依赖，不得隐式安装或选择。',
    '- 只能使用下方需求和附件作为业务来源，不得自行创造业务对象、指标、权限或流程。'
  ]
  lines.push(...attachment)
  lines.push(
    '',
    '【需求】',
    requirementWithAttachment || '请完整读取附件中的需求文档，并将其作为唯一业务需求来源。',
    '',
    '【实现要求】',
    '1. 先读取并确认需求，列出页面、角色、关键交互和可验收结果；不确定项采用最小实现并在完成说明中标注。',
    '2. 使用 Vue 3、Vite 和平台可用组件实现；保持资源路径相对化，禁止写死服务端地址、凭据或长期 token。',
    '3. 覆盖正常、空、加载、禁用、校验失败、错误和成功状态；失败反馈必须说明原因和恢复动作。',
    strict
      ? '4. 编码前核对真实组件文档，输出组件审计表；构建、类型检查、ZIP 内容和预览 Smoke 任一失败都必须停止交付。'
      : '4. 优先实现需求主路径和关键交互，保持范围最小；构建和预览失败必须停止交付。',
    '5. 严格执行 validate_project → pack_project → validate_zip → deliver_project(create)；只能在所有校验通过后创建正式原型。',
    '6. 完成后返回需求摘要、实现页面、交互清单、验证结果、入口文件、版本、预览地址和剩余风险；未知项写 unverified，不得猜测。'
  )
  return lines.join('\n')
}
