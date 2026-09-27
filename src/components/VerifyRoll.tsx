'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApiError, displaySymbol, fetchJson, formatAddress, tierLabel, type RollRecordResponse, type Tier, type VerificationResponse } from './api';
import { recomputeRoll, sha256Hex } from './fairBrowser';

export default function VerifyRoll({ id }: { id: string }) {
  const [record, setRecord] = useState<RollRecordResponse | null>(null);
  const [verification, setVerification] = useState<VerificationResponse | null>(null);
  const [browser, setBrowser] = useState<{ hashMatches: boolean; poolMatches: boolean; recomputed: { tier: Tier; assetId: number } | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!/^\d+$/.test(id)) { setError('Enter a numeric roll id.'); return () => undefined; }
    void Promise.all([fetchJson<RollRecordResponse>(`/api/rolls/${id}`), fetchJson<VerificationResponse>(`/api/rolls/${id}/verify`)]).then(async ([roll, proof]) => {
      if (!active) return;
      setRecord(roll); setVerification(proof);
      if (proof.status !== 'pending') {
        const hashMatches = (await sha256Hex(proof.serverSeed)) === proof.serverSeedHash;
        // The pool the server hands back must be the one it recorded at roll time.
        const poolMatches = (await sha256Hex(JSON.stringify(proof.items))) === roll.roll.itemsHash;
        const recomputed = await recomputeRoll({ serverSeed: proof.serverSeed, clientSeed: roll.roll.clientSeed, nonce: roll.roll.nonce, items: proof.items, odds: proof.odds });
        if (active) setBrowser({ hashMatches, poolMatches, recomputed });
      }
    }).catch((reason: unknown) => { if (active) setError(reason instanceof ApiError ? reason.message : 'Could not load this proof.'); });
    return () => { active = false; };
  }, [id]);

  if (error) return <main className="simple-page"><div className="simple-card panel"><span className="eyebrow">PROOF DESK</span><h1>Roll not found</h1><p>{error}</p><Link href="/verify" className="back-link">← Try another roll</Link></div></main>;
  if (!record || !verification) return <main className="simple-page"><div className="simple-card panel loading-card"><span className="eyebrow">PROOF DESK</span><h1>Loading proof…</h1></div></main>;

  const assetName = displaySymbol(record.asset);
  const revealed = verification.status !== 'pending';
  const verified = verification.status === 'verified' && (browser?.hashMatches ?? verification.hashMatches) && browser?.poolMatches !== false && (!browser?.recomputed || (browser.recomputed.tier === verification.recorded.tier && browser.recomputed.assetId === verification.recorded.assetId));
  const hasBrowserResult = !!browser?.recomputed;
  return <main className="simple-page verify-page"><div className="simple-card panel"><div className="verify-title"><div><span className="eyebrow">ROLL #{record.roll.id}</span><h1>Verify this pull</h1></div><span className={`verify-status ${revealed ? (verified ? 'verified' : 'mismatch') : 'pending'}`}>{revealed ? (verified ? '✓ verified' : '✗ mismatch') : 'pending'}</span></div><p className="verify-intro">The roll is tied to a committed server seed, client seed, nonce, and frozen pool.</p><div className="proof-grid"><ProofValue label="server seed hash" value={record.roll.serverSeedHash} /><ProofValue label="client seed" value={record.roll.clientSeed} /><ProofValue label="nonce" value={String(record.roll.nonce)} /><ProofValue label="pool size" value={String(record.roll.poolSize)} /><ProofValue label="items hash" value={record.roll.itemsHash} /><ProofValue label="filters" value={Object.keys(record.roll.filters ?? {}).length ? JSON.stringify(record.roll.filters) : 'none'} /><ProofValue label="recorded result" value={`${assetName} · ${tierLabel(record.roll.tier)}`} /><ProofValue label="case / pool" value={`${record.roll.caseId} · #${record.roll.poolId}`} /></div>{verification.status === 'pending' ? <div className="pending-proof"><strong>Seed not revealed yet</strong><p>{verification.message}</p></div> : <div className={`revealed-proof ${verified ? 'verified' : 'mismatch'}`}><strong>{verified ? (hasBrowserResult ? '✓ Browser check matches the recorded result' : '✓ Server verification matches the recorded result') : (hasBrowserResult ? '✗ Browser check does not match the recorded result' : '✗ Verification does not match the recorded result')}</strong><div className="proof-rows"><span>revealed server seed <b className="mono">{formatAddress(verification.serverSeed, 12)}</b></span><span>commitment hash <b>{browser?.hashMatches ?? verification.hashMatches ? 'matches' : 'does not match'}</b></span><span>pool hash <b>{browser ? (browser.poolMatches ? 'matches' : 'does not match') : 'checking…'}</b></span><span>recomputed <b>{tierLabel(browser?.recomputed?.tier ?? verification.recomputed.tier)} · asset #{browser?.recomputed?.assetId ?? verification.recomputed.assetId}</b></span></div></div>}<MethodNote /><Link href="/verify" className="back-link">← Verify another roll</Link></div></main>;
}

function ProofValue({ label, value }: { label: string; value: string }) { return <div className="proof-value"><span>{label}</span><b className="mono">{value}</b></div>; }

function MethodNote() { return <div className="method-note"><strong>How the check works</strong><ol><li>Lockabox publishes a SHA-256 commitment before a roll.</li><li>HMAC-SHA256 combines the revealed seed, client seed, and nonce.</li><li>The first 52 bits choose a point from zero to one.</li><li>That point selects a tier using the published basis-point odds.</li><li>The next point selects an item in canonical tier and asset order.</li></ol></div>; }
