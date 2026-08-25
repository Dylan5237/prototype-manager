const { query, queryOne } = require('../database/db');

const MEANINGFUL_EVENTS = [
  'prototype_previewed',
  'prototype_created',
  'prototype_updated',
  'version_created',
  'prototype_shared',
  'project_created',
  'release_created',
  'mcp_connected'
];

const PRODUCTIVE_EVENTS = new Set(['version_created', 'release_created']);

function clampDate(value, fallback) {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function getDateRange({ from, to } = {}) {
  const now = new Date();
  const end = clampDate(to, now);
  const start = clampDate(from, new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000));
  if (start >= end) throw new Error('统计开始时间必须早于结束时间');
  const maxDays = 366;
  if ((end - start) / (24 * 60 * 60 * 1000) > maxDays) throw new Error('统计周期不能超过366天');
  const previousEnd = start;
  const previousStart = new Date(start.getTime() - (end - start));
  return {
    start,
    end,
    previousStart,
    previousEnd,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    previousStartIso: previousStart.toISOString(),
    previousEndIso: previousEnd.toISOString()
  };
}

function parseRoles(value) {
  if (!value) return ['viewer'];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [String(value)];
  } catch (e) {
    return [String(value)];
  }
}

function getFilteredUserIds({ role, groupId, includeGuest = false } = {}) {
  const users = query(`SELECT id, username, role FROM users ORDER BY id`);
  const members = groupId
    ? new Set(query(`SELECT user_id FROM user_group_members WHERE group_id = ?`, [Number(groupId)]).map(row => Number(row.user_id)))
    : null;
  return users
    .filter(user => includeGuest || user.username !== 'user')
    .filter(user => !role || parseRoles(user.role).includes(String(role)))
    .filter(user => !members || members.has(Number(user.id)))
    .map(user => Number(user.id));
}

function filterRowsByUsers(rows, userIds) {
  const allowed = new Set(userIds);
  return rows.filter(row => row.user_id !== null && allowed.has(Number(row.user_id)));
}

function getActivityRows({ startIso, endIso, userIds, source } = {}) {
  const rows = [];
  const eventSourceClause = source ? ` AND source = '${String(source).replace(/'/g, "''")}'` : '';
  const trackingStartedAt = queryOne(`SELECT MIN(occurred_at) AS started_at FROM usage_events`)?.started_at || null;
  const legacyEnd = trackingStartedAt && trackingStartedAt < endIso ? trackingStartedAt : endIso;
  rows.push(...query(`
    SELECT user_id, occurred_at, event_type, resource_type, resource_id, source
    FROM usage_events
    WHERE occurred_at >= ? AND occurred_at < ?
      AND result = 'success'
      AND event_type IN (${MEANINGFUL_EVENTS.map(() => '?').join(',')})
      ${eventSourceClause}
  `, [startIso, endIso, ...MEANINGFUL_EVENTS]));

  // Legacy facts remain visible after rollout, but do not pretend they have a source.
  if (!source && startIso < legacyEnd) {
    rows.push(...query(`
      SELECT user_id, visited_at AS occurred_at, 'prototype_previewed' AS event_type,
        'prototype' AS resource_type, prototype_id AS resource_id, NULL AS source
      FROM prototype_visits
      WHERE visited_at >= ? AND visited_at < ? AND user_id IS NOT NULL
    `, [startIso, legacyEnd]));
    rows.push(...query(`
      SELECT created_by AS user_id, created_at AS occurred_at, 'prototype_created' AS event_type,
        'prototype' AS resource_type, id AS resource_id, NULL AS source
      FROM prototypes
      WHERE created_at >= ? AND created_at < ? AND deleted_at IS NULL
    `, [startIso, legacyEnd]));
    rows.push(...query(`
      SELECT created_by AS user_id, created_at AS occurred_at, 'version_created' AS event_type,
        'prototype' AS resource_type, prototype_id AS resource_id, NULL AS source
      FROM prototype_versions
      WHERE created_at >= ? AND created_at < ? AND created_by IS NOT NULL
    `, [startIso, legacyEnd]));
    rows.push(...query(`
      SELECT created_by AS user_id, created_at AS occurred_at, 'project_created' AS event_type,
        'project' AS resource_type, id AS resource_id, NULL AS source
      FROM projects
      WHERE created_at >= ? AND created_at < ? AND deleted_at IS NULL
    `, [startIso, legacyEnd]));
  }
  return filterRowsByUsers(rows, userIds);
}

function distinctUserCount(rows) {
  return new Set(rows.map(row => Number(row.user_id)).filter(Number.isFinite)).size;
}

