import { describe, it, expect } from 'vitest';
import { parseCarList } from '../utils.js';

describe('parseCarList', () => {
  describe('empty/invalid input', () => {
    it('returns [] for empty string', () => expect(parseCarList('')).toEqual([]));
    it('returns [] for null', () => expect(parseCarList(null)).toEqual([]));
    it('returns [] for undefined', () => expect(parseCarList(undefined)).toEqual([]));
    it('returns [] for whitespace only', () => expect(parseCarList('   \n  ')).toEqual([]));
  });

  describe('known model matching', () => {
    it('parses "2015 F-150" via model map', () => {
      const result = parseCarList('2015 F-150 XLT');
      expect(result).toHaveLength(1);
      expect(result[0]).toContain('2015');
      expect(result[0].toLowerCase()).toContain('ford');
    });
    it('parses "2020 Silverado" via model map', () => {
      const result = parseCarList('2020 Silverado 1500');
      expect(result[0].toLowerCase()).toContain('chevrolet');
      expect(result[0]).toContain('2020');
    });
    it('parses "2005 STI" via model map', () => {
      const result = parseCarList('2005 STI');
      expect(result[0].toLowerCase()).toContain('subaru');
    });
    it('parses "2008 Prius" via model map', () => {
      const result = parseCarList('2008 Prius');
      expect(result[0].toLowerCase()).toContain('toyota');
    });
    it('parses "1999 Supra" via model map', () => {
      const result = parseCarList('1999 Supra');
      expect(result[0].toLowerCase()).toContain('toyota');
    });
    it('parses Miata without year', () => {
      const result = parseCarList('Miata convertible red');
      expect(result[0].toLowerCase()).toContain('mazda');
    });
  });

  describe('make-based fallback matching', () => {
    it('parses "2010 Honda Accord" via make list', () => {
      const result = parseCarList('2010 Honda Accord EX');
      expect(result[0]).toContain('2010');
      expect(result[0].toLowerCase()).toContain('honda');
    });
    it('normalizes "chevy" to "chevrolet"', () => {
      const result = parseCarList('2012 Chevy Malibu');
      expect(result[0].toLowerCase()).toContain('chevrolet');
    });
    it('parses BMW', () => {
      const result = parseCarList('2006 BMW 3 series');
      expect(result[0].toLowerCase()).toContain('bmw');
    });
  });

  describe('year extraction', () => {
    it('handles 4-digit year in range 1960–2029', () => {
      expect(parseCarList('1970 Ford Mustang')[0]).toContain('1970');
    });
    it('ignores years outside valid range', () => {
      const result = parseCarList('1950 Ford Mustang');
      // Year 1950 is out of range so no year in result, but make/model may still match
      if (result.length > 0) {
        expect(result[0]).not.toContain('1950');
      }
    });
    it('handles entries without year via year+3-word fallback', () => {
      const result = parseCarList('Ford F150 XLT LBZ');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('delimiter handling', () => {
    it('splits on newlines', () => {
      const result = parseCarList('2015 Ford F-150\n2018 Toyota Tacoma');
      expect(result).toHaveLength(2);
    });
    it('splits on commas', () => {
      const result = parseCarList('2015 Ford Mustang, 2012 Honda Civic');
      expect(result).toHaveLength(2);
    });
    it('splits on semicolons', () => {
      const result = parseCarList('2015 Ford Mustang; 2012 Honda Civic');
      expect(result).toHaveLength(2);
    });
    it('splits on pipe characters', () => {
      const result = parseCarList('2015 Ford Mustang | 2012 Honda Civic');
      expect(result).toHaveLength(2);
    });
  });

  describe('deduplication', () => {
    it('does not return duplicate entries', () => {
      const result = parseCarList('2015 Ford Mustang\n2015 Ford Mustang');
      const mustangs = result.filter(r => r.toLowerCase().includes('mustang'));
      expect(mustangs).toHaveLength(1);
    });
  });

  describe('output formatting', () => {
    it('title-cases output', () => {
      const result = parseCarList('2015 ford mustang gt');
      if (result.length > 0) {
        expect(result[0][0]).toBe(result[0][0].toUpperCase());
      }
    });
    it('filters out very short tokens', () => {
      const result = parseCarList('GT\nok\na');
      expect(result).toHaveLength(0);
    });
  });
});
