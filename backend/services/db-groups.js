const { query, queryOne, run } = require('../database/db');

function getGroups() {
  const groups = query(`
    SELECT g.*, u.nickname as creator_name,
      (SELECT COUNT(*) FROM user_group_members m WHERE m.group_id = g.id) as member_count
    FROM user_groups g
    LEFT JOIN users u ON g.created_by = u.id
    ORDER BY g.created_at DESC
  `);
  if (groups.length === 0) return groups;

  const groupIds = groups.map(g => g.id);
  const placeholders = groupIds.map(() => '?').join(',');
  const members = query(`
    SELECT m.group_id, u.id as user_id, u.nickname, u.username
    FROM user_group_members m
    JOIN users u ON u.id = m.user_id
    WHERE m.group_id IN (${placeholders})
    ORDER BY u.nickname, u.username
  `, groupIds);

  const memberMap = {};
  members.forEach(m => {
    if (!memberMap[m.group_id]) memberMap[m.group_id] = [];
    memberMap[m.group_id].push(m);
  });

  return groups.map(g => {
    const list = memberMap[g.id] || [];
    return {
      ...g,
      member_count: list.length,
      member_preview: list.slice(0, 3).map(m => m.nickname || m.username),
      members: list.map(m => ({ user_id: m.user_id, nickname: m.nickname, username: m.username }))
    };
  });
}

function getGroupById(id) {
  const group = queryOne(`
    SELECT g.*, u.nickname as creator_name,
      (SELECT COUNT(*) FROM user_group_members m WHERE m.group_id = g.id) as member_count
    FROM user_groups g
    LEFT JOIN users u ON g.created_by = u.id
    WHERE g.id = ?
  `, [id]);
  if (!group) return null;
  group.members = query(`
    SELECT m.user_id, u.username, u.nickname
    FROM user_group_members m
    LEFT JOIN users u ON m.user_id = u.id
    WHERE m.group_id = ?
    ORDER BY u.nickname, u.username
  `, [id]);
  group.member_ids = group.members.map(m => m.user_id);
  return group;
}

function createGroup({ name, description, createdBy, memberIds = [] }) {
  const now = new Date().toISOString();
  run(
    `INSERT INTO user_groups (name, description, created_by, created_at) VALUES (?, ?, ?, ?)`,
    [name, description || '', createdBy, now]
  );
  const group = queryOne(`SELECT id FROM user_groups WHERE name = ?`, [name]);
  const groupId = group.id;
  setGroupMembers(groupId, memberIds);
  return getGroupById(groupId);
}

function updateGroup(id, { name, description, memberIds }) {
  const group = queryOne(`SELECT id FROM user_groups WHERE id = ?`, [id]);
  if (!group) return null;
  run(
    `UPDATE user_groups SET name = ?, description = ? WHERE id = ?`,
    [name, description || '', id]
  );
  if (memberIds !== undefined) {
    setGroupMembers(id, memberIds);
  }
  return getGroupById(id);
}

function deleteGroup(id) {
  run(`DELETE FROM user_groups WHERE id = ?`, [id]);
  return { id };
}

function setGroupMembers(groupId, memberIds) {
  run(`DELETE FROM user_group_members WHERE group_id = ?`, [groupId]);
  const now = new Date().toISOString();
  const uniqueIds = Array.from(new Set(memberIds || []));
  uniqueIds.forEach(userId => {
    run(
      `INSERT INTO user_group_members (group_id, user_id, created_at) VALUES (?, ?, ?)`,
      [groupId, userId, now]
    );
  });
}

function getGroupMemberIds(groupId) {
  const rows = query(`SELECT user_id FROM user_group_members WHERE group_id = ?`, [groupId]);
  return rows.map(r => r.user_id);
}

function getUserGroupIds(userId) {
  const rows = query(`SELECT group_id FROM user_group_members WHERE user_id = ?`, [userId]);
  return rows.map(r => r.group_id);
}

module.exports = {
  getGroups,
  getGroupById,
  createGroup,
  updateGroup,
  deleteGroup,
  getGroupMemberIds,
  getUserGroupIds,
  setGroupMembers
};
