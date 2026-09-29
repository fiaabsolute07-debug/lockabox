import { describe, expect, it } from 'vitest';
import { MICRO_STREAK, nextMicroStreak, specialSoundFor, TOP_AIRHORN_CHANCE, TOP_WOW_CHANCE } from '@/components/rollAudio';
import type { Tier } from '@/components/api';

const glorp = { symbol: 'GLORP', name: 'Glorp' };
const pull = (tier: Tier, rollsThisVisit: number, microStreak: number, asset: { symbol?: string | null; name?: string | null } = glorp) => specialSoundFor({ tier, rollsThisVisit, microStreak, asset });

describe('special reveal sounds', () => {
  it('counts Micro pulls in a row and resets on anything better', () => {
    const run = (tiers: Tier[]) => tiers.reduce(nextMicroStreak, 0);
    expect(MICRO_STREAK).toBe(3);
    expect(run(['micro', 'micro'])).toBe(2);
    expect(run(['micro', 'micro', 'small', 'micro'])).toBe(1);
    expect(run(['micro', 'micro', 'micro', 'micro'])).toBe(4); // keeps laughing while the streak lasts
  });
  it('laughs from the third Micro in a row', () => {
    expect(pull('micro', 2, 2)).toBeUndefined();
    expect(pull('micro', 3, 3)).toBe('micro-streak');
  });
  it('yippee only when the first roll of the visit is a purple Mid', () => {
    expect(pull('mid', 1, 0)).toBe('first-mid');
    expect(pull('mid', 2, 0)).toBeUndefined();
    expect(pull('large', 1, 0)).toBeUndefined();
  });
  it('bonks any coin with doge in its symbol or name, ahead of everything else', () => {
    expect(pull('micro', 1, 0, { symbol: 'DOGE', name: 'Dogecoin' })).toBe('doge');
    expect(pull('mid', 1, 0, { symbol: 'BABY', name: 'Baby Dogecoin' })).toBe('doge');
    expect(pull('micro', 5, 5, { symbol: 'kdoge', name: null })).toBe('doge');
    expect(pull('small', 2, 0, { symbol: 'DOG', name: 'Dog Wif Hat' })).toBeUndefined();
  });
  it('a gold Top gets the airhorn one time in three and the anime wow one time in ten', () => {
    const top = (r: number) => specialSoundFor({ tier: 'top', rollsThisVisit: 2, microStreak: 0, asset: glorp }, () => r);
    expect(TOP_AIRHORN_CHANCE).toBeCloseTo(1 / 3);
    expect(top(0.1)).toBe('top-airhorn');
    expect(top(0.33)).toBe('top-airhorn');
    expect(top(0.34)).toBe('top-wow');
    expect(top(0.43)).toBe('top-wow');
    expect(top(0.44)).toBeUndefined();
    expect(TOP_WOW_CHANCE).toBe(0.1);
    expect(specialSoundFor({ tier: 'large', rollsThisVisit: 2, microStreak: 0, asset: glorp }, () => 0)).toBeUndefined();
  });
});
