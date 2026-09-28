import postgres from 'postgres';

const url = process.env.DATABASE_URL ?? 'postgres://postgres:local_dev_only@127.0.0.1:55442/lockabox';

declare global { var __labSql: postgres.Sql | undefined; }

/** One pool per process (kept on globalThis so Next dev reloads don't leak connections). */
export const sql: postgres.Sql = globalThis.__labSql ?? postgres(url, { max: Number(process.env.DB_POOL_MAX ?? 10), prepare: false, onnotice: () => {} });
if (process.env.NODE_ENV !== 'production') globalThis.__labSql = sql;
