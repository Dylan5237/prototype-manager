'use strict';

const database = require('../../database/db');

function send(message) {
  if (process.send) process.send(message);
}

async function main() {
  const [operation, dbPath] = process.argv.slice(2);
  if (operation === 'hold') {
    await database.initDatabase({ path: dbPath, mode: 'writer' });
    send({ status: 'ready' });
    process.on('message', message => {
      if (message !== 'release') return;
      database.closeDatabase();
      send({ status: 'released' });
      process.exit(0);
    });
    return;
  }

  if (operation === 'writer-init') {
    await database.initDatabase({ path: dbPath, mode: 'writer' });
    database.closeDatabase();
    send({ status: 'writer-ready' });
    return;
  }

  if (operation === 'read-only') {
    await database.initDatabase({ path: dbPath, mode: 'readOnly' });
    const users = database.queryOne('SELECT COUNT(*) AS count FROM users');
    let mutationCode = null;
    let persistCode = null;
    try { database.run('DELETE FROM users'); } catch (error) { mutationCode = error.code; }
    try { database.saveDatabase(); } catch (error) { persistCode = error.code; }
    database.closeDatabase();
    send({ status: 'read-only', userCount: users.count, mutationCode, persistCode });
    return;
  }

  if (operation === 'read-only-open') {
    await database.initDatabase({ path: dbPath, mode: 'readOnly' });
    database.closeDatabase();
    send({ status: 'read-only-opened' });
    return;
  }

  if (operation === 'stale-reader') {
    await database.initDatabase({ path: dbPath, mode: 'readOnly' });
    send({ status: 'snapshot-loaded' });
    process.on('message', message => {
      if (message !== 'persist') return;
      try {
        database.acquireWriteAuthority();
        database.run("INSERT INTO db_authority_probe (value) VALUES ('from-b')");
        send({ status: 'unexpected-write' });
      } catch (error) {
        send({ status: 'persist-rejected', code: error.code });
      } finally {
        database.closeDatabase();
      }
    });
    return;
  }

  if (operation === 'write-a') {
    await database.initDatabase({ path: dbPath, mode: 'writer' });
    database.run("INSERT INTO db_authority_probe (value) VALUES ('from-a')");
    database.closeDatabase();
    send({ status: 'written' });
    return;
  }

  throw new Error(`Unknown operation: ${operation}`);
}

main().catch(error => {
  send({ status: 'error', code: error.code, message: error.message });
  try { database.closeDatabase(); } catch (closeError) {}
  process.exitCode = 1;
});
