import { describe, it, expect } from 'vitest';
import { analyzeVehicle } from '../utils.js';

describe('analyzeVehicle', () => {
  describe('display field', () => {
    it('title-cases the raw input', () => {
      const { display } = analyzeVehicle('2015 ford f-150');
      expect(display).toBe('2015 Ford F-150');
    });
  });

  describe('year extraction', () => {
    it('extracts 4-digit year', () => {
      expect(analyzeVehicle('2015 F-150').year).toBe(2015);
    });
    it('defaults to 2010 when no year present', () => {
      expect(analyzeVehicle('Ford Mustang').year).toBe(2010);
    });
    it('handles 1990s years', () => {
      expect(analyzeVehicle('1998 Toyota Supra').year).toBe(1998);
    });
  });

  describe('tier classification', () => {
    it('exotic — Ferrari', () => {
      expect(analyzeVehicle('2015 Ferrari 488').tier).toBe('exotic');
    });
    it('exotic — Lamborghini', () => {
      expect(analyzeVehicle('2018 Lamborghini Huracan').tier).toBe('exotic');
    });
    it('classic — pre-1980 muscle', () => {
      expect(analyzeVehicle('1969 Chevrolet Camaro').tier).toBe('classic');
    });
    it('sport — JDM Supra', () => {
      expect(analyzeVehicle('1998 Toyota Supra').tier).toBe('sport');
    });
    it('sport — muscle Mustang', () => {
      expect(analyzeVehicle('2015 Ford Mustang GT').tier).toBe('sport');
    });
    it('diesel_truck — Ram 1500 Cummins', () => {
      // ram\s*\d requires a digit after "ram" to match as pickup
      expect(analyzeVehicle('2019 Ram 1500 Cummins diesel').tier).toBe('diesel_truck');
    });
    it('truck — F-150', () => {
      expect(analyzeVehicle('2020 Ford F-150').tier).toBe('truck');
    });
    it('mid — generic sedan', () => {
      expect(analyzeVehicle('2012 Honda Accord').tier).toBe('mid');
    });
    it('premium — BMW 3-series non-luxury', () => {
      expect(analyzeVehicle('2015 BMW 328i').tier).toBe('premium');
    });
  });

  describe('boolean flags', () => {
    it('isPickup true for F-150', () => {
      expect(analyzeVehicle('2020 Ford F-150').isPickup).toBe(true);
    });
    it('isPickup true for Tacoma', () => {
      expect(analyzeVehicle('2019 Toyota Tacoma').isPickup).toBe(true);
    });
    it('isPickup false for Civic', () => {
      expect(analyzeVehicle('2018 Honda Civic').isPickup).toBe(false);
    });
    it('isSUV true for Tahoe', () => {
      expect(analyzeVehicle('2015 Chevrolet Tahoe').isSUV).toBe(true);
    });
    it('isSUV true for 4Runner', () => {
      expect(analyzeVehicle('2017 Toyota 4Runner').isSUV).toBe(true);
    });
    it('isDiesel true for Cummins', () => {
      expect(analyzeVehicle('2019 Ram Cummins').isDiesel).toBe(true);
    });
    it('isDiesel true for Duramax', () => {
      expect(analyzeVehicle('2018 Chevy Silverado Duramax').isDiesel).toBe(true);
    });
    it('isHybrid true for Prius', () => {
      expect(analyzeVehicle('2017 Toyota Prius').isHybrid).toBe(true);
    });
    it('isTurbo true for STI', () => {
      expect(analyzeVehicle('2005 Subaru STI').isTurbo).toBe(true);
    });
    it('isTurbo true for Hellcat', () => {
      expect(analyzeVehicle('2015 Dodge Challenger Hellcat').isTurbo).toBe(true);
    });
    it('is4WD true for 4WD vehicle', () => {
      expect(analyzeVehicle('2018 F-150 4x4').is4WD).toBe(true);
    });
    it('is4WD true for Rubicon', () => {
      expect(analyzeVehicle('2020 Jeep Wrangler Rubicon').is4WD).toBe(true);
    });
    it('isJDM true for Supra', () => {
      expect(analyzeVehicle('1998 Supra').isJDM).toBe(true);
    });
    it('isClassic true for pre-1980 muscle', () => {
      expect(analyzeVehicle('1969 Camaro Z28').isClassic).toBe(true);
    });
    it('isClassic false for modern Camaro', () => {
      expect(analyzeVehicle('2020 Camaro SS').isClassic).toBe(false);
    });
    it('isExotic true for Ferrari', () => {
      expect(analyzeVehicle('Ferrari 458').isExotic).toBe(true);
    });
    it('isVan true for Odyssey', () => {
      expect(analyzeVehicle('2015 Honda Odyssey').isVan).toBe(true);
    });
    it('isMuscle true for Challenger', () => {
      expect(analyzeVehicle('2015 Dodge Challenger').isMuscle).toBe(true);
    });
  });

  describe('score', () => {
    it('never exceeds 99', () => {
      // Exotic + turbo + 4WD — test score cap
      const { score } = analyzeVehicle('2018 Ferrari GTB 4WD Turbo');
      expect(score).toBeLessThanOrEqual(99);
    });
    it('exotic scores highest (97 base)', () => {
      expect(analyzeVehicle('Ferrari 458').score).toBeGreaterThanOrEqual(97);
    });
    it('mid scores lowest base (70)', () => {
      const { score } = analyzeVehicle('2012 Honda Accord');
      expect(score).toBe(70);
    });
    it('turbo adds +4 to base score', () => {
      const base = analyzeVehicle('2012 Subaru WRX').score;
      // WRX is sport (88) + turbo (4) = 92
      expect(base).toBe(92);
    });
    it('4WD adds +3 to base score', () => {
      const base = analyzeVehicle('2018 Toyota 4Runner 4WD');
      // SUV = truck (80) + 4WD (3) = 83
      expect(base.score).toBe(83);
    });
  });

  describe('engine string', () => {
    it('detects diesel', () => {
      expect(analyzeVehicle('2018 Ram 2500 Cummins diesel').engine).toContain('Diesel');
    });
    it('detects turbo', () => {
      expect(analyzeVehicle('2005 Subaru WRX STI').engine).toContain('Turbo');
    });
    it('defaults to V8 when no cylinder hint', () => {
      expect(analyzeVehicle('2015 Dodge Challenger').engine).toContain('V8');
    });
    it('detects I6 for 2JZ', () => {
      expect(analyzeVehicle('1998 Toyota Supra 2JZ').engine).toContain('I6');
    });
    it('detects V6', () => {
      expect(analyzeVehicle('2014 Mustang V6 3.7').engine).toContain('V6');
    });
  });

  describe('multiplier values', () => {
    it('exotic M = 5', () => {
      expect(analyzeVehicle('Ferrari 458').M).toBe(5);
    });
    it('diesel_truck M = 1.6', () => {
      expect(analyzeVehicle('2019 Ram 1500 Cummins diesel').M).toBe(1.6);
    });
    it('mid M = 1', () => {
      expect(analyzeVehicle('2012 Honda Accord').M).toBe(1);
    });
  });
});
