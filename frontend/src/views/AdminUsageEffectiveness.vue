<template>
  <div class="effectiveness-page management-page" v-loading="loading">
    <header class="effectiveness-head">
      <div>
        <p class="eyebrow">数据分析</p>
        <h1>使用与成效分析</h1>
        <p class="subtitle">从用户覆盖、业务任务、质量表现和效率表现等维度，观察伏羲平台的实际使用成效。</p>
      </div>
      <div class="toolbar">
        <el-radio-group v-model="period" size="small" @change="handlePeriodChange">
          <el-radio-button label="7d">近7天</el-radio-button>
          <el-radio-button label="30d">近30天</el-radio-button>
          <el-radio-button label="custom">自定义</el-radio-button>
        </el-radio-group>
        <el-date-picker v-if="period === 'custom'" v-model="customRange" type="daterange" size="small" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" :clearable="false" @change="loadData" />
        <el-button size="small" :icon="Filter" @click="filterDrawer = true">筛选<span v-if="activeFilterCount">（{{ activeFilterCount }}）</span></el-button>
        <el-button size="small" text @click="methodDrawer = true">数据口径说明</el-button>
        <el-button size="small" type="primary" disabled>导出分析报告</el-button>
      </div>
    </header>

    <div class="trust-note"><el-icon><CircleCheck /></el-icon><span>所有指标均基于平台业务数据和行为日志计算，支持查看计算口径、数据来源及明细记录。</span><small>最近更新 {{ formatDate(data.generatedAt) }}</small></div>
    <el-alert v-if="errorMessage" :title="errorMessage" type="error" :closable="false" show-icon />

    <section class="conclusion-panel management-panel">
      <div><p class="section-kicker">结论摘要</p><h2>{{ conclusion }}</h2></div>
      <span class="period-caption">{{ periodCaption }}</span>
    </section>

    <section class="hero-grid" aria-label="核心指标">
      <article v-for="metric in heroMetrics" :key="metric.label" class="metric-card management-panel">
        <span>{{ metric.label }}</span><strong>{{ metric.value }}</strong><small>{{ metric.note }}</small>
      </article>
    </section>

    <section class="trend-panel management-panel">
      <div class="panel-head"><div><p class="section-kicker">业务使用</p><h2>有效业务任务趋势</h2><small>按完成日期与 task kind 统计；动作事件不会混入任务类型。</small></div><div class="legend"><span class="all">总计</span><span class="create">创建</span><span class="direct">直接变更</span><span class="project">项目任务</span></div></div>
      <div v-if="data.trend.length" class="chart-wrap">
        <svg viewBox="0 0 960 260" role="img" aria-label="有效业务任务趋势图">
          <line v-for="line in chartGrid" :key="line.y" x1="54" :y1="line.y" x2="940" :y2="line.y" class="grid-line" />
          <text v-for="line in chartGrid" :key="`label-${line.y}`" x="8" :y="line.y + 4" class="axis-label">{{ line.value }}</text>
          <polyline v-for="series in chartSeries" :key="series.key" :points="chartPoints(series.key)" :class="['chart-line', `is-${series.key}`]" />
          <text v-for="tick in chartTicks" :key="tick.label" :x="tick.x" y="248" class="axis-label x-label">{{ tick.label }}</text>
        </svg>
        <div class="trend-table" aria-label="趋势数据表">
          <span v-for="point in data.trend" :key="point.date">{{ point.date.slice(5) }}：{{ point.total }}</span>
        </div>
      </div>
      <el-empty v-else description="当前范围暂无有效业务任务" :image-size="64" />
    </section>

    <section class="group-grid">
      <article class="group-card management-panel">
        <div class="panel-head"><div><p class="section-kicker">用户覆盖</p><h2>真实使用人群</h2></div><el-tag effect="plain">已具备</el-tag></div>
        <div class="repeat-summary"><strong>{{ formatNumber(summary.repeatUserCount) }}</strong><span>重复使用用户数</span></div>
        <el-progress :percentage="summary.repeatUserRate || 0" :format="repeatRateLabel" :stroke-width="10" />
        <p class="card-note">重复使用率 = 完成至少 2 个有效任务的用户 / 有效使用用户。</p>
        <div class="empty-evidence"><b>用户有效使用率 / 部门覆盖</b><span>待配置用户范围</span></div>
      </article>

      <article class="group-card management-panel">
        <div class="panel-head"><div><p class="section-kicker">业务使用</p><h2>任务类型分布</h2></div><el-tag effect="plain">{{ formatNumber(summary.attemptCount) }} attempts</el-tag></div>
        <div class="kind-list">
          <div v-for="item in data.kindDistribution" :key="item.kind"><span>{{ kindLabel(item.kind) }}</span><el-progress :percentage="kindPercent(item.count)" :show-text="false" :stroke-width="8" /><b>{{ item.count }}</b></div>
        </div>
        <p class="card-note">平均每任务 {{ summary.averageAttemptsPerTask ?? '—' }} 次 attempt；retry 不增加业务任务数。</p>
      </article>

      <article class="group-card management-panel">
        <div class="panel-head"><div><p class="section-kicker">质量与效率</p><h2>证据尚未完备</h2></div><el-tag type="info" effect="plain">明确空态</el-tag></div>
        <div class="empty-metric-list"><div><b>业务复核通过率 / 准确率</b><span>暂无复核样本</span></div><div><b>平均效率提升 / 人工审核时间</b><span>暂无效率对比样本</span></div><div><b>返工率</b><span>当前日志无法可靠推出</span></div></div>
      </article>
    </section>

    <section class="tasks-panel management-panel">
      <div class="panel-head"><div><p class="section-kicker">证据入口</p><h2>最近业务任务</h2><small>展开任务可查看真实 attempt 明细。</small></div><el-button size="small" :icon="Refresh" @click="loadData">刷新</el-button></div>
      <el-table :data="data.recentTasks" empty-text="当前范围暂无有效业务任务">
        <el-table-column type="expand">
          <template #default="scope">
            <div class="attempt-detail">
              <div><b>Task ID</b><code>{{ scope.row.id }}</code><b>Source ref</b><code>{{ scope.row.sourceRef }}</code></div>
              <el-table :data="scope.row.attempts" size="small">
                <el-table-column prop="attemptNo" label="#" width="54" />
                <el-table-column prop="id" label="Attempt ID" min-width="230" />
                <el-table-column prop="operation" label="Operation" min-width="140" />
                <el-table-column prop="status" label="状态" width="100" />
                <el-table-column prop="failureCode" label="失败码" min-width="120" />
              </el-table>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="id" label="Task ID" min-width="210" show-overflow-tooltip />
        <el-table-column label="类型" width="105"><template #default="scope">{{ kindLabel(scope.row.taskKind) }}</template></el-table-column>
        <el-table-column label="Actor" min-width="130"><template #default="scope">{{ scope.row.actor.nickname || scope.row.actor.username || `用户 ${scope.row.actor.userId}` }}</template></el-table-column>
        <el-table-column label="Prototype / Project" min-width="170"><template #default="scope">{{ scope.row.prototypeId || scope.row.projectId || '—' }}</template></el-table-column>
        <el-table-column prop="status" label="状态" width="100" />
        <el-table-column prop="outcome" label="结果" min-width="130" />
        <el-table-column prop="attemptCount" label="Attempts" width="92" />
        <el-table-column prop="source" label="来源" width="90" />
        <el-table-column label="完成时间" min-width="158"><template #default="scope">{{ formatDate(scope.row.completedAt) }}</template></el-table-column>
      </el-table>
    </section>

    <el-drawer v-model="filterDrawer" title="筛选" size="360px">
      <el-form label-position="top">
        <el-form-item label="任务类型"><el-select v-model="filters.taskKind" clearable placeholder="全部类型"><el-option label="创建" value="create" /><el-option label="直接变更" value="direct" /><el-option label="项目任务" value="project" /></el-select></el-form-item>
        <el-form-item label="来源"><el-select v-model="filters.source" clearable placeholder="全部来源"><el-option label="Web" value="web" /><el-option label="MCP" value="mcp" /><el-option label="系统" value="system" /></el-select></el-form-item>
      </el-form>
      <template #footer><el-button @click="resetFilters">重置</el-button><el-button type="primary" @click="applyFilters">应用筛选</el-button></template>
    </el-drawer>

    <el-drawer v-model="methodDrawer" title="数据口径说明" size="460px">
      <div class="method-list">
        <section><h3>时间范围</h3><p>{{ periodCaption }}；按 `completed_at` 归属完成日期，结束时间为开区间。</p></section>
        <section><h3>有效业务任务</h3><p>分子：满足时间与筛选条件的 completed usage task。排除：`is_test=1`、`exclusion_reason` 非空、所有未完成任务。</p></section>
        <section><h3>有效与重复使用用户</h3><p>有效用户为有效任务的 distinct `actor_user_id`；重复用户为范围内有效任务数 ≥ 2 的 actor；重复使用率以前者为分母。</p></section>
        <section><h3>Attempts</h3><p>对有效任务关联的 `usage_task_attempts` 计数；平均值 = attempts / 有效任务，分母为 0 时显示空态。</p></section>
        <section><h3>数据来源</h3><p>`usage_tasks`、`usage_task_attempts`；最近任务保留 task/source/prototype/project/actor/outcome 与 attempt readback。</p></section>
        <section><h3>尚不可计算</h3><p>目标用户与组织分母、质量复核 evidence、效率对照样本尚未冻结，因此覆盖率、部门、准确率、效率、审核时长和返工率不展示数值。</p></section>
        <section><h3>最近更新时间</h3><p>{{ formatDate(data.generatedAt) }}</p></section>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { CircleCheck, Filter, Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import { getUsageEffectiveness } from '../api/admin-usage'

const loading = ref(false)
const errorMessage = ref('')
const period = ref('30d')
const customRange = ref([])
const filterDrawer = ref(false)
const methodDrawer = ref(false)
const filters = reactive({ taskKind: '', source: '' })
const data = ref({ generatedAt: null, period: { from: null, to: null }, summary: {}, kindDistribution: [], trend: [], recentTasks: [] })
const summary = computed(() => data.value.summary || {})
const activeFilterCount = computed(() => [filters.taskKind, filters.source].filter(Boolean).length)
const periodCaption = computed(() => `${formatDateOnly(data.value.period.from)} 至 ${formatDateOnly(data.value.period.to)}`)
const conclusion = computed(() => {
  if (!summary.value.completedTaskCount) return '当前范围暂无可计入的有效业务任务，未使用测试或排除数据补齐指标。'
  return `本期完成 ${formatNumber(summary.value.completedTaskCount)} 个有效业务任务，覆盖 ${formatNumber(summary.value.distinctActorCount)} 名真实使用用户；${formatNumber(summary.value.repeatUserCount)} 人形成重复使用。`
})
const heroMetrics = computed(() => [
  { label: '有效业务任务数', value: formatNumber(summary.value.completedTaskCount), note: '仅 completed 且未被排除的任务' },
  { label: '有效使用用户数', value: formatNumber(summary.value.distinctActorCount), note: '按 actor_user_id 去重' },
  { label: '重复使用用户数', value: formatNumber(summary.value.repeatUserCount), note: '范围内完成至少 2 个有效任务' },
  { label: '重复使用率', value: summary.value.repeatUserRate == null ? '—' : `${summary.value.repeatUserRate}%`, note: summary.value.distinctActorCount ? `${summary.value.repeatUserCount}/${summary.value.distinctActorCount} 人` : '暂无有效用户分母' }
])
const chartSeries = [{ key: 'total' }, { key: 'create' }, { key: 'direct' }, { key: 'project' }]
const chartMax = computed(() => Math.max(1, ...data.value.trend.map(point => Number(point.total) || 0)))
const chartGrid = computed(() => [0, 1, 2, 3, 4].map(index => ({ y: 218 - index * 47, value: Math.round((chartMax.value * index) / 4) })))
const chartTicks = computed(() => { const rows = data.value.trend; if (!rows.length) return []; return [...new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])].map(index => ({ label: rows[index].date.slice(5), x: chartX(index, rows.length) })) })

