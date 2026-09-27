import Link from 'next/link';
import { displaySymbol, formatAddress, tierLabel, type RollResponse } from './api';

export default function ProofBox({ result }: { result: RollResponse }) {
  const { roll } = result;
  return <section className="panel proof-card"><div className="card-heading"><h3>Proof of this roll</h3><span className="up-text">✓ verifiable</span></div><ProofRow label="server seed hash" value={formatAddress(roll.serverSeedHash, 8)} /><ProofRow label="client seed" value={roll.clientSeed} /><ProofRow label="nonce" value={String(roll.nonce)} /><ProofRow label="pool" value={`#${formatAddress(roll.poolHash, 5)} (${roll.poolSize})`} /><ProofRow label="result" value={`${tierLabel(roll.tier)} · $${displaySymbol(result.asset)}`} /><Link className="verify-link" href={`/verify/${roll.rollId}`}>Verify this roll yourself ↗</Link></section>;
}

function ProofRow({ label, value }: { label: string; value: string }) { return <div className="proof-row"><span>{label}</span><b className="mono">{value}</b></div>; }
