import postgres from 'postgres';
import { migrate } from './migrate';

// Recreates the isolated test database and applies every migration.
const admin = postgres('postgres://postgres:local_dev_only@127.0.0.1:55442/postgres', { max: 1, onnotice: () => {} });
try {
  await admin.unsafe('DROP DATABASE IF EXISTS lockabox_test WITH (FORCE)');
  await admin.unsafe('CREATE DATABASE lockabox_test');
} finally { await admin.end(); }
await migrate('postgres://postgres:local_dev_only@127.0.0.1:55442/lockabox_test');
console.log('lockabox_test ready');
