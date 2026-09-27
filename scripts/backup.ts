/**
 * Logical backup and restore drill (AC-082) without pg_dump: data as JSON lines per table, schema via the migrations.
 *
 *   pnpm exec tsx scripts/backup.ts dump    <dir>                      # DATABASE_URL → <dir>/<table>.jsonl + manifest.json
 *   pnpm exec tsx scripts/backup.ts restore <dir> <empty database url>  # migrations, then load, then check row counts + hashes + FKs
 *
 * Production uses the managed database's daily backups + point-in-time recovery; this script is the portable copy and the
 * way we prove a restore works. It refuses to restore into a database that already has user rows.
 * (COPY streams in postgres.js 3.4.9 hang the process on large tables, so rows go through a cursor instead.)
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import postgres from 'postgres';
import { migrate } from './migrate';

type Manifest = { createdAt: string; source: string; tables: { name: string; rows: number; sha256: string }[] };
const SEEDED_BY_MIGRATIONS = ['chains', 'cases', 'tasks', 'symbol_blocklist'];

async function tables(sql: postgres.Sql) {
  const rows = await sql<{ name: string }[]>`
    select table_name as name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> 'schema_migrations' order by table_name`;
  return rows.map((r) => r.name);
}

/** Content hash of a table: md5 over every row's text form, ordered. Identical before dump and after restore. */
async function tableHash(sql: postgres.Sql, name: string) {
  const [r] = await sql<{ n: number; h: string | null }[]>`
    select count(*)::int as n, md5(string_agg(t::text, E'\\n' order by t::text)) as h from ${sql(name)} t`;
  return { rows: r.n, sha256: createHash('sha256').update(r.h ?? '').digest('hex') };
}

async function dump(url: string, dir: string) {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  mkdirSync(dir, { recursive: true });
  const manifest: Manifest = { createdAt: new Date().toISOString(), source: url.replace(/:[^:@/]+@/, ':***@'), tables: [] };
  try {
    await sql.begin('isolation level repeatable read read only', async (tx) => { // one snapshot for every table
      for (const name of await tables(tx as unknown as postgres.Sql)) {
        const out = createWriteStream(resolve(dir, `${name}.jsonl`));
        await tx`select row_to_json(t)::text as j from ${tx(name)} t`.cursor(500, (rows) => {
          for (const r of rows) out.write(`${r.j}\n`);
        });
        await new Promise<void>((ok, fail) => out.end((e?: Error | null) => (e ? fail(e) : ok())));
        manifest.tables.push({ name, ...(await tableHash(tx as unknown as postgres.Sql, name)) });
      }
    });
    writeFileSync(resolve(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`dumped ${manifest.tables.length} tables, ${manifest.tables.reduce((s, t) => s + t.rows, 0)} rows → ${dir}`);
  } finally { await sql.end(); }
}

async function restore(dir: string, url: string) {
  const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf8')) as Manifest;
  await migrate(url);
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    for (const t of manifest.tables) {
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from ${sql(t.name)}`;
      if (n && !SEEDED_BY_MIGRATIONS.includes(t.name)) throw new Error(`refusing to restore: ${t.name} already has ${n} rows`);
    }
    await sql.begin(async (tx) => {
      // Skip triggers (append-only guards) and FK checks while loading; FKs are re-checked below.
      await tx`set local session_replication_role = replica`;
      await tx.unsafe(`truncate ${manifest.tables.map((t) => `"${t.name}"`).join(', ')} cascade`);
      for (const t of manifest.tables) {
        let batch: string[] = [];
        const flush = async () => {
          if (!batch.length) return;
          await tx.unsafe(`insert into "${t.name}" select * from json_populate_recordset(null::"${t.name}", $1::text::json)`, [`[${batch.join(',')}]`]);
          batch = [];
        };
        for await (const line of createInterface({ input: createReadStream(resolve(dir, `${t.name}.jsonl`)) })) {
          if (line) batch.push(line);
          if (batch.length >= 500) await flush();
        }
        await flush();
      }
    });
    // Sequences follow the restored ids.
    const seqs = await sql<{ tbl: string; col: string; seq: string }[]>`
      select c.table_name as tbl, c.column_name as col, pg_get_serial_sequence(c.table_name, c.column_name) as seq
      from information_schema.columns c where c.table_schema = 'public' and pg_get_serial_sequence(c.table_name, c.column_name) is not null`;
    for (const s of seqs) await sql.unsafe(`select setval('${s.seq}', coalesce((select max("${s.col}") from "${s.tbl}"), 0) + 1, false)`);
    let ok = true;
    for (const t of manifest.tables) {
      const got = await tableHash(sql, t.name);
      if (got.rows !== t.rows || got.sha256 !== t.sha256) { ok = false; console.error(`MISMATCH ${t.name}: ${got.rows}/${t.rows}`); }
    }
    // Foreign keys still hold: re-adding a constraint checks every row (VALIDATE is a no-op on valid ones).
    const fks = await sql<{ conrelid: string; conname: string; def: string }[]>`
      select conrelid::regclass::text as conrelid, conname, pg_get_constraintdef(oid) as def from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace`;
    await sql.begin(async (tx) => {
      for (const fk of fks) await tx.unsafe(`alter table ${fk.conrelid} drop constraint "${fk.conname}", add constraint "${fk.conname}" ${fk.def}`);
    });
    if (!ok) throw new Error('restore check failed');
    console.log(`restored ${manifest.tables.length} tables, ${manifest.tables.reduce((s, t) => s + t.rows, 0)} rows; counts and content hashes match; ${fks.length} foreign keys re-checked`);
  } finally { await sql.end(); }
}

const [cmd, dir, target] = process.argv.slice(2);
const source = process.env.DATABASE_URL ?? 'postgres://postgres:local_dev_only@127.0.0.1:55442/lockabox';
if (cmd === 'dump' && dir) await dump(source, dir);
else if (cmd === 'restore' && dir && target) await restore(dir, target);
else throw new Error('usage: backup.ts dump <dir> | restore <dir> <database url>');
