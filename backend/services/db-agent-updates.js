const crypto = require('crypto');
const { query, queryOne, run } = require('../database/db');

const ACTIVE_INTENT_STATUSES = ['scheduled', 'running'];
const TERMINAL_INTENT_STATUSES = ['completed', 'rolled_back', 'failed'];

class AgentUpdateError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    this.name = 'AgentUpdateError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function parseManifest(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new AgentUpdateError('INVALID_RELEASE_MANIFEST', '发布清单不是有效 JSON');
  }
}

function validateArtifact(kind, artifact) {
  if (!artifact || typeof artifact !== 'object') {
    throw new AgentUpdateError('INVALID_RELEASE_MANIFEST', `${kind} 制品信息缺失`);
  }
  if (typeof artifact.url !== 'string' || !artifact.url.trim()) {
    throw new AgentUpdateError('INVALID_RELEASE_MANIFEST', `${kind} 制品下载地址缺失`);
  }
  if (!/^[a-f0-9]{64}$/i.test(String(artifact.sha256 || ''))) {
    throw new AgentUpdateError('INVALID_RELEASE_MANIFEST', `${kind} 制品 SHA-256 无效`);
  }
  if (artifact.size !== undefined && (!Number.isInteger(artifact.size) || artifact.size < 0)) {
    throw new AgentUpdateError('INVALID_RELEASE_MANIFEST', `${kind} 制品大小无效`);
  }
}

function normalizeManifest(input) {
  const manifest = input && input.manifest ? input.manifest : input;
  if (!manifest || typeof manifest !== 'object') {
    throw new AgentUpdateError('INVALID_RELEASE_MANIFEST', '发布清单缺失');
  }
  const releaseId = String(manifest.releaseId || '').trim();
  const mcpVersion = String(manifest.mcpVersion || '').trim();
  const skillVersion = String(manifest.skillVersion || '').trim();
  if (!releaseId || !mcpVersion || !skillVersion) {
    throw new AgentUpdateError('INVALID_RELEASE_MANIFEST', 'releaseId、mcpVersion、skillVersion 均不能为空');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/.test(releaseId)) {
    throw new AgentUpdateError('INVALID_RELEASE_MANIFEST', 'releaseId 格式无效');
  }
  const artifacts = manifest.artifacts;
  validateArtifact('MCP', artifacts && artifacts.mcp);
  validateArtifact('Skill', artifacts && artifacts.skill);
  const channel = String(manifest.channel || 'stable');
  if (channel !== 'stable') {
    throw new AgentUpdateError('UNSUPPORTED_RELEASE_CHANNEL', '当前只支持 stable 渠道');
  }
  return {
    releaseId,
    channel,
    mcpVersion,
    skillVersion,
    apiSchemaVersion: manifest.apiSchemaVersion ? String(manifest.apiSchemaVersion) : null,
    minNodeVersion: manifest.minNodeVersion ? String(manifest.minNodeVersion) : null,
    artifacts: {
      mcp: { url: String(artifacts.mcp.url), size: artifacts.mcp.size ?? null, sha256: String(artifacts.mcp.sha256).toLowerCase() },
      skill: { url: String(artifacts.skill.url), size: artifacts.skill.size ?? null, sha256: String(artifacts.skill.sha256).toLowerCase() }
    }
  };
}

function mapRelease(row, includeManifest = true) {
  if (!row) return null;
  const manifest = parseManifest(row.manifest_json);
  return {
    releaseId: row.release_id,
    channel: row.channel,
    mcpVersion: row.mcp_version,
    skillVersion: row.skill_version,
    apiSchemaVersion: row.api_schema_version,
    minNodeVersion: row.min_node_version,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    publishedAt: row.published_at,
    withdrawnAt: row.withdrawn_at,
    ...(includeManifest ? { manifest } : {})
  };
}

function mapSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    deviceLabel: row.device_label,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    mcpVersion: row.mcp_version || null,
    skillVersion: row.skill_version || null,
    runtimeVersion: row.runtime_version || null,
    platform: row.platform || null,
    lastReportedAt: row.last_reported_at || null
  };
}

