import type { Tier } from './api';

// Reveal headlines, one picked at random per pull. Playful, never a word about price or returns
// (LAB §0.4.8) and none of the risk-label words the case page must not show. The first line of each
// tier is the original headline.
export const REVEAL_LINES: Record<Tier, readonly string[]> = {
  micro: [
    'Womp womp…',
    'Down bad.',
    'It’s giving dust.',
    'Locky is not mad, just disappointed.',
    'Certified micro moment.',
    'Pocket lint unlocked.',
    'Skill issue (it was RNG).',
    'We don’t talk about this one.',
    'Box said: nah.',
  ],
  small: [
    'Small pull',
    'Humble beginnings.',
    'Smol but honest.',
    'A pull is a pull.',
    'Cute. Small, but cute.',
    'Locky nods politely.',
    'Not bad, not a banger.',
    'Warm-up round.',
  ],
  mid: [
    'Nice pull!',
    'Okay, we’re cooking.',
    'Locky raised an eyebrow.',
    'Solid. Very solid.',
    'Respectable pull, ser.',
    'The box approves.',
    'Now we’re talking.',
  ],
  large: [
    'Big pull!',
    'Sheesh.',
    'Absolute unit.',
    'Locky dropped his hat.',
    'Locky is shaking.',
    'Main character pull.',
    'Chat, is this real?',
  ],
  top: [
    '★ TOP PULL!',
    '★ HOLY BOX!',
    '★ LOCKY FAINTED.',
    '★ NO WAY. NO WAY.',
    '★ CERTIFIED LEGEND PULL.',
    '★ SCREENSHOT THIS.',
    '★ THE BOX CHOSE YOU.',
  ],
};

export function pickRevealLine(tier: Tier, random = Math.random) {
  const lines = REVEAL_LINES[tier];
  return lines[Math.floor(random() * lines.length)];
}
