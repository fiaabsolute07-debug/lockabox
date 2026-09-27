'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { displaySymbol, tierColor, tierLabel, type AssetCard, type Tier } from './api';
import { useT } from './i18n';
import { playRollBed, playRollReveal, playRollStart, playRollTick, stopRollAudio } from './rollAudio';

export function RollReel({ cards, winIndex, tier, onSettled }: { cards: AssetCard[]; winIndex: number; tier: Tier; onSettled?: () => void }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const finishRef = useRef<() => void>(() => undefined);
  const onSettledRef = useRef(onSettled);
  const landingRef = useRef<{ cards: AssetCard[]; winIndex: number; fraction: number } | null>(null);
  const [settled, setSettled] = useState(false);
  const [phase, setPhase] = useState<'charging' | 'spinning' | 'suspense' | 'revealed'>('charging');
  const { t } = useT();
  onSettledRef.current = onSettled;

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
      stopRollAudio();
      playRollReveal(tier);
      onSettledRef.current?.();
    };
    finishRef.current = finish;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setSettled(false);
    setPhase('charging');
    strip.style.transform = 'translateX(0)';
    if (reduced) {
      finish();
    } else {
      playRollStart();
      startTimer = setTimeout(() => {
        setPhase('spinning');
        playRollBed();
        animation = strip.animate([
          { transform: 'translateX(0)' },
          { transform: `translateX(${target()}px)` },
        ], { duration: 4700, easing: 'cubic-bezier(.12,.68,.12,1)', fill: 'forwards' });
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
          revealTimer = setTimeout(finish, 380);
        }).catch(() => undefined);
      }, 240);
    }
    const resize = new ResizeObserver(() => { if (finished) strip.style.transform = `translateX(${target()}px)`; });
    resize.observe(viewport);
    return () => { cancelled = true; clearTimeout(startTimer); clearTimeout(revealTimer); cancelAnimationFrame(tickFrame); stopRollAudio(); animation?.cancel(); resize.disconnect(); };
  }, [cards, winIndex, tier]);

  const skipToEnd = () => {
    finishRef.current();
  };

  return (
    <div ref={viewportRef} className={`spinner roll-stage roll-${phase} ${tier === 'top' && settled ? 'top-celebration' : ''}`} style={{ '--reveal-color': settled ? tierColor(tier) : '#FFC53D' } as React.CSSProperties} onClick={skipToEnd}>
      {!settled && <div className="reel-overlay-title" aria-hidden="true"><span>LOCKABOX</span><strong>{t('reelOpening')}</strong></div>}
      <div className="marker" aria-hidden="true" />
      <div className="reveal-burst" aria-hidden="true" />
      {!settled && <button type="button" className="reel-skip" onClick={(event) => { event.stopPropagation(); skipToEnd(); }}>{t('reelSkip')} <span aria-hidden="true">»</span></button>}
      {!settled && <span className="reel-overlay-hint" aria-hidden="true">{t('reelHint')}</span>}
      <div ref={stripRef} className={`reel-strip ${settled ? 'settled' : ''}`}>
        {cards.map((card, index) => <ReelCard key={`${card.id}-${index}`} card={card} winner={settled && index === winIndex} />)}
      </div>
    </div>
  );
}

function ReelCard({ card, winner }: { card: AssetCard; winner: boolean }) {
  const symbol = displaySymbol(card);
  return <div className={`reel-card tier-${card.tier} ${winner ? 'winner' : ''}`} style={{ '--rarity': tierColor(card.tier) } as React.CSSProperties}>
    <div className="reel-art" style={{ background: card.imageUrl ? `url(${card.imageUrl}) center/cover` : undefined }}>{card.imageUrl ? null : symbol[0]}</div>
    <b>${symbol}</b><span>{tierLabel(card.tier)}</span>
  </div>;
}
