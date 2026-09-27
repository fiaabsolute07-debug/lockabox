'use client';

import { FormEvent, useState } from 'react';
import { ApiError, fetchJson, type AdminOverview } from './api';
import { useT, type TranslationKey } from './i18n';

/**
 * Owner console for the admin API (RUNBOOKS §1–4). The token lives only in this component's state: never storage, never a URL,
 * gone on reload. Every action needs a reason; the server writes it to the append-only audit log with `x-admin-actor`.
 */
export default function AdminConsole() {
  const { t, date } = useT();
  const [token, setToken] = useState('');
  const [actor, setActor] = useState('');
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const call = async <T,>(path: string, body?: unknown): Promise<T> => fetchJson<T>(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${token.trim()}`, 'x-admin-actor': actor.trim() },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const explain = (reason: unknown) => {
    if (reason instanceof ApiError && reason.code === 'unauthorized') return t('adminUnauthorized');
    // Admin sees the server's own text (e.g. why an on-chain payment check failed).
    return reason instanceof ApiError ? `${reason.code}: ${reason.message}` : t('apiError');
  };

  const load = async () => {
    setBusy(true); setError(null);
    try { setData(await call<AdminOverview>('/api/admin/overview')); }
    catch (reason) { setData(null); setError(explain(reason)); }
    finally { setBusy(false); }
  };

  const act = async (path: string, body: unknown, done: TranslationKey) => {
    setBusy(true); setError(null); setNotice(null);
    try { await call(path, body); setNotice(t(done)); setData(await call<AdminOverview>('/api/admin/overview')); }
    catch (reason) { setError(explain(reason)); }
    finally { setBusy(false); }
  };

  const submitLogin = (event: FormEvent) => { event.preventDefault(); if (token.trim() && actor.trim()) void load(); };

  return <main className="simple-page admin-page"><div className="simple-card panel">
    <span className="eyebrow">{t('adminEyebrow')}</span><h1>{t('adminHeading')}</h1><p>{t('adminIntro')}</p>
    <form className="admin-login" onSubmit={submitLogin} autoComplete="off">
      <label>{t('adminToken')}<input type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" spellCheck={false} required /></label>
      <label>{t('adminActor')}<input value={actor} onChange={(event) => setActor(event.target.value)} maxLength={40} required /></label>
      <button className="button button-primary" type="submit" disabled={busy}>{data ? t('adminReload') : t('adminLoad')}</button>
    </form>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {notice && <p className="trade-status" role="status">{notice}</p>}
    {data && <>
      <section className="admin-section"><h2>{t('adminPending')}</h2>{data.pendingCampaigns.length ? data.pendingCampaigns.map((campaign) => <CampaignReview key={campaign.id} campaign={campaign} busy={busy} onReview={(decision, note) => void act(`/api/admin/campaigns/${campaign.id}/review`, { decision, note }, decision === 'approve' ? 'adminApproved' : 'adminRejected')} />) : <p className="muted">{t('adminNoPending')}</p>}</section>
      <section className="admin-section"><h2>{t('adminKilled')}</h2>{data.killed.length ? <div className="table-scroll"><table><thead><tr><th>{t('adminAsset')}</th><th>{t('adminReason')}</th><th>{t('adminBy')}</th><th>{t('time')}</th><th /></tr></thead><tbody>{data.killed.map((row) => <KilledRow key={row.asset_id} row={row} busy={busy} date={date} onUnkill={(reason) => void act('/api/admin/unkill', { assetId: Number(row.asset_id), reason }, 'adminUnkilled')} />)}</tbody></table></div> : <p className="muted">{t('adminNoKilled')}</p>}</section>
      <section className="admin-section admin-forms">
        <ReasonForm title={t('adminKill')} fields={[{ name: 'assetId', label: t('adminAssetId'), numeric: true }]} busy={busy} submit={t('adminKillButton')} onSubmit={(values, reason) => void act('/api/admin/kill', { assetId: Number(values.assetId), reason }, 'adminKilledDone')} />
        <ReasonForm title={t('adminBlocklist')} fields={[{ name: 'symbol', label: t('adminSymbol') }]} choices={[['add', t('adminAdd')], ['remove', t('adminRemove')]]} busy={busy} submit={t('adminSave')} onSubmit={(values, reason, choice) => void act('/api/admin/blocklist', { symbol: values.symbol.trim(), op: choice, reason }, 'adminBlocklistDone')} />
        <ReasonForm title={t('adminLockUser')} fields={[{ name: 'userId', label: t('adminUserId') }]} choices={[['lock', t('adminLock')], ['unlock', t('adminUnlock')]]} busy={busy} submit={t('adminSave')} onSubmit={(values, reason, choice) => void act(`/api/admin/users/${encodeURIComponent(values.userId.trim())}/lock`, { lock: choice === 'lock', reason }, 'adminLockDone')} />
      </section>
      <section className="admin-section"><h2>{t('adminAudit')}</h2>{data.audit.length ? <div className="table-scroll"><table className="admin-audit"><thead><tr><th>{t('time')}</th><th>{t('adminBy')}</th><th>{t('adminAction')}</th><th>{t('adminTarget')}</th><th>{t('adminDetail')}</th></tr></thead><tbody>{data.audit.map((row, index) => <tr key={`${row.at}-${index}`}><td className="mono muted">{date(row.at, { dateStyle: 'short', timeStyle: 'short' })}</td><td>{row.actor}</td><td>{row.action}</td><td className="mono">{row.target ?? '—'}</td><td className="mono muted">{row.detail ? JSON.stringify(row.detail) : '—'}</td></tr>)}</tbody></table></div> : <p className="muted">{t('adminNoAudit')}</p>}</section>
    </>}
  </div></main>;
}

function CampaignReview({ campaign, busy, onReview }: { campaign: AdminOverview['pendingCampaigns'][number]; busy: boolean; onReview: (decision: 'approve' | 'reject', note: string) => void }) {
  const { t, date } = useT();
  const [note, setNote] = useState('');
  return <article className="admin-campaign" data-campaign={campaign.id}>
    <div><strong>#{campaign.id} · {campaign.project_name}</strong><small className="muted"> {campaign.chain_id} · {campaign.total_opens} {t('opens')} · {date(campaign.starts_at)} → {date(campaign.ends_at)}</small></div>
    <div className="mono muted admin-hashes"><span>{t('feeTxHash')}: {campaign.fee_tx_hash ?? '—'}</span><span>{t('depositTxHash')}: {campaign.deposit_tx_hash ?? '—'}</span></div>
    <label>{t('adminNote')}<input value={note} onChange={(event) => setNote(event.target.value)} /></label>
    <div className="admin-actions"><button className="button button-primary" disabled={busy || !note.trim()} onClick={() => onReview('approve', note.trim())}>{t('adminApprove')}</button><button className="button button-outline" disabled={busy || !note.trim()} onClick={() => onReview('reject', note.trim())}>{t('adminReject')}</button></div>
  </article>;
}

function KilledRow({ row, busy, date, onUnkill }: { row: AdminOverview['killed'][number]; busy: boolean; date: ReturnType<typeof useT>['date']; onUnkill: (reason: string) => void }) {
  const { t } = useT();
  const [reason, setReason] = useState('');
  return <tr><td className="mono">#{row.asset_id} {row.symbol ?? ''} <small className="muted">{row.chain_id}</small></td><td>{row.reason}</td><td>{row.actor}</td><td className="mono muted">{date(row.created_at, { dateStyle: 'short', timeStyle: 'short' })}</td>
    <td><div className="admin-inline"><input aria-label={t('adminReasonFor', { id: row.asset_id })} placeholder={t('adminReason')} value={reason} onChange={(event) => setReason(event.target.value)} /><button className="button button-outline" disabled={busy || !reason.trim()} onClick={() => onUnkill(reason.trim())}>{t('adminUnkill')}</button></div></td></tr>;
}

type Field = { name: string; label: string; numeric?: boolean };

function ReasonForm({ title, fields, choices, busy, submit, onSubmit }: { title: string; fields: Field[]; choices?: [string, string][]; busy: boolean; submit: string; onSubmit: (values: Record<string, string>, reason: string, choice: string) => void }) {
  const { t } = useT();
  const [values, setValues] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [choice, setChoice] = useState(choices?.[0]?.[0] ?? '');
  const ready = fields.every((field) => (values[field.name] ?? '').trim() && (!field.numeric || /^\d+$/.test(values[field.name].trim()))) && reason.trim();
  return <form className="admin-form" aria-label={title} onSubmit={(event) => { event.preventDefault(); if (ready) onSubmit(values, reason.trim(), choice); }}>
    <h3>{title}</h3>
    {fields.map((field) => <label key={field.name}>{field.label}<input inputMode={field.numeric ? 'numeric' : undefined} value={values[field.name] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} /></label>)}
    {choices && <div className="direction-buttons" role="group">{choices.map(([value, label]) => <button type="button" key={value} className={choice === value ? 'active' : ''} aria-pressed={choice === value} onClick={() => setChoice(value)}>{label}</button>)}</div>}
    <label>{t('adminReason')}<input value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    <button className="button button-outline" type="submit" disabled={busy || !ready}>{submit}</button>
  </form>;
}
