#!/usr/bin/env node
'use strict';

// Build a test-environment SQLite from a production snapshot.
// Keep system data (users, groups, categories, projects, memberships, checkouts,
// snapshots) but keep prototypes and all prototype-bound rows only for the named
// username. Soft-deleted prototypes owned by that user are preserved.

const fs = require('fs');
const path = require('path');

function usage() {
  process.stderr.write(
    'usage: node filter-test-data.js <source.db> <target.db> <username> <sql-wasm.js>\n'
  );
  process.exit(2);
}

async function main() {
  const [sourceDb, targetDb, username, sqlWasm] = process.argv.slice(2);
  if (!sourceDb || !targetDb || !username || !sqlWasm) usage();

  const initSqlJs = require(path.resolve(sqlWasm));
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(sourceDb));

  const q = sql => {
    const r = db.exec(sql);
    return r.length ? r[0].values : [];
  };

  const user = q(`SELECT id FROM users WHERE username = '${username.replace(/'/g, "''")}'`);
  if (!user.length) {
    process.stderr.write(`user not found: ${username}\n`);
    process.exit(3);
  }
  const userId = user[0][0];

  const keep = q(`SELECT id FROM prototypes WHERE created_by = ${userId}`).map(r => r[0]);
  if (!keep.length) {
    process.stderr.write(`no prototypes for user ${username}\n`);
    process.exit(4);
  }
  const idList = keep.map(id => `'${id.replace(/'/g, "''")}'`).join(',');

  const prototypeBoundTables = [
    'prototype_versions',
    'prototype_tags',
    'prototype_shares',
    'prototype_visits',
    'comments',
    'readme_cache',
    'share_links',
    'project_prototypes'
  ];
  for (const table of prototypeBoundTables) {
    db.run(`DELETE FROM ${table} WHERE prototype_id NOT IN (${idList})`);
  }
  db.run(`DELETE FROM prototypes WHERE created_by <> ${userId}`);

  // Comment images reference comments; remove images whose comment no longer exists.
  db.run(`DELETE FROM comment_images WHERE comment_id NOT IN (SELECT id FROM comments)`);

  // Device sessions and one-time connect codes are runtime state, not system data.
  db.run(`DELETE FROM mcp_sessions`);
  db.run(`DELETE FROM mcp_connect_codes`);

  fs.mkdirSync(path.dirname(targetDb), { recursive: true });
  fs.writeFileSync(targetDb, Buffer.from(db.export()));
  const keptIds = keep;
  db.close();

  // Emit one prototype id per line on stdout for the caller to copy repos.
  process.stdout.write(keptIds.join('\n') + (keptIds.length ? '\n' : ''));
}

main().catch(err => {
  process.stderr.write((err && err.stack) || String(err));
  process.exit(1);
});