function chartX(index, length) { return length <= 1 ? 54 : 54 + (886 * index) / (length - 1) }
function chartPoints(key) { return data.value.trend.map((point, index) => `${chartX(index, data.value.trend.length)},${218 - ((Number(point[key]) || 0) / chartMax.value) * 188}`).join(' ') }
function formatNumber(value) { return Number(value || 0).toLocaleString('zh-CN') }
function formatDateOnly(value) { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('zh-CN') }
function formatDate(value) { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false }) }
function kindLabel(kind) { return { create: '创建', direct: '直接变更', project: '项目任务' }[kind] || kind }
function kindPercent(count) { return summary.value.completedTaskCount ? Math.round((Number(count) / summary.value.completedTaskCount) * 100) : 0 }
function repeatRateLabel() { return summary.value.repeatUserRate == null ? '暂无分母' : `${summary.value.repeatUserRate}%` }
function dateParams() { const end = period.value === 'custom' && customRange.value?.[1] ? new Date(customRange.value[1]) : new Date(); end.setHours(23, 59, 59, 999); const start = period.value === 'custom' && customRange.value?.[0] ? new Date(customRange.value[0]) : new Date(end.getTime() - (period.value === '7d' ? 6 : 29) * 86400000); start.setHours(0, 0, 0, 0); return { from: start.toISOString(), to: new Date(end.getTime() + 1).toISOString() } }
async function loadData() { if (period.value === 'custom' && customRange.value.length !== 2) return; loading.value = true; errorMessage.value = ''; try { const response = await getUsageEffectiveness({ ...dateParams(), taskKind: filters.taskKind || undefined, source: filters.source || undefined, recentLimit: 20 }); data.value = response.data.data } catch (error) { errorMessage.value = error.response?.data?.message || error.message || '使用与成效数据加载失败'; ElMessage.error(errorMessage.value) } finally { loading.value = false } }
function handlePeriodChange(value) { if (value !== 'custom') loadData() }
function applyFilters() { filterDrawer.value = false; loadData() }
function resetFilters() { filters.taskKind = ''; filters.source = ''; filterDrawer.value = false; loadData() }
onMounted(loadData)
</script>

