// 门诊处方实体 - Base 版本
const outpatientPrescriptionBase = {
  id: 'ent-outpatient-prescription',
  code: 'OutpatientPrescription',
  name: '门诊处方',
  description: '记录处方信息',
  extend: '标准记录实体',
  buildName: 'OutpatientPrescription',
  refEntity: '-',
  refMode: '一对多',
  recursive: false,
  sortable: false,
  enabled: false,
  isSystem: false,
  fields: [
    { id: 'f-presExpDate', code: 'presExpDate', name: '处方到期时间', type: '日期时间', source: '门诊处方记录' },
    { id: 'f-chrDisMedCondDiagCode', code: 'chrDisMedCondDiagCode', name: '慢性病病情诊断代码', type: '中文本', source: '门诊处方记录' },
    { id: 'f-guidanceDoctorCode', code: 'guidanceDoctorCode', name: '指导医生代码', type: '中文本', source: '门诊处方记录' },
    { id: 'f-printTimes', code: 'printTimes', name: '打印次数', type: '整数', source: '门诊处方记录' },
    { id: 'f-presExplain', code: 'presExplain', name: '处方说明', type: '大文本', source: '门诊处方记录' },
    { id: 'f-presNo', code: 'presNo', name: '处方号', type: '中文本', source: '门诊处方记录' },
    { id: 'f-presCreateDate', code: 'presCreateDate', name: '处方开立日期', type: '日期', source: '门诊处方记录' },
    { id: 'f-presId', code: 'presId', name: '处方ID', type: '长整数', source: '重写' },
    { id: 'f-registerNo', code: 'registerNo', name: '挂号号', type: '中文本', source: '门诊处方记录' },
    { id: 'f-status', code: 'status', name: '处方状态', type: '中文本', source: '门诊处方记录' },
    { id: 'f-totalAmount', code: 'totalAmount', name: '总金额', type: '金额', source: '门诊处方记录' },
  ],
};

// 门诊处方实体 - Main 版本
const outpatientPrescriptionMain = {
  ...outpatientPrescriptionBase,
  description: '记录患者门诊处方详细信息', // 修改：实体描述
  fields: [
    // 修改：名称变更
    { ...outpatientPrescriptionBase.fields[0], name: '处方过期时间' },
    outpatientPrescriptionBase.fields[1],
    // 冲突：name 不同
    { ...outpatientPrescriptionBase.fields[2], name: '主管医生代码' },
    // 修改：类型变更
    { ...outpatientPrescriptionBase.fields[3], type: '长整数' },
    outpatientPrescriptionBase.fields[4],
    outpatientPrescriptionBase.fields[5],
    // 删除：presCreateDate 被删除
    // 新增：presId 改为长整数（冲突准备）实际上这里不冲突，Main 没动
    { ...outpatientPrescriptionBase.fields[7] },
    outpatientPrescriptionBase.fields[8],
    // 冲突：status 的 type 和 name 都不同
    { id: 'f-status', code: 'status', name: '开方状态', type: '整数', source: '门诊处方记录' },
    // 修改：source 变更
    { ...outpatientPrescriptionBase.fields[10], source: '费用记录' },
    // 新增：Main 新增字段
    { id: 'f-deptCode', code: 'deptCode', name: '开单科室编码', type: '中文本', source: '门诊科室记录' },
  ],
};

