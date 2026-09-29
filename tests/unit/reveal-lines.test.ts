import { describe, expect, it } from 'vitest';
import { pickRevealLine, REVEAL_LINES } from '@/components/revealLines';

describe('reveal headlines', () => {
  it('every tier has several lines and keeps its original headline first', () => {
    for (const lines of Object.values(REVEAL_LINES)) expect(lines.length).toBeGreaterThanOrEqual(5);
    expect(REVEAL_LINES.micro[0]).toBe('Womp womp…');
    expect(REVEAL_LINES.top[0]).toBe('★ TOP PULL!');
  });
  it('never promises returns or uses the words the case page must not show', () => {
    for (const line of Object.values(REVEAL_LINES).flat()) {
      expect(line).not.toMatch(/risk|safe|scam|rug|moon|100x|guarantee|profit|lambo|rich/i);
    }
  });
  it('picks from the right tier', () => {
    expect(pickRevealLine('mid', () => 0)).toBe(REVEAL_LINES.mid[0]);
    expect(pickRevealLine('top', () => 0.999)).toBe(REVEAL_LINES.top.at(-1));
  });
});
