'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function VerifyPage() {
  const router = useRouter();
  const [rollId, setRollId] = useState('');
  const submit = (event: FormEvent) => { event.preventDefault(); if (/^\d+$/.test(rollId.trim())) router.push(`/verify/${rollId.trim()}`); };
  return <main className="simple-page"><div className="simple-card panel"><span className="eyebrow">PROOF DESK</span><h1>Verify a roll</h1><p>Enter a roll id to inspect its seed commitment, pool hash, and recorded result.</p><form className="verify-form" onSubmit={submit}><label htmlFor="roll-id">Roll id</label><div className="verify-input-row"><input id="roll-id" inputMode="numeric" value={rollId} onChange={(event) => setRollId(event.target.value.replace(/\D/g, ''))} placeholder="e.g. 18402" /><button className="button button-primary" type="submit" disabled={!rollId}>Open proof</button></div></form><Link href="/" className="back-link">← Back to the roll</Link></div></main>;
}