function getOwnedSession(sessionId, userId) {
  if (!sessionId) throw new AgentUpdateError('SESSION_REQUIRED', 'sessionId 不能为空', 400);
  const row = queryOne(`SELECT * FROM mcp_sessions WHERE id = ?`, [sessionId]);
  if (!row) throw new AgentUpdateError('SESSION_NOT_FOUND', '设备会话不存在', 404);
  if (Number(row.user_id) !== Number(userId)) throw new AgentUpdateError('SESSION_NOT_OWNED', '无权操作该设备会话', 403);
  if (row.revoked_at) throw new AgentUpdateError('SESSION_REVOKED', '设备会话已撤销', 401);
  if (Date.parse(row.expires_at) <= Date.now()) throw new AgentUpdateError('SESSION_EXPIRED', '设备会话已过期', 401);
  return row;
}

function getRelease(releaseId, publishedOnly = false) {
  const row = queryOne(`SELECT * FROM agent_releases WHERE release_id = ?`, [releaseId]);
  if (!row) throw new AgentUpdateError('RELEASE_NOT_FOUND', '发布版本不存在', 404);
  if (publishedOnly && (row.status !== 'published' || row.channel !== 'stable')) {
    throw new AgentUpdateError('RELEASE_UNAVAILABLE', '发布版本当前不可更新', 409);
  }
  return row;
}

function getReleaseInfo(releaseId, publishedOnly = false) {
  return mapRelease(getRelease(releaseId, publishedOnly));
}

function createRelease({ actorUserId, manifest: input }) {
  const manifest = normalizeManifest(input);
  if (queryOne(`SELECT release_id FROM agent_releases WHERE release_id = ?`, [manifest.releaseId])) {
    throw new AgentUpdateError('RELEASE_ALREADY_EXISTS', 'releaseId 已存在', 409);
  }
  const timestamp = nowIso();
  run(
    `INSERT INTO agent_releases (
      release_id, channel, mcp_version, skill_version, api_schema_version,
      min_node_version, manifest_json, status, created_by, created_at, published_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?)`,
    [
      manifest.releaseId,
      manifest.channel,
      manifest.mcpVersion,
      manifest.skillVersion,
      manifest.apiSchemaVersion,
      manifest.minNodeVersion,
      JSON.stringify(manifest),
      actorUserId || null,
      timestamp,
      timestamp
    ]
  );
  return mapRelease(getRelease(manifest.releaseId));
}

function listPublishedReleases({ channel = 'stable' } = {}) {
  return query(
    `SELECT * FROM agent_releases WHERE channel = ? AND status = 'published' ORDER BY published_at DESC`,
    [channel]
  ).map(row => mapRelease(row));
}

function getAvailableUpdates({ userId, sessionId }) {
  const session = getOwnedSession(sessionId, userId);
  const currentMcp = session.mcp_version || null;
  const currentSkill = session.skill_version || null;
  const releases = listPublishedReleases();
  const versionsKnown = Boolean(currentMcp && currentSkill && currentMcp !== 'unknown' && currentSkill !== 'unknown');
  const updates = versionsKnown
    ? releases.filter(release => release.mcpVersion !== currentMcp || release.skillVersion !== currentSkill)
    : [];
  const intents = query(
    `SELECT * FROM agent_update_intents
     WHERE user_id = ? AND session_id = ? AND status IN ('scheduled', 'running')
     ORDER BY requested_at DESC`,
    [userId, sessionId]
  ).map(row => mapIntent(row));
  return {
    session: mapSession(session),
    current: { mcpVersion: currentMcp, skillVersion: currentSkill, versionsKnown },
    updates,
    intents
  };
}

function mapIntent(row, includeManifest = true) {
  if (!row) return null;
  const result = {
    id: row.id,
    userId: row.user_id,
    sessionId: row.session_id,
    releaseId: row.release_id,
    status: row.status,
    requestedAt: row.requested_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    localMcpVersion: row.local_mcp_version,
    localSkillVersion: row.local_skill_version,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    updatedAt: row.updated_at
  };
  if (includeManifest) result.release = mapRelease(getRelease(row.release_id));
  return result;
}

function createUpdateIntent({ userId, sessionId, releaseId }) {
  getOwnedSession(sessionId, userId);
  const release = getRelease(releaseId, true);
  const existing = queryOne(
    `SELECT * FROM agent_update_intents
     WHERE user_id = ? AND session_id = ? AND release_id = ? AND status IN ('scheduled', 'running')
     ORDER BY requested_at DESC LIMIT 1`,
    [userId, sessionId, releaseId]
  );
  if (existing) return { created: false, intent: mapIntent(existing), release: mapRelease(release) };

  const id = crypto.randomUUID();
  const timestamp = nowIso();
  run(
    `INSERT INTO agent_update_intents (
      id, user_id, session_id, release_id, status, requested_at, updated_at
    ) VALUES (?, ?, ?, ?, 'scheduled', ?, ?)`,
    [id, userId, sessionId, releaseId, timestamp, timestamp]
  );
  return { created: true, intent: mapIntent(queryOne(`SELECT * FROM agent_update_intents WHERE id = ?`, [id])), release: mapRelease(release) };
}

