'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ApiError, fetchJson, type SponsorCampaign, type SponsorCampaignStats } from './api';
import { useAppContext } from './AppShell';
import { useT, translateApiError } from './i18n';

type FormState = {
  projectName: string;
  description: string;
  tokenAddress: string;
  amountPerOpen: string;
  totalOpens: string;
  startsAt: string;
  endsAt: string;
  feeTxHash: string;
  depositTxHash: string;
};

const EMPTY_FORM: FormState = { projectName: '', description: '', tokenAddress: '', amountPerOpen: '', totalOpens: '', startsAt: '', endsAt: '', feeTxHash: '', depositTxHash: '' };

export default function SponsorDashboard() {
  const { user } = useAppContext();
  const { t, locale, date } = useT();
  const [campaigns, setCampaigns] = useState<SponsorCampaign[]>([]);
  const [stats, setStats] = useState<Record<number, SponsorCampaignStats>>({});
  const [expanded, setExpanded] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadCampaigns = async () => {
    setLoading(true); setError(null);
    try { setCampaigns((await fetchJson<{ items: SponsorCampaign[] }>('/api/sponsor/campaigns')).items); }
    catch (reason) { setError(translateApiError(reason, t, 'couldNotLoad')); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!user) { setCampaigns([]); setStats({}); return; }
    void loadCampaigns();
    // The API scopes this list by the signed-in sponsor wallet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, t]);

  const loadStats = async (id: number) => {
    if (stats[id]) { setExpanded((current) => current === id ? null : id); return; }
    setError(null);
    try {
      const value = await fetchJson<SponsorCampaignStats>(`/api/sponsor/campaigns/${id}`);
      setStats((current) => ({ ...current, [id]: value }));
      setExpanded(id);
    } catch (reason) { setError(translateApiError(reason, t, 'couldNotLoad')); }
  };

  const field = (key: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const validate = () => {
    if (form.projectName.trim().length < 2 || form.projectName.trim().length > 60) return t('projectNameLength');
    if (form.description.length > 280) return t('descriptionLength');
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(form.tokenAddress.trim())) return t('tokenAddressInvalid');
    if (!/^[1-9][0-9]{0,30}$/.test(form.amountPerOpen.trim())) return t('amountInvalid');
    if (!/^\d+$/.test(form.totalOpens) || Number(form.totalOpens) <= 0) return t('totalOpensInvalid');
    const starts = new Date(form.startsAt).getTime();
    const ends = new Date(form.endsAt).getTime();
    if (!Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts) return t('datesInvalid');
    return null;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(null); setNotice(null);
    const validation = validate();
    if (validation) { setError(validation); return; }
    setSubmitting(true);
    try {
      await fetchJson<{ id: number; status: string }>('/api/sponsor/campaigns', { method: 'POST', body: JSON.stringify({
        projectName: form.projectName.trim(), description: form.description, tokenAddress: form.tokenAddress.trim(), amountPerOpen: form.amountPerOpen.trim(), totalOpens: Number(form.totalOpens),
        startsAt: new Date(form.startsAt).toISOString(), endsAt: new Date(form.endsAt).toISOString(), feeTxHash: form.feeTxHash.trim() || undefined, depositTxHash: form.depositTxHash.trim() || undefined,
      }) });
      setForm(EMPTY_FORM); setNotice(t('submittedForReview')); await loadCampaigns();
    } catch (reason) { setError(reason instanceof ApiError && reason.code === 'policy' ? t('policyError') : translateApiError(reason, t, 'couldNotLoad')); }
    finally { setSubmitting(false); }
  };

  const exportCsv = async () => {
    setError(null);
    try {
      const rows = await Promise.all(campaigns.map(async (campaign) => {
        const detail = stats[campaign.id] ?? await fetchJson<SponsorCampaignStats>(`/api/sponsor/campaigns/${campaign.id}`);
        return { campaign, detail };
      }));
      const header = ['id', 'projectName', 'status', 'opens', 'uniqueWallets', 'dropsSent', 'buysAfterStart', 'startsAt', 'endsAt', 'createdAt'];
      const lines = [header, ...rows.map(({ campaign, detail }) => [campaign.id, campaign.projectName, campaign.status, detail.stats.opens, detail.stats.wallets, detail.stats.sent, detail.stats.buys, campaign.startsAt, campaign.endsAt, campaign.createdAt])]
        .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','));
      const blob = new Blob([`${lines.join('\n')}\n`], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'lockabox-campaigns.csv'; anchor.click(); URL.revokeObjectURL(url);
    } catch (reason) { setError(translateApiError(reason, t, 'couldNotLoad')); }
  };

  if (!user) return <main className="simple-page sponsor-page"><div className="simple-card panel"><span className="eyebrow">{t('sponsorEyebrow')}</span><h1>{t('sponsorHeading')}</h1><div className="signed-out"><span className="empty-icon">◎</span><h2>{t('signInWithSponsorWallet')}</h2><p>{t('signInSponsorHelp')}</p></div></div></main>;

  return <main className="simple-page sponsor-page"><div className="simple-card panel"><div className="sponsor-heading"><div><span className="eyebrow">{t('sponsorEyebrow')}</span><h1>{t('sponsorHeading')}</h1><p>{t('sponsorIntro')}</p></div><button className="button button-outline" onClick={() => void exportCsv()} disabled={!campaigns.length}>{t('exportCsv')}</button></div>{error && <p className="inline-error" role="alert">{error}</p>}{notice && <p className="trade-status" role="status">{notice}</p>}<section className="campaign-section"><div className="section-heading"><h2>{t('campaigns')}</h2>{loading && <span className="muted">{t('loading')}</span>}</div>{campaigns.length ? <div className="campaign-list">{campaigns.map((campaign) => <CampaignRow key={campaign.id} campaign={campaign} stats={stats[campaign.id]} expanded={expanded === campaign.id} onToggle={() => void loadStats(campaign.id)} locale={locale} date={date} t={t} />)}</div> : !loading && <p className="empty-table">{t('noCampaigns')}</p>}</section><section className="campaign-form-section"><h2>{t('newCampaign')}</h2><p className="sponsor-review-copy">{t('reviewedCopy')}</p><form className="campaign-form" onSubmit={(event) => void submit(event)}><label>{t('projectName')}<input value={form.projectName} onChange={field('projectName')} minLength={2} maxLength={60} required /></label><label>{t('description')}<textarea value={form.description} onChange={field('description')} maxLength={280} rows={3} /></label><label>{t('tokenAddress')}<input value={form.tokenAddress} onChange={field('tokenAddress')} required /></label><div className="campaign-form-grid"><label>{t('amountPerOpen')}<input value={form.amountPerOpen} onChange={field('amountPerOpen')} inputMode="numeric" required /></label><label>{t('totalOpens')}<input value={form.totalOpens} onChange={field('totalOpens')} type="number" min={1} step={1} required /></label><label>{t('startsAt')}<input value={form.startsAt} onChange={field('startsAt')} type="datetime-local" required /></label><label>{t('endsAt')}<input value={form.endsAt} onChange={field('endsAt')} type="datetime-local" required /></label></div><label>{t('feeTxHash')} <small>({t('optional')})</small><input value={form.feeTxHash} onChange={field('feeTxHash')} /></label><label>{t('depositTxHash')} <small>({t('optional')})</small><input value={form.depositTxHash} onChange={field('depositTxHash')} /></label><button className="button button-primary" type="submit" disabled={submitting}>{submitting ? t('submitting') : t('submitCampaign')}</button></form></section></div></main>;
}

