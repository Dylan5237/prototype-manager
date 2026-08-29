<template>
  <div class="usage-dashboard management-page">
    <div class="management-page-head usage-page-head">
      <div class="management-page-title">
        <div class="management-title-line">
          <h1>使用总览</h1>
          <el-tag type="primary" effect="light">版本 A · 闭环健康</el-tag>
        </div>
        <p class="management-description">观察用户从首次使用到原型产出的有效闭环，并比较使用来源与再次使用表现</p>
      </div>
      <div class="management-toolbar usage-toolbar">
        <el-select v-model="filters.period" size="small" class="usage-period" @change="loadData">
          <el-option v-for="item in periodOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="filters.groupId" size="small" class="usage-filter" placeholder="全部用户组" clearable @change="loadData">
          <el-option v-for="group in groups" :key="group.id" :label="group.name" :value="String(group.id)" />
        </el-select>
        <el-select v-model="filters.role" size="small" class="usage-filter" placeholder="全部角色" clearable @change="loadData">
          <el-option label="管理员" value="admin" />
          <el-option label="编辑者" value="uploader" />
          <el-option label="查看者" value="viewer" />
        </el-select>
        <el-select v-model="filters.source" size="small" class="usage-filter" placeholder="全部来源" clearable @change="loadData">
          <el-option label="Web" value="web" />
          <el-option label="MCP" value="mcp" />
          <el-option label="分享链接" value="share" />
          <el-option label="系统" value="system" />
        </el-select>
        <el-button size="small" :loading="loading" @click="loadData">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
      </div>
    </div>

    <div v-if="stats.dataQuality?.isPartial" class="data-quality-tip">
      <el-icon><InfoFilled /></el-icon>
      <span>{{ stats.dataQuality.notes }}</span>
      <span v-if="stats.dataQuality.trackingStartedAt">统一行为记录开始于 {{ formatDate(stats.dataQuality.trackingStartedAt) }}</span>
      <span>已记录 {{ formatNumber(stats.dataQuality.trackedEventCount) }} 条事件<span v-if="stats.dataQuality.failureEventCount">，失败 {{ formatNumber(stats.dataQuality.failureEventCount) }} 条</span></span>
    </div>

    <div v-if="errorMessage" class="usage-error"><el-icon><WarningFilled /></el-icon>{{ errorMessage }}</div>

    <div class="usage-summary-grid">
      <article v-for="card in summaryCards" :key="card.key" class="usage-summary-card">
        <div class="usage-card-label">{{ card.label }}</div>
        <div class="usage-card-value">{{ card.value }}</div>
        <div :class="['usage-card-foot', card.tone ? `is-${card.tone}` : '']">{{ card.foot }}</div>
      </article>
    </div>

    <div class="usage-main-grid">
      <section class="management-panel usage-panel usage-flow-panel">
        <div class="usage-panel-head"><div><h2>有效使用闭环</h2><p>用状态转移看平台在哪一环流失</p></div><el-tag size="small" type="info" effect="plain">创作者路径</el-tag></div>
        <div class="usage-funnel">
          <template v-for="(stage, index) in stats.funnel" :key="stage.key">
            <div class="usage-stage"><span class="usage-stage-index">{{ index + 1 }}</span><span class="usage-stage-label">{{ stage.label }}</span><strong>{{ formatNumber(stage.value) }}</strong></div>
            <el-icon v-if="index < stats.funnel.length - 1" class="usage-funnel-arrow"><ArrowRight /></el-icon>
          </template>
        </div>
      </section>
    </div>

    <div class="usage-secondary-grid">
      <section class="management-panel usage-panel trend-panel">
        <div class="usage-panel-head"><div><h2>有效使用趋势</h2><p>{{ periodLabel }} · 活跃用户 / 版本产出</p></div><div class="usage-legend"><span><i class="legend-dot is-blue"></i>活跃用户</span><span><i class="legend-dot is-teal"></i>有效版本</span></div></div>
        <div v-if="stats.trend.length" class="usage-chart-wrap">
          <svg class="usage-chart" viewBox="0 0 760 230" role="img" aria-label="有效使用趋势图">
            <line v-for="line in chartGrid" :key="line.y" x1="42" :y1="line.y" x2="744" :y2="line.y" class="chart-grid-line" />
            <text v-for="line in chartGrid" :key="`label-${line.y}`" x="4" :y="line.y + 4" class="chart-axis-label">{{ line.value }}</text>
            <polyline :points="chartPoints('activeUsers')" class="chart-line chart-line--blue" /><polyline :points="chartPoints('productiveUsers')" class="chart-line chart-line--teal" />
            <text v-for="tick in chartTicks" :key="tick.label" :x="tick.x" y="222" class="chart-axis-label chart-axis-label--x">{{ tick.label }}</text>
          </svg>
        </div>
        <el-empty v-else description="当前周期暂无趋势数据" :image-size="56" />
      </section>

      <section class="management-panel usage-panel top-prototype-panel">
        <div class="usage-panel-head"><div><h2>活跃原型</h2><p>按访问和有效动作综合排序</p></div><router-link to="/" class="usage-link">查看全部 <el-icon><ArrowRight /></el-icon></router-link></div>
        <div class="top-prototype-list">
          <button v-for="(prototype, index) in stats.topPrototypes.slice(0, 5)" :key="prototype.id" class="top-prototype-row" @click="openPrototype(prototype.id)">
            <span class="prototype-rank">{{ index + 1 }}</span><span class="prototype-copy"><strong>{{ prototype.name }}</strong><small>{{ prototype.creatorName }} · {{ formatDate(prototype.lastActiveAt) }}</small></span><span class="prototype-metrics"><b>{{ formatNumber(prototype.visits) }}</b><small>访问</small></span><span class="prototype-metrics"><b>{{ formatNumber(prototype.versions) }}</b><small>版本</small></span>
          </button>
        </div>
        <el-empty v-if="!stats.topPrototypes.length" description="暂无原型活动数据" :image-size="48" />
      </section>
    </div>

    <div class="usage-analysis-grid">
      <section class="management-panel usage-panel event-breakdown-panel">
        <div class="usage-panel-head"><div><h2>行为分布</h2><p>按有效业务动作统计，不包含单纯登录和打开页面</p></div><el-tag size="small" type="info" effect="plain">{{ formatNumber(summary.totalEvents) }} 次</el-tag></div>
        <div v-if="stats.eventBreakdown?.length" class="event-breakdown-list">
          <div v-for="item in stats.eventBreakdown.slice(0, 8)" :key="item.eventType" class="event-breakdown-row">
            <div class="event-breakdown-copy"><strong>{{ item.label }}</strong><small>{{ item.category }} · {{ item.users }} 人</small></div>
            <div class="event-breakdown-bar"><i :style="{ width: `${(item.count / eventMax) * 100}%` }"></i></div>
            <b>{{ formatNumber(item.count) }}</b>
          </div>
        </div>
        <el-empty v-else description="当前周期暂无行为数据" :image-size="48" />
      </section>

      <section class="management-panel usage-panel active-user-panel">
        <div class="usage-panel-head"><div><h2>活跃用户</h2><p>按有效动作次数排序</p></div><span class="usage-panel-meta">{{ formatNumber(summary.activeUsers) }} 人</span></div>
        <div v-if="stats.activeUsers?.length" class="active-user-list">
          <div v-for="user in stats.activeUsers.slice(0, 6)" :key="user.userId" class="active-user-row">
            <span class="active-user-avatar">{{ (user.nickname || user.username || '?').slice(0, 1).toUpperCase() }}</span>
            <span class="active-user-copy"><strong>{{ user.nickname || user.username }}</strong><small>{{ roleLabel(user.role) }} · 最近 {{ formatDate(user.lastActiveAt) }}</small></span>
            <span class="active-user-count"><b>{{ formatNumber(user.actions) }}</b><small>动作</small></span>
          </div>
        </div>
        <el-empty v-else description="当前周期暂无活跃用户" :image-size="48" />
      </section>
    </div>

    <section class="management-panel usage-panel retention-panel">
      <div class="usage-panel-head"><div><h2>再次使用与来源</h2><p>再次使用 = 注册后至少 24 小时，又完成一次有效业务动作</p></div><span class="usage-panel-meta">{{ formatNumber(summary.returningUsers) }} 名再次使用用户</span></div>
      <div class="retention-content">
        <div class="retention-list">
          <div v-for="item in stats.retention || []" :key="item.days" class="retention-card">
            <span>{{ item.label }}</span><strong>{{ item.rate === null ? '—' : `${item.rate}%` }}</strong><small>{{ item.eligible ? `${item.retained}/${item.eligible} 人` : '等待完整窗口' }}</small>
          </div>
        </div>
        <div class="source-breakdown">
          <span class="source-breakdown-title">有效动作来源</span>
          <div v-if="stats.sourceBreakdown?.length" class="source-chip-list">
            <span v-for="item in stats.sourceBreakdown" :key="item.source" class="source-chip">{{ sourceLabel(item.source) }} {{ formatNumber(item.count) }}</span>
          </div>
          <span v-else class="source-empty">暂无来源数据</span>
        </div>
      </div>
    </section>

    <div class="usage-footer-note"><el-icon><InfoFilled /></el-icon>数据范围：{{ formatDate(stats.period.from) }} 至 {{ formatDate(stats.period.to) }}；有效使用不等同于单纯登录或访问次数。</div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, InfoFilled, Refresh, WarningFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import { getUsageStats } from '../api/admin-usage'