<style scoped>
.effectiveness-page{color:#172033}.effectiveness-head{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:18px}.eyebrow,.section-kicker{margin:0 0 6px;color:#2563eb;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.effectiveness-head h1{margin:0;font-size:28px;line-height:1.25}.subtitle{max-width:700px;margin:8px 0 0;color:#64748b;font-size:13px;line-height:1.7}.toolbar{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.trust-note{display:flex;align-items:center;gap:8px;margin-bottom:16px;padding:10px 14px;border:1px solid #bfdbfe;border-radius:10px;background:#eff6ff;color:#1d4ed8;font-size:12px}.trust-note small{margin-left:auto;color:#64748b}.conclusion-panel{display:flex;align-items:center;justify-content:space-between;gap:20px;margin:16px 0;padding:20px 22px;border-left:4px solid #2563eb}.conclusion-panel h2{margin:0;max-width:900px;font-size:17px;line-height:1.6}.period-caption{flex:0 0 auto;color:#64748b;font-size:12px}.hero-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:16px}.metric-card{display:flex;flex-direction:column;min-height:142px;padding:20px}.metric-card span{color:#64748b;font-size:12px}.metric-card strong{margin-top:15px;font-size:34px;line-height:1}.metric-card small{margin-top:auto;padding-top:16px;color:#94a3b8;font-size:11px}.trend-panel,.tasks-panel{margin-bottom:16px;padding:22px}.panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:18px}.panel-head h2{margin:0;font-size:17px}.panel-head small{display:block;margin-top:5px;color:#94a3b8}.legend{display:flex;gap:12px;color:#64748b;font-size:11px}.legend span::before{display:inline-block;width:8px;height:8px;margin-right:5px;border-radius:50%;background:#334155;content:''}.legend .create::before{background:#2563eb}.legend .direct::before{background:#14b8a6}.legend .project::before{background:#f59e0b}.chart-wrap{min-height:280px}.chart-wrap svg{width:100%;height:260px;overflow:visible}.grid-line{stroke:#e8edf4;stroke-width:1}.axis-label{fill:#94a3b8;font-size:10px}.x-label{text-anchor:middle}.chart-line{fill:none;stroke:#334155;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.chart-line.is-create{stroke:#2563eb;stroke-width:2}.chart-line.is-direct{stroke:#14b8a6;stroke-width:2}.chart-line.is-project{stroke:#f59e0b;stroke-width:2}.trend-table{display:flex;flex-wrap:wrap;gap:5px 12px;color:#64748b;font-size:10px}.group-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-bottom:16px}.group-card{min-height:310px;padding:20px}.repeat-summary{display:flex;align-items:baseline;gap:10px;margin:24px 0 16px}.repeat-summary strong{font-size:32px}.repeat-summary span,.card-note{color:#64748b;font-size:11px}.card-note{margin:14px 0;line-height:1.6}.empty-evidence{display:flex;flex-direction:column;gap:5px;margin-top:20px;padding:13px;border-radius:9px;background:#f8fafc}.empty-evidence b,.empty-metric-list b{color:#475569;font-size:12px}.empty-evidence span,.empty-metric-list span{color:#94a3b8;font-size:11px}.kind-list{display:flex;flex-direction:column;gap:18px}.kind-list>div{display:grid;grid-template-columns:72px 1fr 30px;align-items:center;gap:10px;font-size:12px}.kind-list b{text-align:right}.empty-metric-list{display:flex;flex-direction:column;gap:10px}.empty-metric-list>div{display:flex;flex-direction:column;gap:5px;padding:14px;border:1px dashed #cbd5e1;border-radius:9px;background:#f8fafc}.attempt-detail{padding:14px 48px}.attempt-detail>div{display:grid;grid-template-columns:80px 1fr 80px 1fr;gap:8px;margin-bottom:14px}.attempt-detail code{overflow:hidden;color:#475569;font-size:11px;text-overflow:ellipsis}.method-list{display:flex;flex-direction:column;gap:18px}.method-list h3{margin:0 0 6px;font-size:14px}.method-list p{margin:0;color:#64748b;font-size:12px;line-height:1.7}@media(max-width:1180px){.effectiveness-head{display:block}.toolbar{justify-content:flex-start;margin-top:16px}.hero-grid{grid-template-columns:repeat(2,1fr)}.group-grid{grid-template-columns:1fr}.trust-note{align-items:flex-start;flex-wrap:wrap}.trust-note small{width:100%;margin-left:24px}}@media(max-width:680px){.hero-grid{grid-template-columns:1fr}.toolbar{align-items:stretch;flex-direction:column}.conclusion-panel{align-items:flex-start;flex-direction:column}.attempt-detail{padding:10px}.attempt-detail>div{grid-template-columns:1fr}.legend{flex-wrap:wrap}}
</style>
