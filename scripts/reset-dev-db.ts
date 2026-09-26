import postgres from 'postgres';
import { migrate } from './migrate';

// Drops and recreates the local dev database. Local only.
if (process.env.NODE_ENV === 'production') throw new Error('local only');
const admin = postgres('postgres://postgres:local_dev_only@127.0.0.1:55442/postgres', { max: 1, onnotice: () => {} });
try {
  await admin.unsafe('DROP DATABASE IF EXISTS lockabox WITH (FORCE)');
  await admin.unsafe('CREATE DATABASE lockabox');
} finally { await admin.end(); }
await migrate('postgres://postgres:local_dev_only@127.0.0.1:55442/lockabox');