import { getGroups } from '../api/groups'

const router = useRouter()
const loading = ref(false)
const errorMessage = ref('')
const groups = ref([])
const filters = reactive({ period: '30d', groupId: '', role: '', source: '' })
const periodOptions = [{ value: '7d', label: '近 7 天' }, { value: '30d', label: '近 30 天' }, { value: '90d', label: '近 90 天' }]
const stats = ref({ period: { from: '', to: '' }, dataQuality: { isPartial: true, notes: '' }, summary: {}, trend: [], funnel: [], topPrototypes: [], eventBreakdown: [], sourceBreakdown: [], activeUsers: [], retention: [] })
const summary = computed(() => stats.value.summary || {})
const periodLabel = computed(() => periodOptions.find(item => item.value === filters.period)?.label || '统计周期')
const eventMax = computed(() => Math.max(1, ...(stats.value.eventBreakdown || []).map(item => Number(item.count) || 0)))
const summaryCards = computed(() => [
  { key: 'activeUsers', label: '周期内有效使用用户', value: formatNumber(summary.value.activeUsers), foot: compareText(summary.value.activeUsers, summary.value.previousActiveUsers), tone: 'positive' },
  { key: 'returningUsers', label: '再次使用用户', value: formatNumber(summary.value.returningUsers), foot: '周期开始前注册且再次完成有效动作', tone: 'positive' },
  { key: 'activationRate', label: '7 日激活率', value: summary.value.activationRate === null || summary.value.activationRate === undefined ? '—' : `${summary.value.activationRate}%`, foot: summary.value.activationEligible ? `${summary.value.activationActivated}/${summary.value.activationEligible} 个用户已激活` : '等待完整 7 日数据', tone: summary.value.activationEligible ? 'positive' : 'muted' },
  { key: 'productiveUsers', label: '有效产出用户', value: formatNumber(summary.value.productiveUsers), foot: `${formatNumber(summary.value.versions)} 个版本产出`, tone: 'positive' }
])
const chartMax = computed(() => Math.max(1, ...(stats.value.trend || []).flatMap(item => [Number(item.activeUsers) || 0, Number(item.productiveUsers) || 0])))
const chartGrid = computed(() => [0, 1, 2, 3].map(index => ({ y: 184 - index * 48, value: Math.round((chartMax.value * index) / 3) })))
const chartTicks = computed(() => { const trend = stats.value.trend || []; if (!trend.length) return []; const indexes = [...new Set([0, Math.floor((trend.length - 1) / 2), trend.length - 1])]; return indexes.map(index => ({ label: trend[index].date.slice(5), x: xFor(index, trend.length) })) })

