'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { displaySymbol, tierColor, tierLabel, type AssetCard, type Tier } from './api';

export function RollReel({ cards, winIndex, tier, onSettled }: { cards: AssetCard[]; winIndex: number; tier: Tier; onSettled?: () => void }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef(0);
  const onSettledRef = useRef(onSettled);
  const [settled, setSettled] = useState(false);
  onSettledRef.current = onSettled;

  useLayoutEffect(() => {
    if (!viewportRef.current || !stripRef.current || !cards[winIndex]) return;
    const card = stripRef.current.children[winIndex] as HTMLElement | undefined;
    if (!card) return;
    const target = viewportRef.current.clientWidth / 2 - (card.offsetLeft + card.offsetWidth / 2);
    targetRef.current = target;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setSettled(false);
    stripRef.current.style.transition = 'none';
    stripRef.current.style.transform = 'translateX(0)';
    if (reduced) {
      stripRef.current.style.transform = `translateX(${target}px)`;
      setSettled(true);
      onSettledRef.current?.();
    } else {
      const frame = requestAnimationFrame(() => {
        if (!stripRef.current) return;
        stripRef.current.style.transition = 'transform 5s cubic-bezier(.08,.6,.12,1)';
        stripRef.current.style.transform = `translateX(${target}px)`;
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [cards, winIndex]);

  const skipToEnd = () => {
    if (settled || !stripRef.current) return;
    stripRef.current.style.transition = 'none';
    stripRef.current.style.transform = `translateX(${targetRef.current}px)`;
    setSettled(true);
    onSettledRef.current?.();
  };

  return (
    <div ref={viewportRef} className={`spinner ${tier === 'top' && settled ? 'top-celebration' : ''}`} onClick={skipToEnd}>
      <div className="marker" aria-hidden="true" />
      <div ref={stripRef} className={`reel-strip ${settled ? 'settled' : ''}`} onTransitionEnd={(event) => { if (event.target !== event.currentTarget || event.propertyName !== 'transform') return; setSettled(true); onSettledRef.current?.(); }}>
        {cards.map((card, index) => <ReelCard key={`${card.id}-${index}`} card={card} winner={index === winIndex} />)}
      </div>
    </div>
  );
}

function ReelCard({ card, winner }: { card: AssetCard; winner: boolean }) {
  const symbol = displaySymbol(card);
  return <div className={`reel-card ${winner ? 'winner' : ''}`} style={{ '--rarity': tierColor(card.tier) } as React.CSSProperties}>
    <div className="reel-art" style={{ background: card.imageUrl ? `url(${card.imageUrl}) center/cover` : undefined }}>{card.imageUrl ? null : symbol[0]}</div>
    <b>${symbol}</b><span>{tierLabel(card.tier)}</span>
  </div>;
}
