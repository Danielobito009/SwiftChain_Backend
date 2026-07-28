/**
 * Unit tests for the decimal <-> stroop conversion helpers used when passing
 * escrow amounts to Soroban contracts as `i128` values.
 */

import { MAX_CONVERTIBLE_AMOUNT, fromStroops, toStroops } from '../src/utils/stroops';

describe('toStroops', () => {
  it.each([
    [1, 10_000_000n],
    [150, 1_500_000_000n],
    [15.99, 159_900_000n], // 15.99 * 1e7 is 159899999.99999997 in float maths
    [0.0000001, 1n],
    [1234.5678901, 12_345_678_901n],
  ])('converts %p to %p stroops', (amount, expected) => {
    expect(toStroops(amount)).toBe(expected);
  });

  it('rounds to the 7th decimal place', () => {
    expect(toStroops(0.123456789)).toBe(1_234_568n);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects %p', (amount) => {
    expect(() => toStroops(amount)).toThrow(RangeError);
  });

  it('rejects amounts that would lose precision', () => {
    expect(() => toStroops(MAX_CONVERTIBLE_AMOUNT * 10)).toThrow(RangeError);
  });
});

describe('fromStroops', () => {
  it('renders stroops as a fixed 7-decimal string', () => {
    expect(fromStroops(159_900_000n)).toBe('15.9900000');
    expect(fromStroops(1n)).toBe('0.0000001');
    expect(fromStroops(0n)).toBe('0.0000000');
    expect(fromStroops(-1_500_000_000n)).toBe('-150.0000000');
  });

  it('round-trips through toStroops', () => {
    expect(Number(fromStroops(toStroops(15.99)))).toBe(15.99);
  });
});
