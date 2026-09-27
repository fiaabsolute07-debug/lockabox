import Link from 'next/link';
import { displaySymbol, formatAddress, tierLabel, type RollResponse } from './api';
import { useT } from './i18n';

export default function ProofBox({ result }: { result: RollResponse }) {
  const { t } = useT();
  const { roll } = result;
  return <section className="panel proof-card"><div className="card-heading"><h3>{t('proofOfRoll')}</h3><span className="up-text">{t('verifiable')}</span></div><ProofRow label={t('serverSeedHash')} value={formatAddress(roll.serverSeedHash, 8)} /><ProofRow label={t('clientSeed')} value={roll.clientSeed} /><ProofRow label={t('nonce')} value={String(roll.nonce)} /><ProofRow label={t('pool')} value={`#${formatAddress(roll.poolHash, 5)} (${roll.poolSize})`} /><ProofRow label={t('result')} value={`${tierLabel(roll.tier)} · $${displaySymbol(result.asset)}`} /><Link className="verify-link" href={`/verify/${roll.rollId}`}>{t('verifyYourself')}</Link></section>;
}

function ProofRow({ label, value }: { label: string; value: string }) { return <div className="proof-row"><span>{label}</span><b className="mono">{value}</b></div>; }