function getNewUsers(startIso, endIso, userIds) {
  const allowed = new Set(userIds);
  return query(`
    SELECT id, username, nickname, role, created_at
    FROM users
    WHERE created_at >= ? AND created_at < ?
    ORDER BY created_at ASC
  `, [startIso, endIso]).filter(row => allowed.has(Number(row.id)));
}

function getActivationRate({ newUsers, activityRows, now = new Date() }) {
  const eligible = newUsers.filter(user => {
    const createdAt = new Date(user.created_at);
    return createdAt.getTime() + 7 * 24 * 60 * 60 * 1000 <= now.getTime();
  });
  if (!eligible.length) return { rate: null, activated: 0, eligible: 0 };
  const activated = new Set();
  const eligibleMap = new Map(eligible.map(user => [Number(user.id), new Date(user.created_at).getTime()]));
  activityRows.forEach(row => {
    const userId = Number(row.user_id);
    const createdAt = eligibleMap.get(userId);
    if (createdAt === undefined) return;
    const occurredAt = new Date(row.occurred_at).getTime();
    if (occurredAt >= createdAt && occurredAt <= createdAt + 7 * 24 * 60 * 60 * 1000) activated.add(userId);
  });
  return {
    rate: Math.round((activated.size / eligible.length) * 1000) / 10,
    activated: activated.size,
    eligible: eligible.length
  };
}

function buildTrend(rows, start, end) {
  const result = [];
  const dayMs = 24 * 60 * 60 * 1000;
  const firstDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  for (let cursor = firstDay; cursor < end; cursor = new Date(cursor.getTime() + dayMs)) {
    const next = new Date(cursor.getTime() + dayMs);
    const dayRows = rows.filter(row => {
      const time = new Date(row.occurred_at).getTime();
      return time >= cursor.getTime() && time < next.getTime();
    });
    result.push({
      date: cursor.toISOString().slice(0, 10),
      activeUsers: distinctUserCount(dayRows),
      productiveUsers: distinctUserCount(dayRows.filter(row => PRODUCTIVE_EVENTS.has(row.event_type))),
      previewVisits: dayRows.filter(row => row.event_type === 'prototype_previewed').length,
      versions: dayRows.filter(row => row.event_type === 'version_created').length
    });
  }
  return result;
}

function getTopPrototypes({ startIso, endIso, rows }) {
  const prototypes = query(`
    SELECT p.id, p.name, p.created_by, u.nickname AS creator_name,
      p.updated_at, p.deleted_at
    FROM prototypes p
    LEFT JOIN users u ON u.id = p.created_by
    WHERE p.deleted_at IS NULL
  `);
  const activity = new Map();
  rows.filter(row => row.resource_type === 'prototype' && row.resource_id).forEach(row => {
    const current = activity.get(String(row.resource_id)) || { visits: 0, versions: 0, actions: 0, lastActiveAt: null };
    if (row.event_type === 'prototype_previewed') current.visits += 1;
    if (row.event_type === 'version_created') current.versions += 1;
    current.actions += 1;
    if (!current.lastActiveAt || row.occurred_at > current.lastActiveAt) current.lastActiveAt = row.occurred_at;
    activity.set(String(row.resource_id), current);
  });
  return prototypes.map(prototype => ({
    id: prototype.id,
    name: prototype.name,
    creatorName: prototype.creator_name || '—',
    visits: activity.get(String(prototype.id))?.visits || 0,
    versions: activity.get(String(prototype.id))?.versions || 0,
    actions: activity.get(String(prototype.id))?.actions || 0,
    lastActiveAt: activity.get(String(prototype.id))?.lastActiveAt || prototype.updated_at
  })).sort((a, b) => (b.visits - a.visits) || (b.actions - a.actions)).slice(0, 10);
}