function CampaignRow({ campaign, stats, expanded, onToggle, locale, date, t }: { campaign: SponsorCampaign; stats?: SponsorCampaignStats; expanded: boolean; onToggle: () => void; locale: string; date: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => string; t: ReturnType<typeof useT>['t'] }) {
  const statusKey = campaign.status === 'approved' ? 'statusApproved' : campaign.status === 'rejected' ? 'statusRejected' : campaign.status === 'ended' ? 'statusEnded' : 'statusPending';
  return <article className="campaign-card"><div className="campaign-card-head"><div><strong>{campaign.projectName}</strong><span className={`campaign-status ${campaign.status}`}>{t(statusKey)}</span></div><button className="button button-outline" onClick={onToggle}>{expanded ? t('hideStats') : t('viewStats')}</button></div><div className="campaign-meta"><span>{new Intl.NumberFormat(locale).format(campaign.opensUsed)} / {new Intl.NumberFormat(locale).format(campaign.totalOpens)} {t('opens')}</span><span>{date(campaign.startsAt)} → {date(campaign.endsAt)}</span></div>{expanded && stats && <div className="campaign-stats"><Stat label={t('opens')} value={stats.stats.opens} locale={locale} /><Stat label={t('uniqueWallets')} value={stats.stats.wallets} locale={locale} /><Stat label={t('dropsSent')} value={stats.stats.sent} locale={locale} /><Stat label={t('buysAfterStart')} value={stats.stats.buys} locale={locale} /></div>}</article>;
}

function Stat({ label, value, locale }: { label: string; value: number; locale: string }) { return <div><strong>{new Intl.NumberFormat(locale).format(value)}</strong><span>{label}</span></div>; }