// 门诊处方实体 - Hotfix 版本
const outpatientPrescriptionHotfix = {
  ...outpatientPrescriptionBase,
  // auto：description 变了
  description: '记录门急诊处方信息',
  fields: [
    // 冲突：name 不同
    { ...outpatientPrescriptionBase.fields[0], name: '处方失效日期' },
    outpatientPrescriptionBase.fields[1],
    // 冲突：name 不同
    { ...outpatientPrescriptionBase.fields[2], name: '就诊指导医师编码' },
    // auto：type 变更（Main 也改了，但 Hotfix 没改 printTimes -> 实际上 Hotfix 改一下做 auto）
    { ...outpatientPrescriptionBase.fields[3], type: '整数' }, // 等等，Main 改成 长整数，Hotfix 保持 整数 -> 但 Base 是整数，Main 改了所以 auto 建议 Main。 Hotfix 没改。 这样只有 Main 改。
    // 重新设计：Hotfix 修改 printTimes 的 name
    { ...outpatientPrescriptionBase.fields[3], name: '打印频次' },
    // auto：source 变更
    { ...outpatientPrescriptionBase.fields[4], source: '医嘱说明记录' },
    outpatientPrescriptionBase.fields[5],
    // Hotfix 没删 presCreateDate，Main 删了 -> auto
    outpatientPrescriptionBase.fields[6],
    // 冲突：presId type 变更
    { ...outpatientPrescriptionBase.fields[7], type: '中文本' },
    outpatientPrescriptionBase.fields[8],
    // 冲突：status 的 type 和 name 都不同
    { id: 'f-status', code: 'status', name: '处方执行状态', type: '布尔', source: '门诊处方记录' },
    // auto：totalAmount 被删除
    ...outpatientPrescriptionBase.fields.slice(0, 10).filter(f => f.code !== 'totalAmount'),
    // 新增：Hotfix 新增字段
    { id: 'f-urgentFlag', code: 'urgentFlag', name: '加急标识', type: '布尔', source: '门诊处方记录' },
  ],
};

// 患者信息实体 - 用于新增/删除场景
const patientBase = {
  id: 'ent-patient',
  code: 'Patient',
  name: '患者信息',
  description: '患者基本信息',
  extend: '标准记录实体',
  buildName: 'Patient',
  refEntity: '-',
  refMode: '一对一',
  recursive: false,
  sortable: false,
  enabled: false,
  isSystem: false,
  fields: [
    { id: 'f-name', code: 'name', name: '姓名', type: '中文本', source: '患者登记记录' },
    { id: 'f-age', code: 'age', name: '年龄', type: '整数', source: '患者登记记录' },
    { id: 'f-gender', code: 'gender', name: '性别', type: '中文本', source: '患者登记记录' },
  ],
};

const patientMain = {
  ...patientBase,
  fields: [
    patientBase.fields[0],
    // auto：age 类型修改
    { ...patientBase.fields[1], type: '长整数' },
    patientBase.fields[2],
    // 新增：Main 新增字段
    { id: 'f-phone', code: 'phone', name: '联系电话', type: '中文本', source: '患者登记记录' },
  ],
};

const patientHotfix = {
  ...patientBase,
  fields: [
    patientBase.fields[0],
    patientBase.fields[1],
    // auto：gender 被删除（Hotfix 删除）
    ...patientBase.fields.slice(0, 2),
    // 新增：Hotfix 新增字段（与 Main 新增不同）
    { id: 'f-address', code: 'address', name: '家庭住址', type: '大文本', source: '患者登记记录' },
  ],
};

// 方法配置 - 处方查询
const queryPrescriptionMethodBase = {
  id: 'method-queryPrescription',
  code: 'queryPrescription',
  name: '处方查询',
  bizType: '业务类',
  techType: '分页查询（返回多条）',
  external: false,
  remark: '',
  params: [
    { id: 'p-issueTime', code: 'issueTime', name: '开单时间', dataType: '日期时间', isArray: false, source: '门诊医嘱记录' },
    { id: 'p-drugToxicologyClassCode', code: 'drugToxicologyClassCode', name: '药品毒理分类代码', dataType: '中文本', isArray: false, source: '门诊西成药医嘱记录' },
    { id: 'p-patientId', code: 'patientId', name: '患者ID', dataType: '长整数', isArray: false, source: '门诊医嘱记录' },
    { id: 'p-presClassCode', code: 'presClassCode', name: '处方类别代码', dataType: '中文本', isArray: false, source: '门诊处方记录' },
    { id: 'p-issueDoctorId', code: 'issueDoctorId', name: '开单医生ID', dataType: '长整数', isArray: false, source: '门诊医嘱记录' },
    { id: 'p-rsvKeyContent', code: 'rsvKeyContent', name: '关键词', dataType: '小文本', isArray: false, source: '虚拟参数' },
    { id: 'p-page', code: 'page', name: '分页配置', dataType: '对象', isArray: false, source: '虚拟参数' },
    { id: 'p-orderBys', code: 'orderBys', name: '排序字段', dataType: '对象', isArray: true, source: '虚拟参数' },
  ],
};

