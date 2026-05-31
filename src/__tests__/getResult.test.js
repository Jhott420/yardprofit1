import { describe, it, expect } from 'vitest';
import { getResult } from '../utils.js';

describe('getResult', () => {
  describe('null/empty guard', () => {
    it('returns null for null input', () => expect(getResult(null)).toBeNull());
    it('returns null for empty string', () => expect(getResult('')).toBeNull());
    it('returns null for whitespace', () => expect(getResult('   ')).toBeNull());
    it('returns null for undefined', () => expect(getResult(undefined)).toBeNull());
  });

  describe('output shape', () => {
    it('returns expected top-level keys', () => {
      const r = getResult('2018 Toyota Camry');
      expect(r).toHaveProperty('key');
      expect(r).toHaveProperty('engine');
      expect(r).toHaveProperty('score');
      expect(r).toHaveProperty('tip');
      expect(r).toHaveProperty('totalProfit');
      expect(r).toHaveProperty('parts');
      expect(r).toHaveProperty('info');
    });
    it('key is the title-cased vehicle display name', () => {
      expect(getResult('2018 toyota camry').key).toBe('2018 Toyota Camry');
    });
    it('parts is a non-empty array', () => {
      const { parts } = getResult('2018 Toyota Camry');
      expect(Array.isArray(parts)).toBe(true);
      expect(parts.length).toBeGreaterThan(0);
    });
    it('totalProfit equals sum of part profits', () => {
      const { totalProfit, parts } = getResult('2018 Toyota Camry');
      const sum = parts.reduce((acc, p) => acc + p.profit, 0);
      expect(totalProfit).toBe(sum);
    });
    it('score is between 1 and 99', () => {
      const { score } = getResult('2018 Toyota Camry');
      expect(score).toBeGreaterThanOrEqual(1);
      expect(score).toBeLessThanOrEqual(99);
    });
  });

  describe('yard multiplier wiring', () => {
    it('lower yard multiplier increases total profit', () => {
      const cheap = getResult('2018 Honda Accord', 0.65);
      const expensive = getResult('2018 Honda Accord', 1.5);
      expect(cheap.totalProfit).toBeGreaterThan(expensive.totalProfit);
    });
    it('defaults to 1.0 yard multiplier', () => {
      const def = getResult('2018 Honda Accord');
      const explicit = getResult('2018 Honda Accord', 1.0);
      expect(def.totalProfit).toBe(explicit.totalProfit);
    });
  });

  describe('vehicle-specific tips', () => {
    it('exotic tip mentions worldwide shipping', () => {
      expect(getResult('Ferrari 458').tip.toLowerCase()).toContain('worldwide');
    });
    it('diesel tip mentions DPF', () => {
      expect(getResult('2019 Ram Cummins diesel').tip).toContain('DPF');
    });
    it('hybrid tip mentions Prius', () => {
      expect(getResult('2017 Toyota Prius').tip.toLowerCase()).toContain('prius');
    });
    it('pickup tip mentions tailgate', () => {
      expect(getResult('2018 Ford F-150').tip.toLowerCase()).toContain('tailgate');
    });
    it('classic tip mentions restorer', () => {
      expect(getResult('1969 Camaro').tip.toLowerCase()).toContain('restorer');
    });
  });
});
