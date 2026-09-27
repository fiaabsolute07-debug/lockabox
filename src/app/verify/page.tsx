'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useT } from '@/components/i18n';

export default function VerifyPage() {
  const { t } = useT();
  const router = useRouter();
  const [rollId, setRollId] = useState('');
  const submit = (event: FormEvent) => { event.preventDefault(); if (/^\d+$/.test(rollId.trim())) router.push(`/verify/${rollId.trim()}`); };
  return <main className="simple-page"><div className="simple-card panel"><span className="eyebrow">{t('proofDesk')}</span><h1>{t('verifyARoll')}</h1><p>{t('verifyIntro')}</p><form className="verify-form" onSubmit={submit}><label htmlFor="roll-id">{t('rollId')}</label><div className="verify-input-row"><input id="roll-id" inputMode="numeric" value={rollId} onChange={(event) => setRollId(event.target.value.replace(/\D/g, ''))} placeholder="e.g. 18402" /><button className="button button-primary" type="submit" disabled={!rollId}>{t('openProof')}</button></div></form><Link href="/" className="back-link">{t('backToRoll')}</Link></div></main>;
}