const queryPrescriptionMethodMain = {
  ...queryPrescriptionMethodBase,
  // auto：name 修改
  name: '门诊处方查询',
  // auto：techType 修改
  techType: '条件查询（返回单条）',
  params: [
    // auto：name 修改
    { ...queryPrescriptionMethodBase.params[0], name: '开立时间' },
    queryPrescriptionMethodBase.params[1],
    // 冲突：dataType 不同
    { ...queryPrescriptionMethodBase.params[2], dataType: '中文本' },
    queryPrescriptionMethodBase.params[3],
    // auto：删除
    ...queryPrescriptionMethodBase.params.slice(0, 4).filter(p => p.code !== 'issueDoctorId'),
    queryPrescriptionMethodBase.params[5],
    // auto：source 修改
    { ...queryPrescriptionMethodBase.params[6], source: '系统分页对象' },
    queryPrescriptionMethodBase.params[7],
    // 新增：Main 新增
    { id: 'p-deptCode', code: 'deptCode', name: '科室编码', dataType: '中文本', isArray: false, source: '门诊科室记录' },
  ],
};

const queryPrescriptionMethodHotfix = {
  ...queryPrescriptionMethodBase,
  // auto：name 修改（与 Main 不同）
  name: '处方信息查询',
  // auto：external 修改
  external: true,
  params: [
    // 冲突：name 不同
    { ...queryPrescriptionMethodBase.params[0], name: '医嘱开立时间' },
    queryPrescriptionMethodBase.params[1],
    // 冲突：dataType 不同
    { ...queryPrescriptionMethodBase.params[2], dataType: '整数' },
    queryPrescriptionMethodBase.params[3],
    queryPrescriptionMethodBase.params[4],
    queryPrescriptionMethodBase.params[5],
    queryPrescriptionMethodBase.params[6],
    // auto：isArray 修改
    { ...queryPrescriptionMethodBase.params[7], isArray: false },
    // 新增：Hotfix 新增
    { id: 'p-status', code: 'status', name: '处方状态', dataType: '中文本', isArray: false, source: '门诊处方记录' },
  ],
};

// 导出模型
export const baseModel = {
  domainCode: 'HIS-OUTPATIENT',
  domainName: '门诊业务域',
  entities: [
    outpatientPrescriptionBase,
    patientBase,
  ],
  methods: [
    queryPrescriptionMethodBase,
  ],
};

export const mainModel = {
  domainCode: 'HIS-OUTPATIENT',
  domainName: '门诊业务域',
  entities: [
    outpatientPrescriptionMain,
    patientMain,
  ],
  methods: [
    queryPrescriptionMethodMain,
  ],
};

export const hotfixModel = {
  domainCode: 'HIS-OUTPATIENT',
  domainName: '门诊业务域',
  entities: [
    outpatientPrescriptionHotfix,
    patientHotfix,
  ],
  methods: [
    queryPrescriptionMethodHotfix,
  ],
};