function xFor(index, length) { return length <= 1 ? 42 : 42 + (702 * index) / (length - 1) }
function chartPoints(key) { const trend = stats.value.trend || []; return trend.map((item, index) => `${xFor(index, trend.length)},${184 - ((Number(item[key]) || 0) / chartMax.value) * 144}`).join(' ') }
function formatNumber(value) { return Number(value || 0).toLocaleString('zh-CN') }
function formatDate(value) { if (!value) return '—'; const date = new Date(value); if (Number.isNaN(date.getTime())) return '—'; const pad = n => String(n).padStart(2, '0'); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}` }
function compareText(current, previous) { const currentValue = Number(current || 0); const previousValue = Number(previous || 0); if (!previousValue) return '暂无上一周期可比数据'; const change = ((currentValue - previousValue) / previousValue) * 100; return `${change >= 0 ? '↗' : '↘'} ${Math.abs(change).toFixed(1)}% 较上周期` }
function getDateParams() { const days = Number(filters.period.replace('d', '')); const end = new Date(); const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000); return { from: start.toISOString(), to: end.toISOString(), groupId: filters.groupId || undefined, role: filters.role || undefined, source: filters.source || undefined } }
async function loadData() { loading.value = true; errorMessage.value = ''; try { const response = await getUsageStats(getDateParams()); stats.value = response.data.data || stats.value } catch (error) { errorMessage.value = error.response?.data?.message || error.message || '统计数据加载失败'; ElMessage.error(errorMessage.value) } finally { loading.value = false } }
async function loadGroups() { try { const response = await getGroups(); groups.value = response.data.data || [] } catch (error) { groups.value = [] } }
function openPrototype(id) { if (id) router.push(`/prototype/${encodeURIComponent(id)}`) }
function roleLabel(role) { return { admin: '管理员', uploader: '编辑者', viewer: '查看者' }[role] || role || '未知角色' }
function sourceLabel(source) { return { web: 'Web', mcp: 'MCP', share: '分享链接', system: '系统', legacy: '历史事实' }[source] || source }
onMounted(() => { loadGroups(); loadData() })
</script>

<style scoped>
.usage-page-head{align-items:flex-end}.usage-page-head .el-tag{border-radius:6px}.usage-toolbar{gap:8px}.usage-period{width:112px}.usage-filter{width:132px}.data-quality-tip,.usage-error,.usage-footer-note{display:flex;align-items:center;gap:7px;color:#64748b;font-size:12px;line-height:1.5}.data-quality-tip{margin:-4px 0 16px;padding:9px 12px;border:1px solid #bfdbfe;border-radius:8px;background:#eff6ff;color:#1d4ed8}.data-quality-tip span+span{color:#64748b}.usage-error{margin:-4px 0 16px;padding:10px 12px;border:1px solid #fecaca;border-radius:8px;background:#fef2f2;color:#b91c1c}.usage-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:16px}.usage-summary-card{min-height:112px;padding:16px 18px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;box-shadow:0 2px 7px rgba(51,65,85,.05)}.usage-card-label{color:#64748b;font-size:12px}.usage-card-value{margin-top:10px;color:#172033;font-size:28px;font-weight:750;line-height:1}.usage-card-foot{margin-top:10px;color:#64748b;font-size:11px}.usage-card-foot.is-positive{color:#16a34a}.usage-card-foot.is-warning{color:#d97706}.usage-card-foot.is-muted{color:#94a3b8}.usage-main-grid,.usage-secondary-grid{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(320px,.85fr);gap:16px;margin-bottom:16px}.usage-secondary-grid{grid-template-columns:minmax(0,1.35fr) minmax(360px,.95fr)}.usage-analysis-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(340px,.85fr);gap:16px;margin-bottom:16px}.usage-panel{min-width:0;padding:20px}.usage-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}.usage-panel-head h2{margin:0;color:#172033;font-size:16px;line-height:1.4}.usage-panel-head p{margin:4px 0 0;color:#94a3b8;font-size:12px}.usage-panel-meta{color:#64748b;font-size:12px;line-height:24px}.usage-funnel{display:flex;align-items:center;gap:8px;min-height:92px}.usage-stage{display:flex;flex:1 1 0;flex-direction:column;justify-content:center;min-width:0;height:72px;padding:0 14px;overflow:hidden;border-radius:9px;background:linear-gradient(90deg,#eff6ff 0%,#dbeafe 100%)}.usage-stage:nth-of-type(4n){background:linear-gradient(90deg,#e0f2fe 0%,#bfdbfe 100%)}.usage-stage-index{color:#2563eb;font-size:11px}.usage-stage-label{margin-top:2px;overflow:hidden;color:#334155;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.usage-stage strong{margin-top:5px;color:#172033;font-size:20px;line-height:1}.usage-funnel-arrow{flex:0 0 auto;color:#94a3b8}.attention-list,.top-prototype-list,.event-breakdown-list,.active-user-list{display:flex;flex-direction:column;gap:8px}.attention-item,.top-prototype-row{display:flex;align-items:center;width:100%;min-height:54px;padding:8px 10px;border:0;border-radius:8px;background:#f8fafc;color:inherit;text-align:left;cursor:pointer;transition:background-color .16s ease,transform .16s ease}.attention-item:hover,.top-prototype-row:hover{background:#f1f5f9;transform:translateX(2px)}.attention-dot{flex:0 0 auto;width:9px;height:9px;margin-right:10px;border-radius:50%;background:#94a3b8}.attention-dot.is-high{background:#ef4444}.attention-dot.is-medium{background:#f59e0b}.attention-dot.is-low{background:#94a3b8}.attention-copy,.prototype-copy,.event-breakdown-copy,.active-user-copy{display:flex;min-width:0;flex:1 1 auto;flex-direction:column}.attention-copy strong,.prototype-copy strong,.event-breakdown-copy strong,.active-user-copy strong{overflow:hidden;color:#334155;font-size:12px;font-weight:650;text-overflow:ellipsis;white-space:nowrap}.attention-copy small,.prototype-copy small,.event-breakdown-copy small,.active-user-copy small{margin-top:3px;overflow:hidden;color:#94a3b8;font-size:10px;text-overflow:ellipsis;white-space:nowrap}.attention-item>.el-icon{flex:0 0 auto;color:#94a3b8}.usage-chart-wrap{width:100%;height:230px}.usage-chart{width:100%;height:100%;overflow:visible}.chart-grid-line{stroke:#edf1f6;stroke-width:1}.chart-axis-label{fill:#94a3b8;font-size:10px}.chart-axis-label--x{text-anchor:middle}.chart-line{fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.chart-line--blue{stroke:#2563eb}.chart-line--teal{stroke:#14b8a6;stroke-dasharray:5 5}.usage-legend{display:flex;gap:12px;color:#64748b;font-size:11px}.usage-legend span{display:inline-flex;align-items:center;gap:5px}.legend-dot{width:7px;height:7px;border-radius:50%}.legend-dot.is-blue{background:#2563eb}.legend-dot.is-teal{background:#14b8a6}.usage-link{display:inline-flex;align-items:center;gap:2px;color:#2563eb;font-size:12px;text-decoration:none}.top-prototype-row{min-height:58px}.prototype-rank{flex:0 0 24px;color:#94a3b8;font-size:12px;font-weight:700}.prototype-copy{display:flex;min-width:0;flex:1 1 auto;flex-direction:column}.prototype-copy strong{overflow:hidden;color:#334155;font-size:12px;font-weight:650;text-overflow:ellipsis;white-space:nowrap}.prototype-copy small{margin-top:3px;overflow:hidden;color:#94a3b8;font-size:10px;text-overflow:ellipsis;white-space:nowrap}.prototype-metrics{display:flex;flex:0 0 42px;flex-direction:column;align-items:flex-end;margin-left:10px}.prototype-metrics b{color:#334155;font-size:12px}.prototype-metrics small{margin-top:2px;color:#94a3b8;font-size:10px}.event-breakdown-row{display:grid;grid-template-columns:minmax(130px,1fr) minmax(100px,1.5fr) 42px;align-items:center;gap:12px;min-height:38px}.event-breakdown-copy small{font-size:10px}.event-breakdown-bar{height:7px;overflow:hidden;border-radius:999px;background:#edf2f7}.event-breakdown-bar i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#60a5fa,#2563eb)}.event-breakdown-row>b{color:#334155;font-size:12px;text-align:right}.active-user-row{display:flex;align-items:center;min-height:42px;padding:5px 6px;border-radius:8px;background:#f8fafc}.active-user-avatar{display:flex;align-items:center;justify-content:center;flex:0 0 28px;width:28px;height:28px;border-radius:50%;background:#dbeafe;color:#2563eb;font-size:12px;font-weight:700}.active-user-copy{margin-left:9px}.active-user-count{display:flex;flex:0 0 42px;flex-direction:column;align-items:flex-end}.active-user-count b{color:#334155;font-size:12px}.active-user-count small{margin-top:2px;color:#94a3b8;font-size:10px}.retention-panel{margin-bottom:16px}.retention-content{display:grid;grid-template-columns:minmax(0,1fr) minmax(240px,.55fr);align-items:center;gap:24px}.retention-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.retention-card{display:flex;flex-direction:column;min-height:78px;padding:12px 14px;border:1px solid #e2e8f0;border-radius:9px;background:#f8fafc}.retention-card span{color:#64748b;font-size:11px}.retention-card strong{margin-top:8px;color:#172033;font-size:24px;line-height:1}.retention-card small{margin-top:6px;color:#94a3b8;font-size:10px}.source-breakdown{min-width:0;padding-left:20px;border-left:1px solid #e2e8f0}.source-breakdown-title{color:#64748b;font-size:11px}.source-chip-list{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.source-chip{padding:5px 8px;border-radius:999px;background:#eff6ff;color:#2563eb;font-size:11px}.source-empty{display:block;margin-top:10px;color:#94a3b8;font-size:11px}.usage-footer-note{margin:2px 0 4px;color:#94a3b8}@media(max-width:1120px){.usage-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.usage-main-grid,.usage-secondary-grid,.usage-analysis-grid{grid-template-columns:1fr}.usage-page-head{display:block}.usage-toolbar{justify-content:flex-start;margin-top:14px}.retention-content{grid-template-columns:1fr}.source-breakdown{padding:14px 0 0;border-top:1px solid #e2e8f0;border-left:0}}@media(max-width:680px){.usage-summary-grid{grid-template-columns:1fr}.usage-filter,.usage-period{width:100%}.usage-toolbar{display:grid;grid-template-columns:1fr 1fr}.usage-toolbar .el-button{width:100%}.usage-funnel{align-items:stretch;flex-direction:column}.usage-stage{flex:0 0 auto;width:100%}.usage-funnel-arrow{display:none}.usage-panel{padding:15px}.retention-list{grid-template-columns:1fr}.event-breakdown-row{grid-template-columns:minmax(120px,1fr) 80px 36px}}
.usage-main-grid{grid-template-columns:1fr}
</style>
