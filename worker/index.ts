import postgres from 'postgres';
import { runCycle } from './ingest';

// Long-running ingest worker (LAB §5). `--once` runs a single cycle and exits.
const url = process.env.DATABASE_URL ?? 'postgres://postgres:local_dev_only@127.0.0.1:55442/lockabox';
const sql = postgres(url, { max: 4, onnotice: () => {} });
const once = process.argv.includes('--once');
const INTERVAL_MS = 60_000;
let stopping = false;
let wake: (() => void) | undefined;

async function loop() {
  while (!stopping) {
    const started = Date.now();
    try { await runCycle({ sql }); } catch (e) { console.error('[worker] cycle failed', e); }
    if (once || stopping) break;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, Math.max(5_000, INTERVAL_MS - (Date.now() - started)));
      wake = () => { clearTimeout(timer); resolve(); };
    });
    wake = undefined;
  }
  await sql.end({ timeout: 5 });
}

// Finish the current cycle before closing its reserved advisory-lock connection.
// Ending the pool from inside a signal handler can strand a reserved connection indefinitely.
const stop = () => { stopping = true; wake?.(); };
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
await loop();