// 冲突类型覆盖检查表（用于演示验证）
// 门诊处方：
//   - 冲突：presExpDate.name (三方不同), guidanceDoctorCode.name (三方不同), presId.type (三方不同), status.name+type (三方不同)
//   - auto：description (仅 Hotfix 改), printTimes.name (仅 Hotfix 改), presExplain.source (仅 Hotfix 改), presCreateDate 删除 (仅 Main 删), totalAmount 删除 (仅 Hotfix 删)
//   - 新增：Main 新增 deptCode, Hotfix 新增 urgentFlag
// 患者信息：
//   - auto：age.type (仅 Main 改), gender 删除 (仅 Hotfix 删)
//   - 新增：Main 新增 phone, Hotfix 新增 address
// 处方查询方法：
//   - 冲突：issueTime.name (三方不同), patientId.dataType (三方不同)
//   - auto：name (Main/Hotfix 各自改), techType (仅 Main 改), external (仅 Hotfix 改), issueDoctorId 删除 (仅 Main 删), page.source (仅 Main 改), orderBys.isArray (仅 Hotfix 改)
//   - 新增：Main 新增 deptCode, Hotfix 新增 status

export interface BugFixItem {
  bugNo: string;
  version: string;
  desc: string;
  status: '研发中' | '研发完成' | '已合并';
  operator: string;
  updateTime: string;
}

export const bugFixList: BugFixItem[] = [
  {
    bugNo: 'BUG-2026-0312-003',
    version: 'v2.1.3-bugfix',
    desc: '门诊草药医嘱辅料记录缺失 herbalAssistFlag 字段，导致草药处方打印模板报错',
    status: '研发中',
    operator: '张xx',
    updateTime: '2026-03-12 14:30:00',
  },
  {
    bugNo: 'BUG-2026-0308-002',
    version: 'v2.1.2-bugfix',
    desc: '门诊医嘱发送状态接口与就诊域患者信息实体存在字段冲突（status/patientId），需合并到 main',
    status: '研发完成',
    operator: '李xx',
    updateTime: '2026-03-08 10:15:22',
  },
  {
    bugNo: 'BUG-2026-0225-001',
    version: 'v2.0.5-bugfix',
    desc: '处方查询方法入参 deptCode 类型错误（应为中文本而非整数）',
    status: '已合并',
    operator: '王xx',
    updateTime: '2026-02-25 16:45:10',
  },
];


// ======================
// 需求管理融合数据
// ======================

export interface DemandItem {
  id: string;
  group: string;
  scope: '组内' | '跨组';
  page: string;
  type: '新增' | '优化';
  title: string;
  desc: string;
  priority: 'P0' | 'P1' | 'P2' | '高' | '中' | '低';
  status: string;
  iteration: string;
  bizDomains: string;
  frontend: boolean;
  backend: boolean;
  frontendEstDays: number | string;
  owner: string;
  planTime: string;
  relatedVersion: string;
  creator: string;
  createTime: string;
}

