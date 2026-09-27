import { describe, expect, it } from 'vitest';
import { formatPrice } from '@/components/api';

describe('UI price formatting', () => {
  it('uses two decimals at or above one dollar', () => {
    expect(formatPrice(1)).toBe('$1.00');
    expect(formatPrice(12.5)).toBe('$12.50');
  });

  it('uses four significant digits below one dollar', () => {
    expect(formatPrice(0.01552)).toBe('$0.01552');
    expect(formatPrice(0.0000036407)).toBe('$0.000003641');
    expect(formatPrice(0.004821)).toBe('$0.004821');
  });

  it('uses the current locale for decimal presentation', () => {
    expect(formatPrice(0.01552, 'vi-VN')).toBe('$0,01552');
  });
});
