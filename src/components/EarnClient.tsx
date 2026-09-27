'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApiError, fetchJson, type InviteSummary, type PointsResponse } from './api';
import { useAppContext } from './AppShell';
import { useT, translateApiError } from './i18n';

export default function EarnClient() {
  const { t, locale } = useT();
  const { user } = useAppContext();
  const [data, setData] = useState<PointsResponse | null>(null);
  const [invites, setInvites] = useState<InviteSummary | null>(null);
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (!user) { setData(null); setInvites(null); setInviteLink(''); return; }
    let active = true;
    setError(null);
    void fetchJson<PointsResponse>('/api/points').then((value) => { if (active) setData(value); }).catch((reason: unknown) => { if (active) setError(translateApiError(reason, t, 'couldNotLoad')); });
    void fetchJson<InviteSummary>('/api/invites').then((value) => {
      if (!active) return;
      setInvites(value);
      setInviteLink(`${window.location.origin}${value.path}`);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [t, user]);

  const copyInvite = async () => {
    if (!inviteLink) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(inviteLink);
      else {
        const input = document.createElement('textarea');
        input.value = inviteLink; input.setAttribute('readonly', ''); input.style.position = 'fixed'; input.style.opacity = '0';
        document.body.appendChild(input); input.select(); document.execCommand('copy'); input.remove();
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch { setError(t('couldNotCopyInvite')); }
  };

  const claim = async (id: string) => {
    setBusy(id); setError(null);
    try {
      const next = await fetchJson<{ taskId: string; points: number; balance: number }>(`/api/tasks/${id}/claim`, { method: 'POST' });
      setData((current) => current ? { ...current, balance: next.balance, tasks: current.tasks.map((task) => task.id === id ? { ...task, claimed: id === 'invite-friend' ? false : true, progress: id === 'invite-friend' && task.progress !== null ? Math.max(0, task.progress - 1) : task.progress } : task) } : current);
      if (id === 'invite-friend') setInvites((current) => current ? { ...current, claimable: Math.max(0, current.claimable - 1) } : current);
    }
    catch (reason) { setError(translateApiError(reason, t, 'couldNotLoad')); }
    finally { setBusy(null); }
  };
  return <main className="simple-page earn-page"><div className="simple-card panel"><div className="earn-heading"><div><span className="eyebrow">{t('rewardsEyebrow')}</span><h1>{t('earnPoints')}</h1><p>{t('completeTasks')}</p></div>{user && <div className="points-total"><span>{t('pointsLabel')}</span><b>{new Intl.NumberFormat(locale).format(data?.balance ?? user.points)}</b></div>}</div>{!user ? <div className="signed-out"><span className="empty-icon">◎</span><h2>{t('tasksSignIn')}</h2><p>{t('tasksSignInHelp')}</p><Link className="button button-primary" href="/">{t('backToRoll')}</Link></div> : <>{error && <p className="inline-error" role="alert">{error}</p>}{invites && <InviteCard data={invites} link={inviteLink} copied={copied} onCopy={() => void copyInvite()} />}{data && <div className="task-list">{data.tasks.map((task) => { const inviteTask = task.id === 'invite-friend'; const canClaimInvite = inviteTask && (task.progress ?? 0) > 0; return <article className="task-card" key={task.id}><div><span className="task-points">+{task.points} {t('points')}</span><h2>{task.title}</h2><p>{task.progress === null ? t('progressChecked') : t('complete', { done: Math.min(task.progress, task.goal), goal: task.goal })}{task.daily ? ` · ${t('daily')}` : ''}</p></div><button className="button button-outline" disabled={busy === task.id || (inviteTask ? !canClaimInvite : task.claimed)} onClick={() => void claim(task.id)}>{busy === task.id ? t('claiming') : task.claimed && !inviteTask ? t('claimed') : t('claim')}</button></article>; })}</div>}{!data && !error && <p className="muted loading-copy">{t('loading')}</p>}</>}</div></main>;
}

function InviteCard({ data, link, copied, onCopy }: { data: InviteSummary; link: string; copied: boolean; onCopy: () => void }) {
  const { t } = useT();
  return <section className="invite-card"><div className="invite-heading"><div><span className="eyebrow">{t('growTheBox')}</span><h2>{t('inviteFriends')}</h2></div><span className="invite-rule">{t('inviteRule')}</span></div><div className="invite-link-row"><input aria-label="Invite link" readOnly value={link} /><button className="button button-outline" onClick={onCopy}>{copied ? t('copied') : t('copy')}</button></div><div className="invite-stats"><span><b>{data.invited}</b><small>{t('invited')}</small></span><span><b>{data.rewarded}</b><small>{t('rewarded')}</small></span><span><b>{data.claimable}</b><small>{t('readyToClaim')}</small></span><span><b>{data.rewardedToday}/{data.dailyCap}</b><small>{t('today')}</small></span></div><p className="invite-fine">{t('inviteFine', { days: data.daysRequired, cap: data.dailyCap })}</p></section>;
}