export const demandList: DemandItem[] = [
  // 临床研发组
  { id: 'REQ-2026-015', group: '临床研发组', scope: '组内', page: '门诊医嘱开单', type: '新增', title: '对接特殊药品开单权限', desc: '对接特殊药品开单权限，包括抗菌药、毒精麻、抗肿瘤药等', priority: 'P0', status: '已设计', iteration: '26年2-3月', bizDomains: '权限域', frontend: true, backend: true, frontendEstDays: 0.5, owner: '陈xx', planTime: '2026-03-15', relatedVersion: 'v2.2.0-main', creator: '张xx', createTime: '2026-01-27' },
  { id: 'REQ-2026-016', group: '临床研发组', scope: '组内', page: '门诊医嘱开单', type: '新增', title: '医嘱录入限制校验：患者性别校验', desc: '医嘱校验规则配置及开单对接', priority: 'P0', status: '已设计', iteration: '26年2-3月', bizDomains: '医嘱域', frontend: true, backend: true, frontendEstDays: '待定', owner: '张xx', planTime: '2026-03-15', relatedVersion: 'v2.2.0-main', creator: '张xx', createTime: '2025-12-31' },
  { id: 'REQ-2026-017', group: '临床研发组', scope: '组内', page: '门诊医嘱开单', type: '新增', title: '医嘱流向配置及开单对接', desc: '医嘱流向配置及开单对接', priority: 'P0', status: '提出', iteration: '26年2-3月', bizDomains: '执行域', frontend: false, backend: true, frontendEstDays: '-', owner: '李xx', planTime: '2026-03-20', relatedVersion: '', creator: '陈xx', createTime: '2026-01-30' },
  { id: 'REQ-2026-018', group: '临床研发组', scope: '组内', page: '门诊医嘱开单', type: '新增', title: '复制、粘贴医嘱', desc: '支持复制粘贴医嘱，提升开单效率', priority: 'P2', status: '已设计', iteration: '26年2月', bizDomains: '医嘱域', frontend: true, backend: true, frontendEstDays: 0.5, owner: '陈xx', planTime: '2026-02-28', relatedVersion: 'v2.1.0-main', creator: '张xx', createTime: '2025-12-31' },
  { id: 'REQ-2026-019', group: '临床研发组', scope: '组内', page: '门诊医嘱开单', type: '新增', title: '支持设置处方病种', desc: '门诊全流程模拟演练（门诊医生）支持设置处方病种', priority: 'P0', status: '已设计', iteration: '26年2-3月', bizDomains: '结算域', frontend: true, backend: true, frontendEstDays: '待定', owner: '张xx', planTime: '2026-03-15', relatedVersion: 'v2.2.0-main', creator: '陈xx', createTime: '2026-01-06' },
  { id: 'REQ-2026-020', group: '临床研发组', scope: '组内', page: '门诊医嘱开单', type: '新增', title: '医嘱关联独立皮试流程交互', desc: '医嘱关联独立皮试流程交互，皮试结果回写', priority: 'P0', status: '已设计', iteration: '26年2-3月', bizDomains: '执行域', frontend: true, backend: true, frontendEstDays: '待定', owner: '李xx', planTime: '2026-03-10', relatedVersion: 'v2.2.0-main', creator: '张xx', createTime: '2026-01-15' },
  { id: 'REQ-2026-021', group: '临床研发组', scope: '组内', page: '门诊医嘱开单', type: '新增', title: '支持选择自费标识', desc: '门诊全流程模拟演练支持选择自费标识', priority: 'P0', status: '已设计', iteration: '26年2-3月', bizDomains: '结算域', frontend: true, backend: true, frontendEstDays: 0.5, owner: '陈xx', planTime: '2026-03-15', relatedVersion: 'v2.2.0-main', creator: '陈xx', createTime: '2026-01-06' },
  { id: 'REQ-2026-022', group: '临床研发组', scope: '组内', page: '门诊医嘱开单', type: '新增', title: '外购药开单', desc: '支持外购药开单流程', priority: 'P1', status: '已设计', iteration: '26年2-3月', bizDomains: '药剂域', frontend: true, backend: true, frontendEstDays: 0.5, owner: '张xx', planTime: '2026-03-10', relatedVersion: 'v2.2.0-main', creator: '张xx', createTime: '2026-01-05' },
  { id: 'REQ-2026-023', group: '临床研发组', scope: '组内', page: '门诊医嘱开单', type: '优化', title: '选择项目浮窗支持多选项目', desc: '选择项目浮窗支持多选项目，提升操作效率', priority: 'P1', status: '提出', iteration: '26年2-3月', bizDomains: '医嘱域', frontend: true, backend: false, frontendEstDays: 0.5, owner: '李xx', planTime: '2026-03-25', relatedVersion: '', creator: '陈xx', createTime: '2025-12-31' },
  { id: 'REQ-2026-024', group: '临床研发组', scope: '组内', page: '门诊医嘱开单', type: '优化', title: '医嘱录入表格随着数据增多自动向上滚动', desc: '优化表格交互体验', priority: 'P2', status: '提出', iteration: '26年2-3月', bizDomains: '医嘱域', frontend: true, backend: false, frontendEstDays: 0.5, owner: '陈xx', planTime: '2026-03-25', relatedVersion: '', creator: '陈xx', createTime: '2025-12-31' },

  // 就诊研发组
  { id: 'REQ-2026-030', group: '就诊研发组', scope: '组内', page: '药剂域', type: '新增', title: '自动接单与门诊药剂配置迭代研发', desc: '自动接单与门诊药剂配置迭代研发', priority: '高', status: '已完成', iteration: '26年4月', bizDomains: '药剂域', frontend: true, backend: true, frontendEstDays: 3, owner: '王xx', planTime: '2026-04-07', relatedVersion: 'v2.3.0-main', creator: '郑xx', createTime: '2026-03-20' },
  { id: 'REQ-2026-031', group: '就诊研发组', scope: '组内', page: '就诊域', type: '新增', title: '收入住院管理页面原型设计', desc: '收入住院管理页面原型设计', priority: '高', status: '已完成', iteration: '26年4月', bizDomains: '就诊域', frontend: true, backend: false, frontendEstDays: 2, owner: '郑xx', planTime: '2026-04-07', relatedVersion: 'v2.3.0-main', creator: '郑xx', createTime: '2026-03-22' },
  { id: 'REQ-2026-032', group: '就诊研发组', scope: '组内', page: '就诊域', type: '新增', title: '收入住院服务研发', desc: '收入住院服务研发', priority: '高', status: '开发中', iteration: '26年4月', bizDomains: '就诊域', frontend: true, backend: true, frontendEstDays: 5, owner: '陈xx', planTime: '2026-04-09', relatedVersion: '', creator: '郑xx', createTime: '2026-03-25' },
  { id: 'REQ-2026-033', group: '就诊研发组', scope: '组内', page: '供应链域', type: '新增', title: '滞销药品查询与效期查询', desc: '滞销药品查询，药品效期查询，麻醉、精一盘点分析报告表', priority: '高', status: '已完成', iteration: '26年4月', bizDomains: '供应链域', frontend: true, backend: true, frontendEstDays: 3, owner: '李xx', planTime: '2026-04-09', relatedVersion: 'v2.3.0-main', creator: '王xx', createTime: '2026-03-20' },
  { id: 'REQ-2026-034', group: '就诊研发组', scope: '组内', page: '资源域', type: '新增', title: '医疗活动单元改造研发', desc: '医疗活动单元改造研发', priority: '高', status: '已完成', iteration: '26年4月', bizDomains: '资源域', frontend: true, backend: true, frontendEstDays: 4, owner: '潘xx', planTime: '2026-04-08', relatedVersion: 'v2.3.0-main', creator: '郑xx', createTime: '2026-03-18' },
  { id: 'REQ-2026-035', group: '就诊研发组', scope: '组内', page: '就诊域', type: '新增', title: '门诊配置补充研发', desc: '门诊配置补充研发', priority: '高', status: '开发中', iteration: '26年4月', bizDomains: '就诊域', frontend: true, backend: true, frontendEstDays: 3, owner: '龚xx', planTime: '2026-04-17', relatedVersion: '', creator: '郑xx', createTime: '2026-03-28' },

  // 收费研发组
  { id: 'REQ-2026-040', group: '收费研发组', scope: '组内', page: '门诊退费查询', type: '新增', title: '根据系统科目类别判断退费类型', desc: '根据系统科目类别来判断：值为西药、中成药、中草药为药品，其余为非药品，全选和全不选均为查全部', priority: '高', status: '设计完成', iteration: '26年4月', bizDomains: '收费域', frontend: false, backend: true, frontendEstDays: '-', owner: '吴xx', planTime: '2026-04-10', relatedVersion: '', creator: '陈xx', createTime: '2026-03-15' },
  { id: 'REQ-2026-041', group: '收费研发组', scope: '组内', page: '门诊退费查询', type: '新增', title: '缺少执行科室字段值', desc: '退费查询缺少执行科室字段值', priority: '中', status: '设计完成', iteration: '26年4月', bizDomains: '收费域', frontend: false, backend: true, frontendEstDays: '-', owner: '陈xx', planTime: '2026-04-10', relatedVersion: '', creator: '陈xx', createTime: '2026-03-15' },
  { id: 'REQ-2026-042', group: '收费研发组', scope: '组内', page: '门诊结算查询', type: '新增', title: '发票明细查询', desc: '发票明细查询及发票操作按钮：重打发票、重制发票、补打发票、预览发票', priority: '高', status: '产品验收', iteration: '26年4月', bizDomains: '收费域', frontend: true, backend: true, frontendEstDays: 2, owner: '陈xx', planTime: '2026-04-15', relatedVersion: 'v2.3.0-main', creator: '陈xx', createTime: '2026-03-10' },
  { id: 'REQ-2026-043', group: '收费研发组', scope: '组内', page: '门诊结算查询', type: '新增', title: '冲销结算与重新结算', desc: '冲销结算：冲销发票、冲销结算；重新结算：修改费别重新结算', priority: '高', status: '设计完成', iteration: '26年4月', bizDomains: '收费域', frontend: true, backend: true, frontendEstDays: 3, owner: '陈xx', planTime: '2026-04-12', relatedVersion: '', creator: '陈xx', createTime: '2026-03-12' },

  // 病历研发组
  { id: 'REQ-2026-050', group: '病历研发组', scope: '组内', page: '电子病历', type: '新增', title: '病历结构化模板配置', desc: '病历结构化模板配置，支持自定义段落与字段', priority: 'P0', status: '开发中', iteration: '26年3月', bizDomains: '病历域', frontend: true, backend: true, frontendEstDays: 5, owner: '刘xx', planTime: '2026-03-25', relatedVersion: '', creator: '刘xx', createTime: '2026-02-15' },
  { id: 'REQ-2026-051', group: '病历研发组', scope: '组内', page: '诊断域', type: '优化', title: '诊断编码智能联想补全', desc: '诊断编码输入时支持智能联想与自动补全', priority: 'P1', status: '已设计', iteration: '26年3月', bizDomains: '诊断域', frontend: true, backend: true, frontendEstDays: 2, owner: '黄xx', planTime: '2026-03-20', relatedVersion: 'v2.2.0-main', creator: '黄xx', createTime: '2026-02-10' },
  { id: 'REQ-2026-052', group: '病历研发组', scope: '组内', page: '就诊域', type: '新增', title: '就诊轨迹时间轴展示', desc: '患者就诊轨迹以时间轴形式展示', priority: 'P1', status: '提出', iteration: '26年3月', bizDomains: '就诊域', frontend: true, backend: false, frontendEstDays: 1.5, owner: '赵xx', planTime: '2026-03-30', relatedVersion: '', creator: '赵xx', createTime: '2026-02-20' },

  // 跨组需求
  { id: 'REQ-2026-060', group: '临床研发组', scope: '跨组', page: '门诊医嘱开单', type: '新增', title: '医嘱与收费域联动校验', desc: '医嘱开立时联动收费域进行费用校验，涉及临床与收费两个研发组协作', priority: 'P0', status: '开发中', iteration: '26年2-3月', bizDomains: '医嘱域+收费域', frontend: true, backend: true, frontendEstDays: 2, owner: '陈xx', planTime: '2026-03-18', relatedVersion: 'v2.2.0-main', creator: '张xx', createTime: '2026-01-20' },
  { id: 'REQ-2026-061', group: '就诊研发组', scope: '跨组', page: '就诊域', type: '新增', title: '就诊与病历数据双向同步', desc: '就诊域与电子病历域的数据双向同步，就诊研发组与病历研发组协作', priority: '高', status: '已设计', iteration: '26年4月', bizDomains: '就诊域+病历域', frontend: true, backend: true, frontendEstDays: 4, owner: '郑xx', planTime: '2026-04-15', relatedVersion: 'v2.3.0-main', creator: '郑xx', createTime: '2026-03-20' },
];

