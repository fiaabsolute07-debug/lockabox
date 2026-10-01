'use client';

import { useEffect, useRef, useState } from 'react';
import TokenImage from './TokenImage';
import { displaySymbol, tierColor, tierLabel, type AssetCard, type Tier } from './api';
import { useT } from './i18n';
import { LockyLogo } from './LockyLogo';
import { pickRevealLine, pickStreakLine } from './revealLines';
import { playRollReveal, playRollSuspense, playRollTick, stopRollAudio, type SpecialSound } from './rollAudio';
import { Confetti, type RevealActions } from './RollReel';

const CONFETTI: Record<Tier, number> = { micro: 0, small: 0, mid: 18, large: 60, top: 140 };
const DEAL_MS = 160;

/**
 * "Pick 1 of 3" (DECISIONS #27). Locky deals three face-down cards; the user picks one before anything is drawn. The server then
 * draws three different coins from the committed seed and the chosen card decides which one is theirs. The chosen card flips,
 * then the other two ("could've been"), then the pull is presented exactly like the reel's reveal.
 * `cards` stays null until the roll comes back; `chosen` is the card the user picked (null while choosing).
 */
export function PickThree({ cards, chosen, tier, odds, special, microStreak = 0, onPick, onCancel, onSettled, onRollAgain, reveal }: {
  cards: AssetCard[] | null; chosen: number | null; tier?: Tier; odds?: Partial<Record<Tier, number>>; special?: SpecialSound; microStreak?: number;
  onPick: (index: number) => void; onCancel: () => void; onSettled?: () => void; onRollAgain?: () => void;
  reveal?: (actions: RevealActions) => React.ReactNode;
}) {
  const { t, number } = useT();
  const [flipped, setFlipped] = useState<'none' | 'chosen' | 'all'>('none');
  const [settled, setSettled] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [panel, setPanel] = useState(false);
  const [headline, setHeadline] = useState('');
  const againRef = useRef<HTMLButtonElement>(null);
  const onSettledRef = useRef(onSettled);
  const specialRef = useRef(special);
  useEffect(() => { onSettledRef.current = onSettled; specialRef.current = special; });

  // One tick per card as Locky deals them.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timers = [0, 1, 2].map((i) => window.setTimeout(() => playRollTick(), 120 + i * DEAL_MS));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  // The roll is back: flip the chosen card, then the other two, then present the pull.
  useEffect(() => {
    if (!cards || chosen === null || !tier) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finish = () => {
      setFlipped('all');
      setSettled(true);
      setHeadline(specialRef.current === 'micro-streak' ? pickStreakLine(microStreak) : pickRevealLine(tier));
      setPresenting(!reduced);
      stopRollAudio();
      playRollReveal(tier, specialRef.current);
      onSettledRef.current?.();
    };
    if (reduced) { finish(); return; }
    playRollSuspense(260);
    const timers = [
      window.setTimeout(() => setFlipped('chosen'), 260),
      window.setTimeout(() => { setFlipped('all'); playRollTick(); }, 1150),
      window.setTimeout(finish, 1750),
    ];
    return () => { timers.forEach((timer) => window.clearTimeout(timer)); stopRollAudio(); };
  }, [cards, chosen, tier, microStreak]);

  useEffect(() => {
    if (!presenting) { setPanel(false); return; }
    const timer = window.setTimeout(() => setPanel(true), 900);
    return () => window.clearTimeout(timer);
  }, [presenting]);

  // Keys: 1/2/3 pick while choosing, Escape backs out (nothing has been drawn yet) or closes the presented pull.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { if (chosen === null) onCancel(); else if (presenting) setPresenting(false); return; }
      if (chosen === null && ['1', '2', '3'].includes(event.key)) { event.preventDefault(); onPick(Number(event.key) - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chosen, onCancel, onPick, presenting]);

  useEffect(() => { if (presenting) againRef.current?.focus({ preventScroll: true }); }, [presenting, panel]);

  const fullscreen = !settled || presenting;
  const chance = tier ? odds?.[tier] : undefined;
  const waiting = chosen !== null && !cards;

  return (
    <div className={`roll-stage pick-stage ${fullscreen ? 'roll-fullscreen' : ''} ${chosen === null ? 'pick-choosing' : ''} ${presenting && tier ? `roll-presenting fx-${tier}` : ''} ${presenting && panel && reveal ? 'roll-panel' : ''}`}
      style={{ '--reveal-color': settled && tier ? tierColor(tier) : '#FFC53D' } as React.CSSProperties}
      role={fullscreen ? 'dialog' : undefined} aria-modal={fullscreen || undefined} aria-label={presenting ? headline : t('modePick')}
      onClick={(event) => { if (presenting && event.target === event.currentTarget) setPresenting(false); }}>
      {!settled && <div className="pick-locky" aria-hidden="true"><span className="locky-bubble">{waiting ? t('pickOpening') : t('pickBubble')}</span><LockyLogo size={92} /></div>}
      {chosen === null && <button type="button" className="pick-cancel" aria-label={t('close')} onClick={onCancel}>×</button>}
      {presenting && tier && <div className="reveal-title" aria-live="polite"><span style={{ color: tierColor(tier) }}>{tierLabel(tier)}{chance ? ` · ${t('revealOdds', { percent: number(chance / 100, { maximumFractionDigits: 2 }) })}` : ''}</span><strong>{headline}</strong></div>}
      <div className="reveal-burst" aria-hidden="true" />
      {presenting && <div className="reveal-flash" aria-hidden="true" />}
      {presenting && (tier === 'large' || tier === 'top') && <div className="reveal-rays" aria-hidden="true" />}
      {presenting && tier && CONFETTI[tier] > 0 && <Confetti count={CONFETTI[tier]} tier={tier} />}
      <div className="pick-row">
        {[0, 1, 2].map((index) => {
          const card = cards?.[index];
          const isChosen = chosen === index;
          const face = flipped === 'all' || (flipped === 'chosen' && isChosen);
          return (
            <button key={index} type="button" disabled={chosen !== null}
              className={`pick-card ${isChosen ? 'chosen' : ''} ${chosen !== null && !isChosen ? 'other' : ''} ${face ? 'flipped' : ''} ${isChosen && waiting ? 'waiting' : ''}`}
              style={{ '--deal-delay': `${index * DEAL_MS}ms`, '--rarity': card ? tierColor(card.tier) : 'var(--acc)' } as React.CSSProperties}
              aria-label={card && face ? `$${displaySymbol(card)} · ${tierLabel(card.tier)}` : t('pickCardN', { n: index + 1 })}
              onClick={(event) => { event.stopPropagation(); onPick(index); }}>
              <span className="pick-inner">
                <span className="pick-back"><LockyLogo size={54} /><b>?</b><small>{index + 1}</small></span>
                <span className="pick-face">
                  {card && <>
                    <span className="pick-art"><TokenImage src={card.imageUrl} symbol={displaySymbol(card)} identity={`${card.chainId}:${card.address}`} /></span>
                    <b>${displaySymbol(card)}</b>
                    <em>{tierLabel(card.tier)}</em>
                    <small>{isChosen ? t('pickYours') : t('pickCouldHave')}</small>
                  </>}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {chosen === null && <p className="pick-hint">{t('pickHint')}</p>}
      {presenting && panel && reveal && <div className="reveal-panel" onClick={(event) => event.stopPropagation()}>
        {reveal({ close: () => setPresenting(false), again: () => { setPresenting(false); onRollAgain?.(); }, againRef })}
      </div>}
    </div>
  );
}
