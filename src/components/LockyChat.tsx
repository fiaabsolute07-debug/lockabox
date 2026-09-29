'use client';

import { useRef, useState } from 'react';
import { LockyLogo } from './LockyLogo';

// Locky's hover lines: English slang, playful, never a word about price or returns (LAB §0.4.8),
// and none of the risk-label words the case page must not show.
export const LOCKY_LINES = [
  'gm ser.',
  'wen unlock?',
  'i am locked. pls roll.',
  'one more case. trust.',
  'ser, that is my hat.',
  'press space. i dare u.',
  'not financial advice. i am a box.',
  'who opened me?? oh. u.',
  'the cap stays on.',
  'fresh pull incoming?',
  'box mode: engaged.',
  'lfg (to the next case).',
];

/** Locky with a speech bubble on hover. A new line each time, never the same one twice in a row. */
export function LockyChat({ size, placement = 'above' }: { size?: number; placement?: 'above' | 'below' }) {
  const [line, setLine] = useState<string | null>(null);
  const last = useRef(-1);
  const say = () => {
    let next = Math.floor(Math.random() * LOCKY_LINES.length);
    if (next === last.current) next = (next + 1) % LOCKY_LINES.length;
    last.current = next;
    setLine(LOCKY_LINES[next]);
  };
  return (
    <span className={`locky-chat locky-chat-${placement}`} onMouseEnter={say} onMouseLeave={() => setLine(null)}>
      <LockyLogo size={size} />
      {line && <span className="locky-bubble" aria-hidden="true">{line}</span>}
    </span>
  );
}
