'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApiError, fetchJson, type PointsResponse } from './api';
import { useAppContext } from './AppShell';

export default function EarnClient() {
  const { user } = useAppContext();
  const [data, setData] = useState<PointsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    void fetchJson<PointsResponse>('/api/points').then(setData).catch((reason: unknown) => setError(reason instanceof ApiError ? reason.message : 'Could not load tasks.'));
  }, [user]);
  const claim = async (id: string) => {
    setBusy(id); setError(null);
    try { const next = await fetchJson<{ taskId: string; points: number; balance: number }>(`/api/tasks/${id}/claim`, { method: 'POST' }); setData((current) => current ? { ...current, balance: next.balance, tasks: current.tasks.map((task) => task.id === id ? { ...task, claimed: true } : task) } : current); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : 'Could not claim this task.'); }
    finally { setBusy(null); }
  };
  return <main className="simple-page earn-page"><div className="simple-card panel"><div className="earn-heading"><div><span className="eyebrow">LOCKABOX REWARDS</span><h1>Earn points</h1><p>Complete tasks to grow your balance for future sponsored cases.</p></div>{user && <div className="points-total"><span>POINTS</span><b>{(data?.balance ?? user.points).toLocaleString()}</b></div>}</div>{!user ? <div className="signed-out"><span className="empty-icon">◎</span><h2>Sign in to see your tasks</h2><p>Connect a Solana wallet and choose Sign in in the top bar.</p><Link className="button button-primary" href="/">Back to roll</Link></div> : error && <p className="inline-error" role="alert">{error}</p>}{user && <div className="task-list">{data?.tasks.map((task) => <article className="task-card" key={task.id}><div><span className="task-points">+{task.points} pts</span><h2>{task.title}</h2><p>{task.progress === null ? 'Progress is checked when you claim.' : `${Math.min(task.progress, task.goal)} / ${task.goal} complete`}{task.daily ? ' · daily' : ''}</p></div><button className="button button-outline" disabled={task.claimed || busy === task.id} onClick={() => void claim(task.id)}>{task.claimed ? 'Claimed' : busy === task.id ? 'Claiming…' : 'Claim'}</button></article>)}</div>}{user && !data && !error && <p className="muted loading-copy">Loading tasks…</p>}</div></main>;
}
