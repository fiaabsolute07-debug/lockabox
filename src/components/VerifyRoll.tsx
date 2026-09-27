'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { displaySymbol, fetchJson, formatAddress, tierLabel, type RollRecordResponse, type Tier, type VerificationResponse } from './api';
import { recomputeRoll, sha256Hex } from './fairBrowser';
import SharePullButton from './SharePullButton';
import { useT, translateApiError } from './i18n';

export default function VerifyRoll({ id }: { id: string }) {
  const { t } = useT();
  const [record, setRecord] = useState<RollRecordResponse | null>(null);
  const [verification, setVerification] = useState<VerificationResponse | null>(null);
  const [browser, setBrowser] = useState<{ hashMatches: boolean; poolMatches: boolean; recomputed: { tier: Tier; assetId: number } | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!/^\d+$/.test(id)) { setError(t('numericRollId')); return () => undefined; }
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
    }).catch((reason: unknown) => { if (active) setError(translateApiError(reason, t, 'couldNotLoad')); });
    return () => { active = false; };
  }, [id, t]);

  if (error) return <main className="simple-page"><div className="simple-card panel"><span className="eyebrow">{t('proofDesk')}</span><h1>{t('rollNotFound')}</h1><p>{error}</p><Link href="/verify" className="back-link">{t('tryAnotherRoll')}</Link></div></main>;
  if (!record || !verification) return <main className="simple-page"><div className="simple-card panel loading-card"><span className="eyebrow">{t('proofDesk')}</span><h1>{t('loadingProof')}</h1></div></main>;

  const assetName = displaySymbol(record.asset);
  const revealed = verification.status !== 'pending';
  const verified = verification.status === 'verified' && (browser?.hashMatches ?? verification.hashMatches) && browser?.poolMatches !== false && (!browser?.recomputed || (browser.recomputed.tier === verification.recorded.tier && browser.recomputed.assetId === verification.recorded.assetId));
  const hasBrowserResult = !!browser?.recomputed;
  return <main className="simple-page verify-page"><div className="simple-card panel"><div className="verify-title"><div><span className="eyebrow">ROLL #{record.roll.id}</span><h1>{t('verifyThisPull')}</h1>{record.roll.caseId === 'sponsored' && <span className="sponsored-badge">{t('sponsored')}</span>}</div><div className="verify-actions"><SharePullButton rollId={record.roll.id} symbol={assetName} /><span className={`verify-status ${revealed ? (verified ? 'verified' : 'mismatch') : 'pending'}`}>{revealed ? (verified ? t('rollStatusVerified') : t('rollStatusMismatch')) : t('pending')}</span></div></div><p className="verify-intro">{t('rollTied')}</p><div className="proof-grid"><ProofValue label={t('serverSeedHash')} value={record.roll.serverSeedHash} /><ProofValue label={t('clientSeed')} value={record.roll.clientSeed} /><ProofValue label={t('nonce')} value={String(record.roll.nonce)} /><ProofValue label={t('poolSize')} value={String(record.roll.poolSize)} /><ProofValue label={t('itemsHash')} value={record.roll.itemsHash} /><ProofValue label={t('filtersLabel')} value={Object.keys(record.roll.filters ?? {}).length ? JSON.stringify(record.roll.filters) : t('none')} /><ProofValue label={t('recordedResult')} value={`${assetName} · ${tierLabel(record.roll.tier)}`} /><ProofValue label={t('casePool')} value={`${record.roll.caseId} · #${record.roll.poolId}`} /></div>{verification.status === 'pending' ? <div className="pending-proof"><strong>{t('seedNotRevealed')}</strong><p>{verification.message}</p></div> : <div className={`revealed-proof ${verified ? 'verified' : 'mismatch'}`}><strong>{verified ? (hasBrowserResult ? t('browserMatches') : t('serverMatches')) : (hasBrowserResult ? t('browserMismatch') : t('serverMismatch'))}</strong><div className="proof-rows"><span>{t('revealedServerSeed')} <b className="mono">{formatAddress(verification.serverSeed, 12)}</b></span><span>{t('commitmentHash')} <b>{browser?.hashMatches ?? verification.hashMatches ? t('matches') : t('doesNotMatch')}</b></span><span>{t('poolHash')} <b>{browser ? (browser.poolMatches ? t('matches') : t('doesNotMatch')) : t('checking')}</b></span><span>{t('recomputed')} <b>{tierLabel(browser?.recomputed?.tier ?? verification.recomputed.tier)} · asset #{browser?.recomputed?.assetId ?? verification.recomputed.assetId}</b></span></div></div>}<MethodNote /><Link href="/verify" className="back-link">{t('tryAnotherRoll')}</Link></div></main>;
}

function ProofValue({ label, value }: { label: string; value: string }) { return <div className="proof-value"><span>{label}</span><b className="mono">{value}</b></div>; }

function MethodNote() { const { t } = useT(); return <div className="method-note"><strong>{t('howCheckWorks')}</strong><ol><li>{t('methodOne')}</li><li>{t('methodTwo')}</li><li>{t('methodThree')}</li><li>{t('methodFour')}</li><li>{t('methodFive')}</li></ol></div>; }
