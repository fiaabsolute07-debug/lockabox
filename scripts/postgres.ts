import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';

// Local development database only (adapted from Spaca's scripts/postgres.ts). Port 55442 so it never collides with Spaca's 55432.
if (process.env.NODE_ENV === 'production') throw new Error('Embedded PostgreSQL is local development only');
const directory = resolve('.local/postgres');
const PORT = 55442;
const command = process.argv[2];
if (command === 'stop') {
  const pidFile = resolve(directory, 'postmaster.pid');
  if (!existsSync(pidFile)) { console.log('Local PostgreSQL is stopped.'); process.exit(0); }
  const lines = readFileSync(pidFile, 'utf8').split('\n');
  if (lines[1] !== directory || lines[3] !== String(PORT)) throw new Error('Refusing to stop a different PostgreSQL instance');
  const pid = Number(lines[0]);
  if (!Number.isSafeInteger(pid) || pid < 2) throw new Error('Invalid PostgreSQL PID');
  process.kill(pid, 'SIGINT');
  console.log('Sent fast shutdown to local PostgreSQL; data is retained.');
} else if (command === 'start') {
  const pg = new EmbeddedPostgres({ databaseDir: directory, user: 'postgres', password: 'local_dev_only', port: PORT,
    persistent: true, createPostgresUser: false, authMethod: 'scram-sha-256',
    initdbFlags: ['-c', 'shared_memory_type=mmap', '-c', 'dynamic_shared_memory_type=mmap'],
    postgresFlags: ['-h', '127.0.0.1', '-c', 'unix_socket_directories=', '-c', 'shared_memory_type=mmap', '-c', 'dynamic_shared_memory_type=mmap'],
  });
  if (!existsSync(resolve(directory, 'PG_VERSION'))) await pg.initialise();
  await pg.start();
  const admin = postgres(`postgres://postgres:local_dev_only@127.0.0.1:${PORT}/postgres`);
  try {
    for (const name of ['lockabox', 'lockabox_test']) {
      const found = await admin`select 1 from pg_database where datname = ${name}`;
      if (!found.length) await admin.unsafe(`CREATE DATABASE ${name}`);
    }
  } finally { await admin.end(); }
  console.log(`Local PostgreSQL ready at 127.0.0.1:${PORT}. Keep this process running.`);
  const shutdown = async () => { await pg.stop(); process.exit(0); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} else throw new Error('Usage: tsx scripts/postgres.ts start|stop');
