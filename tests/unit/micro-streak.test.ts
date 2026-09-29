import { describe, expect, it } from 'vitest';
import { MICRO_STREAK, nextMicroStreak } from '@/components/rollAudio';
import type { Tier } from '@/components/api';

describe('micro streak', () => {
  it('counts Micro pulls in a row and resets on anything better', () => {
    const run = (tiers: Tier[]) => tiers.reduce(nextMicroStreak, 0);
    expect(MICRO_STREAK).toBe(3);
    expect(run(['micro', 'micro'])).toBe(2);
    expect(run(['micro', 'micro', 'micro'])).toBeGreaterThanOrEqual(MICRO_STREAK);
    expect(run(['micro', 'micro', 'small', 'micro'])).toBe(1);
    expect(run(['micro', 'micro', 'micro', 'micro'])).toBe(4); // keeps laughing while the streak lasts
  });
});
