import { describe, it, expect } from 'vitest';
import { detectMulti } from '../utils.js';

describe('detectMulti', () => {
  describe('known chains', () => {
    it('matches LKQ at 1.0x', () => {
      expect(detectMulti('LKQ Pick Your Part Houston')).toEqual({ multi: 1.0, reason: 'Matched known chain: lkq' });
    });
    it('matches Pull-A-Part at 0.9x', () => {
      expect(detectMulti('Pull-A-Part Nashville')).toEqual({ multi: 0.9, reason: 'Matched known chain: pull-a-part' });
    });
    it('matches U-Pull-It at 0.85x', () => {
      expect(detectMulti('U-Pull-It Denver')).toEqual({ multi: 0.85, reason: 'Matched known chain: u-pull-it' });
    });
    it('matches Copart at 0.65x', () => {
      expect(detectMulti('Copart Auto Auctions')).toEqual({ multi: 0.65, reason: 'Matched known chain: copart' });
    });
    it('matches IAAI at 0.65x', () => {
      expect(detectMulti('IAAI Orlando')).toEqual({ multi: 0.65, reason: 'Matched known chain: iaai' });
    });
    it('matches Gershow at 1.05x', () => {
      expect(detectMulti('Gershow Recycling NY')).toEqual({ multi: 1.05, reason: 'Matched known chain: gershow' });
    });
    it('matches Runyon at 0.92x', () => {
      expect(detectMulti("Runyon's Used Auto Indiana")).toEqual({ multi: 0.92, reason: "Matched known chain: runyon" });
    });
    it('matches NAPA at 1.2x', () => {
      expect(detectMulti('NAPA Auto Parts')).toEqual({ multi: 1.2, reason: 'Matched known chain: napa' });
    });
    it('is case-insensitive', () => {
      expect(detectMulti('LKQ')).toEqual(detectMulti('lkq'));
    });
  });

  describe('regex-based patterns', () => {
    it('auction yards at 0.65x', () => {
      const result = detectMulti('Springfield Auto Auction');
      expect(result.multi).toBe(0.65);
      expect(result.reason).toBe('Auction yard');
    });
    it('bid yards at 0.65x', () => {
      expect(detectMulti('Bid4Cars salvage')).toMatchObject({ multi: 0.65 });
    });
    it('u-pull pattern at 0.88x for unknown yard name with u-pull keyword', () => {
      // "u-pull" is a known chain key (0.85x) so use a string that hits the regex but not the chain map
      expect(detectMulti('self-serve auto').multi).toBe(0.88);
    });
    it('self-service pattern at 0.88x', () => {
      expect(detectMulti('Self-Serve Auto Parts').multi).toBe(0.88);
    });
    it('full-service pattern at 1.2x', () => {
      expect(detectMulti('Full Service Auto').multi).toBe(1.2);
    });
    it('dealer pattern at 1.2x', () => {
      expect(detectMulti('Dealer Direct Parts').multi).toBe(1.2);
    });
    it('salvage pattern at 0.95x', () => {
      expect(detectMulti('Riverside Salvage Yard').multi).toBe(0.95);
    });
    it('junk pattern at 0.95x', () => {
      expect(detectMulti("Jim's Junkyard").multi).toBe(0.95);
    });
    it('craigslist at 0.65x', () => {
      expect(detectMulti('craigslist listing').multi).toBe(0.65);
    });
    it('facebook at 0.65x', () => {
      expect(detectMulti('Facebook Marketplace').multi).toBe(0.65);
    });
    it('private at 0.65x', () => {
      expect(detectMulti('private seller').multi).toBe(0.65);
    });
  });

  describe('fallback', () => {
    it('unknown yard returns 1.0x standard', () => {
      expect(detectMulti('Bobs Auto Parts')).toEqual({ multi: 1.0, reason: 'Standard yard' });
    });
    it('empty string returns 1.0x standard', () => {
      expect(detectMulti('')).toEqual({ multi: 1.0, reason: 'Standard yard' });
    });
    it('null returns 1.0x standard', () => {
      expect(detectMulti(null)).toEqual({ multi: 1.0, reason: 'Standard yard' });
    });
    it('undefined returns 1.0x standard', () => {
      expect(detectMulti(undefined)).toEqual({ multi: 1.0, reason: 'Standard yard' });
    });
  });
});
