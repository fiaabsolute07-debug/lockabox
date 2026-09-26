import postgres from 'postgres';
import { runCycle } from './ingest';

// Long-running ingest worker (LAB §5). `--once` runs a single cycle and exits.
const url = process.env.DATABASE_URL ?? 'postgres://postgres:local_dev_only@127.0.0.1:55442/lockabox';
const sql = postgres(url, { max: 4, onnotice: () => {} });
const once = process.argv.includes('--once');
const INTERVAL_MS = 60_000;

async function loop() {
  for (;;) {
    const started = Date.now();
    try { await runCycle({ sql }); } catch (e) { console.error('[worker] cycle failed', e); }
    if (once) break;
    await new Promise((r) => setTimeout(r, Math.max(5_000, INTERVAL_MS - (Date.now() - started))));
  }
  await sql.end();
}

process.once('SIGINT', async () => { await sql.end(); process.exit(0); });
await loop();
