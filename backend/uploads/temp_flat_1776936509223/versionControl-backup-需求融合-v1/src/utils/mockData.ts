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