function getAttentionItems({ start, end }) {
  const items = [];
  const failedBuilds = query(`
    SELECT b.id, b.prototype_id, p.name, b.finished_at, b.status
    FROM prototype_builds b
    LEFT JOIN prototypes p ON p.id = b.prototype_id
    WHERE b.status IN ('failed', 'error')
      AND COALESCE(b.finished_at, b.queued_at) >= ?
    ORDER BY COALESCE(b.finished_at, b.queued_at) DESC
    LIMIT 5
  `, [start.toISOString()]);
  failedBuilds.forEach(row => items.push({
    type: 'build_failed', severity: 'high', title: `${row.name || row.prototype_id} 构建失败`,
    subtitle: row.finished_at || '最近', resourceId: row.prototype_id, action: '查看失败原因'
  }));

  const pendingChanges = query(`
    SELECT c.id, c.prototype_id, p.name, c.status, c.updated_at
    FROM prototype_changes c
    LEFT JOIN prototypes p ON p.id = c.prototype_id
    WHERE c.status IN ('ready', 'preview_pending')
    ORDER BY c.updated_at ASC
    LIMIT 5
  `);
  pendingChanges.forEach(row => items.push({
    type: 'change_pending', severity: row.status === 'preview_pending' ? 'medium' : 'low',
    title: `${row.name || row.prototype_id} 候选待处理`, subtitle: row.updated_at,
    resourceId: row.prototype_id, action: row.status === 'ready' ? '进入审核' : '查看预览'
  }));

  const staleBefore = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const stale = query(`
    SELECT p.id, p.name, p.updated_at
    FROM prototypes p
    WHERE p.deleted_at IS NULL AND p.updated_at < ?
    ORDER BY p.updated_at ASC
    LIMIT 5
  `, [staleBefore]);
  stale.forEach(row => items.push({
    type: 'prototype_stale', severity: 'low', title: `${row.name} 超过 30 天未更新`,
    subtitle: row.updated_at, resourceId: row.id, action: '查看原型'
  }));
  return items.slice(0, 10);
}

function getUsageStats(options = {}) {
  const range = getDateRange(options);
  const userIds = getFilteredUserIds(options);
  const activityRows = getActivityRows({ startIso: range.startIso, endIso: range.endIso, userIds, source: options.source });
  const previousRows = getActivityRows({ startIso: range.previousStartIso, endIso: range.previousEndIso, userIds, source: options.source });
  const newUsers = getNewUsers(range.startIso, range.endIso, userIds);
  const activation = getActivationRate({ newUsers, activityRows });
  const previousActiveUsers = distinctUserCount(previousRows);
  const activeUsers = distinctUserCount(activityRows);
  const productiveRows = activityRows.filter(row => PRODUCTIVE_EVENTS.has(row.event_type));
  const activePrototypeIds = new Set(activityRows.filter(row => row.resource_type === 'prototype').map(row => String(row.resource_id)).filter(Boolean));
  const totalUsers = userIds.length;
  const trackingStartedAt = queryOne(`SELECT MIN(occurred_at) AS started_at FROM usage_events`).started_at || null;
  const attentionItems = getAttentionItems({ start: range.start, end: range.end });
  const totalVersions = activityRows.filter(row => row.event_type === 'version_created').length;
  const totalVisits = activityRows.filter(row => row.event_type === 'prototype_previewed').length;
  const currentSessions = queryOne(`
    SELECT COUNT(*) AS count FROM mcp_sessions
    WHERE revoked_at IS NULL AND expires_at > ?
  `, [new Date().toISOString()]);
  return {
    period: {
      from: range.startIso,
      to: range.endIso,
      previousFrom: range.previousStartIso,
      previousTo: range.previousEndIso
    },
    dataQuality: {
      trackingStartedAt,
      isPartial: !trackingStartedAt || new Date(range.startIso) < new Date(trackingStartedAt),
      notes: trackingStartedAt
        ? '访问、原型、版本等历史事实与统一行为事件合并统计；来源筛选只作用于统一行为事件。'
        : '尚无统一行为事件，当前统计仅使用已有业务事实。'
    },
    summary: {
      totalUsers,
      newUsers: newUsers.length,
      activeUsers,
      previousActiveUsers,
      productiveUsers: distinctUserCount(productiveRows),
      activePrototypes: activePrototypeIds.size,
      previewVisits: totalVisits,
      versions: totalVersions,
      pendingItems: attentionItems.length,
      mcpSessions: Number(currentSessions?.count || 0),
      activationRate: activation.rate,
      activationActivated: activation.activated,
      activationEligible: activation.eligible
    },
    trend: buildTrend(activityRows, range.start, range.end),
    funnel: [
      { key: 'first_use', label: '首次有效使用', value: distinctUserCount(activityRows) },
      { key: 'prototype_activity', label: '创建或更新原型', value: distinctUserCount(activityRows.filter(row => ['prototype_created', 'prototype_updated'].includes(row.event_type))) },
      { key: 'productive', label: '形成有效版本', value: distinctUserCount(productiveRows) },
      { key: 'delivery', label: '交付/发布', value: distinctUserCount(activityRows.filter(row => row.event_type === 'release_created')) }
    ],
    topPrototypes: getTopPrototypes({ startIso: range.startIso, endIso: range.endIso, rows: activityRows }),
    attentionItems
  };
}

module.exports = {
  MEANINGFUL_EVENTS,
  getDateRange,
  getUsageStats
};
