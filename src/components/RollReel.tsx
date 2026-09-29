'use client';

import TokenImage from './TokenImage';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { displaySymbol, tierColor, tierLabel, type AssetCard, type Tier } from './api';
import { useT } from './i18n';
import { pickRevealLine, pickStreakLine } from './revealLines';
import { playRollBed, playRollReveal, playRollStart, playRollSuspense, playRollTick, stopRollAudio, type SpecialSound } from './rollAudio';

const SPIN_MS = 4700;
const SUSPENSE_MS = 220; // CS:GO reveals almost as soon as the reel stops
const CONFETTI: Record<Tier, number> = { micro: 0, small: 0, mid: 18, large: 60, top: 140 };

/**
 * The cosmetic reel (the result is decided by the server before it starts). It opens full screen, spins with one tick per item,
 * stops with a short beat, then presents the pull in the middle of the screen with a tier-specific sound and effect until
 * the user closes it or opens again. Reduced motion skips all of it and reveals in place.
 */
export type RevealActions = { close: () => void; again: () => void; againRef: React.Ref<HTMLButtonElement> };

export function RollReel({ cards, winIndex, tier, odds, special, microStreak = 0, onSettled, onRollAgain, reveal }: {
  cards: AssetCard[]; winIndex: number; tier: Tier; odds?: Partial<Record<Tier, number>>; special?: SpecialSound; microStreak?: number; onSettled?: () => void; onRollAgain?: () => void;
  /** The coin card shown after the tier effect (PullCard); without it, the reveal keeps simple Open again / See the coin buttons. */
  reveal?: (actions: RevealActions) => React.ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const finishRef = useRef<() => void>(() => undefined);
  const onSettledRef = useRef(onSettled);
  const landingRef = useRef<{ cards: AssetCard[]; winIndex: number; fraction: number } | null>(null);
  const againRef = useRef<HTMLButtonElement>(null);
  const [settled, setSettled] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [panel, setPanel] = useState(false);
  const [phase, setPhase] = useState<'charging' | 'spinning' | 'suspense' | 'revealed'>('charging');
  // A new reel mounts for every roll, so each pull gets its own headline.
  const [headline] = useState(() => (special === 'micro-streak' ? pickStreakLine(microStreak) : pickRevealLine(tier)));
  const { t, number } = useT();
  const specialRef = useRef(special);
  useLayoutEffect(() => { onSettledRef.current = onSettled; specialRef.current = special; });

  useLayoutEffect(() => {
    if (!viewportRef.current || !stripRef.current || !cards[winIndex]) return;
    const card = stripRef.current.children[winIndex] as HTMLElement | undefined;
    if (!card) return;
    const viewport = viewportRef.current;
    const strip = stripRef.current;
    // Cosmetic position only: keep the server-selected winner and reel order.
    // Reuse this offset for skip, resize and Strict Mode effect replays.
    if (landingRef.current?.cards !== cards || landingRef.current.winIndex !== winIndex) {
      landingRef.current = { cards, winIndex, fraction: 0.06 + Math.random() * 0.88 };
    }
    const landingFraction = landingRef.current.fraction;
    const target = () => viewport.clientWidth / 2 - (card.offsetLeft + card.offsetWidth * landingFraction);
    let cancelled = false;
    let finished = false;
    let animation: Animation | undefined;
    let tickFrame = 0;
    let revealTimer: ReturnType<typeof setTimeout> | undefined;
    let startTimer: ReturnType<typeof setTimeout> | undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finish = () => {
      if (cancelled || finished) return;
      finished = true;
      clearTimeout(startTimer);
      clearTimeout(revealTimer);
      cancelAnimationFrame(tickFrame);
      strip.style.transform = `translateX(${target()}px)`;
      animation?.cancel();
      setPhase('revealed');
      setSettled(true);
      setPresenting(!reduced);
      stopRollAudio();
      playRollReveal(tier, specialRef.current);
      onSettledRef.current?.();
    };
    finishRef.current = finish;
    setSettled(false);
    setPresenting(false);
    setPhase('charging');
    strip.style.transform = 'translateX(0)';
    if (reduced) {
      finish();
    } else {
      playRollStart();
      startTimer = setTimeout(() => {
        setPhase('spinning');
        playRollBed(SPIN_MS);
        animation = strip.animate([
          { transform: 'translateX(0)' },
          { transform: `translateX(${target()}px)` },
        ], { duration: SPIN_MS, easing: 'cubic-bezier(.12,.68,.12,1)', fill: 'forwards' });
        const first = strip.children[0] as HTMLElement;
        const second = strip.children[1] as HTMLElement | undefined;
        const stride = second ? second.offsetLeft - first.offsetLeft : first.offsetWidth;
        let previousIndex = -1;
        const tick = () => {
          if (cancelled || finished) return;
          const center = viewport.getBoundingClientRect().left + viewport.clientWidth / 2;
          const index = Math.round((center - strip.getBoundingClientRect().left - first.offsetWidth / 2) / stride);
          if (index !== previousIndex) { if (previousIndex !== -1) playRollTick(); previousIndex = index; }
          tickFrame = requestAnimationFrame(tick);
        };
        tickFrame = requestAnimationFrame(tick);
        void animation.finished.then(() => {
          if (cancelled || finished) return;
          cancelAnimationFrame(tickFrame);
          stopRollAudio();
          setPhase('suspense');
          playRollSuspense(SUSPENSE_MS);
          revealTimer = setTimeout(finish, SUSPENSE_MS);
        }).catch(() => undefined);
      }, 240);
    }
    const resize = new ResizeObserver(() => { if (finished) strip.style.transform = `translateX(${target()}px)`; });
    resize.observe(viewport);
    return () => { cancelled = true; clearTimeout(startTimer); clearTimeout(revealTimer); cancelAnimationFrame(tickFrame); stopRollAudio(); animation?.cancel(); resize.disconnect(); };
  }, [cards, winIndex, tier]);

  // While the pull is presented: Escape closes, the "Open again" button has focus (Space/Enter re-rolls, like the case screen).
  // The tier effect plays first; then the coin card slides in over it.
  useEffect(() => {
    if (!presenting) { setPanel(false); return; }
    const timer = window.setTimeout(() => setPanel(true), 900);
    return () => window.clearTimeout(timer);
  }, [presenting]);

  useEffect(() => {
    if (!presenting) return;
    againRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setPresenting(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [presenting, panel]);

  const skipToEnd = () => { finishRef.current(); };
  const fullscreen = !settled || presenting;
  const winner = cards[winIndex];
  const chance = odds?.[tier];

  return (
    <div ref={viewportRef}
      className={`spinner roll-stage roll-${phase} ${fullscreen ? 'roll-fullscreen' : ''} ${presenting ? `roll-presenting fx-${tier}` : ''} ${presenting && panel && reveal ? 'roll-panel' : ''}`}
      style={{ '--reveal-color': settled ? tierColor(tier) : '#FFC53D' } as React.CSSProperties}
      role={presenting ? 'dialog' : undefined} aria-modal={presenting || undefined} aria-label={presenting ? headline : undefined}
      onClick={(event) => { if (!settled) skipToEnd(); else if (presenting && event.target === event.currentTarget) setPresenting(false); }}>
      {!settled && <div className="reel-overlay-title" aria-hidden="true"><span>LOCKABOX</span><strong>{t('reelOpening')}</strong></div>}
      {presenting && <div className="reveal-title" aria-live="polite"><span style={{ color: tierColor(tier) }}>{tierLabel(tier)}{chance ? ` · ${t('revealOdds', { percent: number(chance / 100, { maximumFractionDigits: 2 }) })}` : ''}</span><strong>{headline}</strong></div>}
      <div className="marker" aria-hidden="true" />
      <div className="reveal-burst" aria-hidden="true" />
      {presenting && <div className="reveal-flash" aria-hidden="true" />}
      {presenting && (tier === 'large' || tier === 'top') && <div className="reveal-rays" aria-hidden="true" />}
      {presenting && CONFETTI[tier] > 0 && <Confetti count={CONFETTI[tier]} tier={tier} />}
      {!settled && <button type="button" className="reel-skip" onClick={(event) => { event.stopPropagation(); skipToEnd(); }}>{t('reelSkip')} <span aria-hidden="true">»</span></button>}
      {!settled && <span className="reel-overlay-hint" aria-hidden="true">{t('reelHint')}</span>}
      <div ref={stripRef} className={`reel-strip ${settled ? 'settled' : ''}`}>
        {cards.map((card, index) => <ReelCard key={`${card.id}-${index}`} card={card} winner={settled && index === winIndex} />)}
      </div>
      {presenting && panel && reveal && <div className="reveal-panel" onClick={(event) => event.stopPropagation()}>
        {reveal({ close: () => setPresenting(false), again: () => { setPresenting(false); onRollAgain?.(); }, againRef })}
      </div>}
      {presenting && winner && !reveal && <div className="reveal-actions">
        <strong className="reveal-symbol">${displaySymbol(winner)}</strong>
        <div>
          <button ref={againRef} type="button" className="button button-primary" onClick={(event) => { event.stopPropagation(); setPresenting(false); onRollAgain?.(); }}>{t('openAgain')}</button>
          <button type="button" className="button button-outline" onClick={(event) => { event.stopPropagation(); setPresenting(false); }}>{t('revealDetails')}</button>
        </div>
      </div>}
    </div>
  );
}

function Confetti({ count, tier }: { count: number; tier: Tier }) {
  // Random layout is decided once per reveal (state initialiser), so re-renders don't reshuffle it.
  const [pieces] = useState(() => Array.from({ length: count }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * (tier === 'top' ? 1.2 : 0.6), duration: 2.2 + Math.random() * 1.8,
    drift: (Math.random() - 0.5) * 240, spin: (Math.random() - 0.5) * 1440, size: 6 + Math.random() * 7,
    color: tier === 'top' ? ['#FFC53D', '#FFE08A', '#FF5B1F', '#FFFFFF'][i % 4] : [tierColor(tier), '#FFFFFF', '#FFC53D'][i % 3],
  })));
  return <div className="confetti" aria-hidden="true">{pieces.map((p, i) => <i key={i} style={{ left: `${p.left}%`, width: p.size, height: p.size * 0.45, background: p.color, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s`, '--drift': `${p.drift}px`, '--spin': `${p.spin}deg` } as React.CSSProperties} />)}</div>;
}

function ReelCard({ card, winner }: { card: AssetCard; winner: boolean }) {
  const symbol = displaySymbol(card);
  return <div className={`reel-card tier-${card.tier} ${winner ? 'winner' : ''}`} style={{ '--rarity': tierColor(card.tier) } as React.CSSProperties}>
    <div className="reel-art"><TokenImage src={card.imageUrl} symbol={symbol} identity={`${card.chainId}:${card.address}`} /></div>
    <b>${symbol}</b><span>{tierLabel(card.tier)}</span>
  </div>;
}
