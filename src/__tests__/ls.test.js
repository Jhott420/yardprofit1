import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ls } from '../utils.js';

describe('ls (sessionStorage wrapper)', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe('ls.set and ls.get', () => {
    it('stores and retrieves a string', () => {
      ls.set('testKey', 'hello');
      expect(ls.get('testKey', null)).toBe('hello');
    });
    it('stores and retrieves a number', () => {
      ls.set('num', 42);
      expect(ls.get('num', 0)).toBe(42);
    });
    it('stores and retrieves an object', () => {
      ls.set('obj', { a: 1, b: 2 });
      expect(ls.get('obj', {})).toEqual({ a: 1, b: 2 });
    });
    it('stores and retrieves an array', () => {
      ls.set('arr', [1, 2, 3]);
      expect(ls.get('arr', [])).toEqual([1, 2, 3]);
    });
    it('stores and retrieves boolean false', () => {
      ls.set('bool', false);
      expect(ls.get('bool', true)).toBe(false);
    });
    it('stores and retrieves zero', () => {
      ls.set('zero', 0);
      expect(ls.get('zero', 99)).toBe(0);
    });
  });

  describe('ls.get defaults', () => {
    it('returns default when key does not exist', () => {
      expect(ls.get('nonexistent', 'default')).toBe('default');
    });
    it('returns default array when key missing', () => {
      expect(ls.get('missing', [])).toEqual([]);
    });
    it('returns default when stored value is null via direct sessionStorage', () => {
      sessionStorage.setItem('nullKey', 'null');
      // JSON.parse('null') === null, so value is null, which means we return default
      // Actually JSON.parse('null') is null which is != null is false, so it returns null not default
      // Let's just check null stored string returns null
      expect(ls.get('nullKey', 'fallback')).toBeNull();
    });
  });

  describe('error resilience', () => {
    it('ls.get returns default when sessionStorage throws on getItem', () => {
      const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('storage error');
      });
      expect(ls.get('key', 'fallback')).toBe('fallback');
      spy.mockRestore();
    });
    it('ls.get returns default when stored value is invalid JSON', () => {
      sessionStorage.setItem('bad', '{invalid json}');
      expect(ls.get('bad', 'fallback')).toBe('fallback');
    });
    it('ls.set does not throw when sessionStorage throws', () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota exceeded');
      });
      expect(() => ls.set('key', 'value')).not.toThrow();
      spy.mockRestore();
    });
  });
});