function getUpdateIntent({ userId, intentId }) {
  const row = queryOne(`SELECT * FROM agent_update_intents WHERE id = ?`, [intentId]);
  if (!row) throw new AgentUpdateError('UPDATE_INTENT_NOT_FOUND', '更新意图不存在', 404);
  if (Number(row.user_id) !== Number(userId)) throw new AgentUpdateError('UPDATE_INTENT_NOT_OWNED', '无权查看该更新意图', 403);
  return mapIntent(row);
}

function claimUpdateIntent({ userId, sessionId }) {
  const session = getOwnedSession(sessionId, userId);
  let row = queryOne(
    `SELECT * FROM agent_update_intents
     WHERE user_id = ? AND session_id = ? AND status = 'running'
     ORDER BY started_at DESC LIMIT 1`,
    [userId, sessionId]
  );
  if (!row) {
    row = queryOne(
      `SELECT * FROM agent_update_intents
       WHERE user_id = ? AND session_id = ? AND status = 'scheduled'
       ORDER BY requested_at ASC LIMIT 1`,
      [userId, sessionId]
    );
    if (!row) return { claimed: false, session: mapSession(session), intent: null };
    const timestamp = nowIso();
    run(`UPDATE agent_update_intents SET status = 'running', started_at = ?, updated_at = ? WHERE id = ? AND status = 'scheduled'`, [timestamp, timestamp, row.id]);
    row = queryOne(`SELECT * FROM agent_update_intents WHERE id = ?`, [row.id]);
  }
  return { claimed: true, session: mapSession(session), intent: mapIntent(row) };
}

function recordUpdateResult({ userId, intentId, status, localMcpVersion, localSkillVersion, errorCode, errorMessage }) {
  if (!TERMINAL_INTENT_STATUSES.includes(status)) {
    throw new AgentUpdateError('INVALID_UPDATE_RESULT', '更新结果状态无效');
  }
  const row = queryOne(`SELECT * FROM agent_update_intents WHERE id = ?`, [intentId]);
  if (!row) throw new AgentUpdateError('UPDATE_INTENT_NOT_FOUND', '更新意图不存在', 404);
  if (Number(row.user_id) !== Number(userId)) throw new AgentUpdateError('UPDATE_INTENT_NOT_OWNED', '无权回报该更新意图', 403);
  if (!ACTIVE_INTENT_STATUSES.includes(row.status)) {
    return mapIntent(row);
  }
  const release = getRelease(row.release_id);
  if (status === 'completed' && (localMcpVersion !== release.mcp_version || localSkillVersion !== release.skill_version)) {
    throw new AgentUpdateError('VERSION_MISMATCH', '完成回报的组件版本与发布版本不一致', 409);
  }
  const timestamp = nowIso();
  run(
    `UPDATE agent_update_intents SET
      status = ?, finished_at = ?, local_mcp_version = ?, local_skill_version = ?,
      error_code = ?, error_message = ?, updated_at = ?
     WHERE id = ?`,
    [status, timestamp, localMcpVersion || null, localSkillVersion || null, errorCode || null, errorMessage || null, timestamp, intentId]
  );
  return mapIntent(queryOne(`SELECT * FROM agent_update_intents WHERE id = ?`, [intentId]));
}

function reportSessionRuntime({ userId, sessionId, mcpVersion, skillVersion, runtimeVersion, platform }) {
  const session = getOwnedSession(sessionId, userId);
  const timestamp = nowIso();
  run(
    `UPDATE mcp_sessions SET
      mcp_version = ?, skill_version = ?, runtime_version = ?, platform = ?,
      last_reported_at = ?, last_used_at = ?
     WHERE id = ?`,
    [mcpVersion || null, skillVersion || null, runtimeVersion || null, platform || null, timestamp, timestamp, sessionId]
  );
  return getAvailableUpdates({ userId, sessionId });
}

module.exports = {
  AgentUpdateError,
  normalizeManifest,
  createRelease,
  getReleaseInfo,
  listPublishedReleases,
  getAvailableUpdates,
  createUpdateIntent,
  getUpdateIntent,
  claimUpdateIntent,
  recordUpdateResult,
  reportSessionRuntime
};
