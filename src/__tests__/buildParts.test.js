import { describe, it, expect } from 'vitest';
import { analyzeVehicle, buildParts } from '../utils.js';

function parts(raw, yardMult) {
  return buildParts(analyzeVehicle(raw), yardMult);
}

describe('buildParts', () => {
  describe('output structure', () => {
    it('returns an array', () => {
      expect(Array.isArray(parts('2015 Honda Civic'))).toBe(true);
    });
    it('each part has required fields', () => {
      const p = parts('2015 Honda Civic')[0];
      expect(p).toHaveProperty('name');
      expect(p).toHaveProperty('cat');
      expect(p).toHaveProperty('ebay');
      expect(p).toHaveProperty('yard');
      expect(p).toHaveProperty('profit');
      expect(p).toHaveProperty('demand');
      expect(p).toHaveProperty('weight');
      expect(p).toHaveProperty('search');
    });
    it('profit = ebay - yard for every part', () => {
      const ps = parts('2018 Toyota Camry');
      ps.forEach(p => {
        expect(p.profit).toBe(p.ebay - p.yard);
      });
    });
    it('returns parts sorted by profit descending', () => {
      const ps = parts('2018 Toyota Camry');
      for (let i = 0; i < ps.length - 1; i++) {
        expect(ps[i].profit).toBeGreaterThanOrEqual(ps[i + 1].profit);
      }
    });
  });

  describe('part counts by vehicle type', () => {
    it('pickup gets tailgate and truck bed', () => {
      const ps = parts('2018 Ford F-150');
      const names = ps.map(p => p.name);
      expect(names).toContain('Pickup Tailgate Complete');
      expect(names).toContain('Pickup Truck Bed / Box');
    });
    it('pickup does not get trunk lid', () => {
      const names = parts('2018 Ford F-150').map(p => p.name);
      expect(names).not.toContain('Trunk Lid / Decklid OEM');
    });
    it('SUV gets liftgate, not tailgate or trunk', () => {
      const names = parts('2018 Chevrolet Tahoe').map(p => p.name);
      expect(names).toContain('Liftgate / Hatch Complete');
      expect(names).not.toContain('Pickup Tailgate Complete');
    });
    it('sedan gets trunk lid', () => {
      const names = parts('2018 Toyota Camry').map(p => p.name);
      expect(names).toContain('Trunk Lid / Decklid OEM');
    });
    it('4WD gets transfer case', () => {
      const names = parts('2018 Ford F-150 4x4').map(p => p.name);
      expect(names).toContain('Transfer Case Assembly');
    });
    it('2WD sedan does not get transfer case', () => {
      const names = parts('2018 Toyota Camry').map(p => p.name);
      expect(names).not.toContain('Transfer Case Assembly');
    });
    it('turbo vehicle gets turbocharger and intercooler', () => {
      const names = parts('2005 Subaru STI').map(p => p.name);
      expect(names).toContain('Turbocharger OEM');
      expect(names).toContain('Intercooler OEM');
    });
    it('non-turbo does not get turbocharger', () => {
      const names = parts('2012 Honda Accord').map(p => p.name);
      expect(names).not.toContain('Turbocharger OEM');
    });
    it('diesel gets DPF filter', () => {
      const names = parts('2019 Ram Cummins diesel').map(p => p.name);
      expect(names).toContain('DPF / Diesel Particulate Filter');
    });
    it('hybrid omits engine assembly', () => {
      const names = parts('2017 Toyota Prius').map(p => p.name);
      expect(names).not.toContain('Complete Engine Assembly');
    });
    it('non-hybrid includes engine assembly', () => {
      const names = parts('2018 Toyota Camry').map(p => p.name);
      expect(names).toContain('Complete Engine Assembly');
    });
    it('2015+ vehicle gets ADAS camera', () => {
      const names = parts('2018 Toyota Camry').map(p => p.name);
      expect(names).toContain('ADAS Forward Camera');
    });
    it('pre-2015 vehicle does not get ADAS camera', () => {
      const names = parts('2010 Toyota Camry').map(p => p.name);
      expect(names).not.toContain('ADAS Forward Camera');
    });
    it('SUV gets air suspension', () => {
      const names = parts('2018 Chevrolet Tahoe').map(p => p.name);
      expect(names).toContain('Air Suspension Compressor+Bags');
    });
    it('pickup/SUV gets truck/SUV accessories', () => {
      const names = parts('2020 Ford F-150').map(p => p.name);
      expect(names).toContain('Running Boards / Side Steps');
      expect(names).toContain('Tonneau / Bed Cover OEM');
    });
    it('4WD pickup gets skid plates', () => {
      const names = parts('2020 Ford F-150 4x4').map(p => p.name);
      expect(names).toContain('Skid Plate Set OEM');
    });
    it('Hellcat gets supercharger', () => {
      const names = parts('2015 Dodge Challenger Hellcat').map(p => p.name);
      expect(names).toContain('Supercharger Assembly');
    });
  });

  describe('yard multiplier effect', () => {
    it('higher yardMult increases yard cost, lowering profit', () => {
      const cheap = parts('2018 Toyota Camry', 0.65);
      const expensive = parts('2018 Toyota Camry', 1.5);
      const cheapEngine = cheap.find(p => p.name === 'Complete Engine Assembly');
      const expEngine = expensive.find(p => p.name === 'Complete Engine Assembly');
      expect(cheapEngine.profit).toBeGreaterThan(expEngine.profit);
    });
    it('yard cost is at least 5', () => {
      const ps = parts('2018 Toyota Camry', 0.01);
      ps.forEach(p => {
        expect(p.yard).toBeGreaterThanOrEqual(5);
      });
    });
    it('eBay price is at least 8', () => {
      const ps = parts('2018 Toyota Camry');
      ps.forEach(p => {
        expect(p.ebay).toBeGreaterThanOrEqual(8);
      });
    });
  });

  describe('vehicle multiplier effect', () => {
    it('exotic engine is more valuable than mid engine', () => {
      const exotic = parts('Ferrari 458').find(p => p.name === 'Complete Engine Assembly');
      const mid = parts('2018 Toyota Camry').find(p => p.name === 'Complete Engine Assembly');
      expect(exotic.ebay).toBeGreaterThan(mid.ebay);
    });
    it('diesel truck engine base is 8500', () => {
      // ram\s*\d requires digit after "ram" to trigger pickup detection and diesel_truck tier
      const engine = parts('2019 Ram 1500 Cummins diesel').find(p => p.name === 'Complete Engine Assembly');
      expect(engine.ebay).toBe(8500);
    });
  });

  describe('wheel size by vehicle type', () => {
    it('pickup/SUV gets 20" wheels', () => {
      const ps = parts('2020 Ford F-150');
      const wheels = ps.find(p => p.name.includes('Alloy Wheels'));
      expect(wheels.name).toContain('20"');
    });
    it('sedan gets 18" wheels', () => {
      const ps = parts('2018 Toyota Camry');
      const wheels = ps.find(p => p.name.includes('Alloy Wheels'));
      expect(wheels.name).toContain('18"');
    });
  });

  describe('demand field values', () => {
    it('demand is one of High/Medium/Low', () => {
      const ps = parts('2018 Honda Accord');
      ps.forEach(p => {
        expect(['High', 'Medium', 'Low']).toContain(p.demand);
      });
    });
  });

  describe('weight field values', () => {
    it('weight is one of Heavy/Medium/Light', () => {
      const ps = parts('2018 Honda Accord');
      ps.forEach(p => {
        expect(['Heavy', 'Medium', 'Light']).toContain(p.weight);
      });
    });
  });
});
