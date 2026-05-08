import { describe, it, expect } from 'vitest';
import {
  PRODUCT_CATALOG,
  PRODUCT_VESSEL_COST,
  FALLBACK_VESSEL_COST,
  getVesselCost,
  getProductEntry,
  resolveLegacyCode,
  getGasType,
  getCylinderType,
  calculateCapitalLocked,
  calculateCapitalLockedDetailed,
} from '../lib/cylinder-costs.js';

describe('cylinder-costs', () => {
  // ---------------------------------------------------------------
  // PRODUCT_CATALOG structure
  // ---------------------------------------------------------------
  describe('PRODUCT_CATALOG', () => {
    it('has no duplicate codes', () => {
      const codes = PRODUCT_CATALOG.map((e) => e.code);
      expect(new Set(codes).size).toBe(codes.length);
    });

    it('has required fields on every entry', () => {
      for (const entry of PRODUCT_CATALOG) {
        expect(entry.code).toBeTruthy();
        expect(entry.name).toBeTruthy();
        expect(entry.cylinderType).toBeTruthy();
        expect(entry.gasType).toBeTruthy();
        expect(typeof entry.isLegacy).toBe('boolean');
        expect(entry.vesselCost === null || typeof entry.vesselCost === 'number').toBe(true);
      }
    });

    it('has 20 active codes and 34 legacy codes', () => {
      const active = PRODUCT_CATALOG.filter((e) => !e.isLegacy);
      const legacy = PRODUCT_CATALOG.filter((e) => e.isLegacy);
      expect(active.length).toBe(20);
      expect(legacy.length).toBe(34);
    });

    it('legacy entries all have mapsTo pointing to an existing active code', () => {
      const activeCodes = new Set(
        PRODUCT_CATALOG.filter((e) => !e.isLegacy).map((e) => e.code),
      );
      const legacy = PRODUCT_CATALOG.filter((e) => e.isLegacy);

      for (const entry of legacy) {
        expect(entry.mapsTo, `Legacy code "${entry.code}" should have mapsTo`).toBeTruthy();
        expect(
          activeCodes.has(entry.mapsTo),
          `Legacy code "${entry.code}" maps to "${entry.mapsTo}" which is not an active code`,
        ).toBe(true);
      }
    });

    it('active entries have mapsTo = null', () => {
      const active = PRODUCT_CATALOG.filter((e) => !e.isLegacy);
      for (const entry of active) {
        expect(entry.mapsTo).toBeNull();
      }
    });

    it('CB-80 has vesselCost = 0', () => {
      const cb80 = PRODUCT_CATALOG.find((e) => e.code === 'CB-80');
      expect(cb80).toBeDefined();
      expect(cb80.vesselCost).toBe(0);
      expect(cb80.isLegacy).toBe(false);
    });

    it('does not contain MED-10', () => {
      const med10 = PRODUCT_CATALOG.find((e) => e.code === 'MED-10');
      expect(med10).toBeUndefined();
    });

    it('contains new CB-95 and HB-95 entries', () => {
      const cb95 = PRODUCT_CATALOG.find((e) => e.code === 'CB-95');
      expect(cb95).toBeDefined();
      expect(cb95.name).toBe('Argon Carbomix-95');
      expect(cb95.cylinderType).toBe('Type D');
      expect(cb95.gasType).toBe('Mixed');
      expect(cb95.vesselCost).toBe(6000);
      expect(cb95.isLegacy).toBe(false);

      const hb95 = PRODUCT_CATALOG.find((e) => e.code === 'HB-95');
      expect(hb95).toBeDefined();
      expect(hb95.name).toBe('Argon Hyblend-95');
      expect(hb95.cylinderType).toBe('Type D');
      expect(hb95.gasType).toBe('Mixed');
      expect(hb95.vesselCost).toBe(6000);
      expect(hb95.isLegacy).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // PRODUCT_VESSEL_COST map
  // ---------------------------------------------------------------
  describe('PRODUCT_VESSEL_COST map', () => {
    it('contains Type D entries at correct costs', () => {
      expect(PRODUCT_VESSEL_COST['IND-7']).toBe(6000);
      expect(PRODUCT_VESSEL_COST['MED-D']).toBe(6000);
      expect(PRODUCT_VESSEL_COST['N2-7']).toBe(6000);
      expect(PRODUCT_VESSEL_COST['ARG']).toBe(6000);
      expect(PRODUCT_VESSEL_COST['DA-001']).toBe(5000);
      expect(PRODUCT_VESSEL_COST['7m3']).toBe(6000);
      expect(PRODUCT_VESSEL_COST['Type-D']).toBe(6000);
    });

    it('10Cbm (legacy CB10) costs INR 7,500', () => {
      expect(PRODUCT_VESSEL_COST['10Cbm']).toBe(7500);
    });

    it('contains Type B / CB6 / CB10 / Type A entries at correct costs', () => {
      expect(PRODUCT_VESSEL_COST['MED-B']).toBe(3000);
      expect(PRODUCT_VESSEL_COST['MED-A']).toBe(3000);
      expect(PRODUCT_VESSEL_COST['IND-6']).toBe(5000);
      expect(PRODUCT_VESSEL_COST['MED-6']).toBe(5000);
      expect(PRODUCT_VESSEL_COST['IND-10']).toBe(7500);
      expect(PRODUCT_VESSEL_COST['Type-B']).toBe(3000);
      expect(PRODUCT_VESSEL_COST['Type-A']).toBe(3000);
    });

    it('contains CO2 kg entries at correct costs', () => {
      expect(PRODUCT_VESSEL_COST['CO2-27KG']).toBe(5000);
      expect(PRODUCT_VESSEL_COST['CO2-30KG']).toBe(6000);
      expect(PRODUCT_VESSEL_COST['CO2-45KG']).toBe(7500);
      expect(PRODUCT_VESSEL_COST['27Kg']).toBe(5000);
      expect(PRODUCT_VESSEL_COST['27']).toBe(5000);
      expect(PRODUCT_VESSEL_COST['30Kg']).toBe(6000);
      expect(PRODUCT_VESSEL_COST['45Kg']).toBe(7500);
      // Small CO2 Kg variants map to CO2-27KG cost
      const smallCo2 = ['2Kg', '4.5Kg', '5Kg', '10Kg', '15Kg', '18Kg', '20Kg', '25Kg'];
      for (const code of smallCo2) {
        expect(PRODUCT_VESSEL_COST[code], `${code} should be 5000`).toBe(5000);
      }
      expect(PRODUCT_VESSEL_COST['29Kg']).toBe(6000);
    });

    it('contains LPG entries at INR 2,100', () => {
      const lpgCodes = ['LPG/C-19.2', 'LPG/D-19.2', '19.2Kg'];
      for (const code of lpgCodes) {
        expect(PRODUCT_VESSEL_COST[code], `${code} should be 2100`).toBe(2100);
      }
    });

    it('contains O2 size-variant entries', () => {
      const smallO2 = ['4', '5Cbm', '6Cbm', '6'];
      for (const code of smallO2) {
        expect(PRODUCT_VESSEL_COST[code], `${code} should be 5000`).toBe(5000);
      }
      expect(PRODUCT_VESSEL_COST['1.5'], '1.5 should be 3000 (MED-A)').toBe(3000);
      const largeO2 = ['7', '8', '15', '18', '20', '24', '29'];
      for (const code of largeO2) {
        expect(PRODUCT_VESSEL_COST[code], `${code} should be 6000`).toBe(6000);
      }
      expect(PRODUCT_VESSEL_COST['10'], '10 should be 7500 (CB10)').toBe(7500);
    });

    it('includes CB-80 at 0', () => {
      expect(PRODUCT_VESSEL_COST['CB-80']).toBe(0);
    });

    it('includes ACM8020 at 0', () => {
      expect(PRODUCT_VESSEL_COST['ACM8020']).toBe(0);
    });

    it('includes CB-95 and HB-95 at 6000', () => {
      expect(PRODUCT_VESSEL_COST['CB-95']).toBe(6000);
      expect(PRODUCT_VESSEL_COST['HB-95']).toBe(6000);
    });
  });

  // ---------------------------------------------------------------
  // FALLBACK_VESSEL_COST
  // ---------------------------------------------------------------
  describe('FALLBACK_VESSEL_COST', () => {
    it('is 0', () => {
      expect(FALLBACK_VESSEL_COST).toBe(0);
    });
  });

  // ---------------------------------------------------------------
  // getProductEntry()
  // ---------------------------------------------------------------
  describe('getProductEntry()', () => {
    it('returns full entry for IND-7', () => {
      const entry = getProductEntry('IND-7');
      expect(entry).toBeDefined();
      expect(entry.name).toContain('Industrial Oxygen');
      expect(entry.cylinderType).toBe('Type D');
      expect(entry.gasType).toBe('O2');
      expect(entry.vesselCost).toBe(6000);
      expect(entry.isLegacy).toBe(false);
    });

    it('returns entry for legacy code "Argon"', () => {
      const entry = getProductEntry('Argon');
      expect(entry).toBeDefined();
      expect(entry.isLegacy).toBe(true);
      expect(entry.mapsTo).toBe('ARG');
    });

    it('returns entry for CB-80 with cost 0', () => {
      const entry = getProductEntry('CB-80');
      expect(entry).toBeDefined();
      expect(entry.vesselCost).toBe(0);
      expect(entry.gasType).toBe('Mixed');
    });

    it('returns undefined for unknown code', () => {
      expect(getProductEntry('UNKNOWN')).toBeUndefined();
    });

    it('returns undefined for removed MED-10', () => {
      expect(getProductEntry('MED-10')).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------
  // resolveLegacyCode()
  // ---------------------------------------------------------------
  describe('resolveLegacyCode()', () => {
    it('resolves "Argon" to "ARG"', () => {
      expect(resolveLegacyCode('Argon')).toBe('ARG');
    });

    it('resolves "7m3" to "IND-7"', () => {
      expect(resolveLegacyCode('7m3')).toBe('IND-7');
    });

    it('resolves "Type-D" to "IND-7"', () => {
      expect(resolveLegacyCode('Type-D')).toBe('IND-7');
    });

    it('resolves "27Kg" to "CO2-27KG"', () => {
      expect(resolveLegacyCode('27Kg')).toBe('CO2-27KG');
    });

    it('resolves "CO2IND45m" to "CO2-45KG"', () => {
      expect(resolveLegacyCode('CO2IND45m')).toBe('CO2-45KG');
    });

    it('returns original code if not legacy', () => {
      expect(resolveLegacyCode('IND-7')).toBe('IND-7');
      expect(resolveLegacyCode('CO2-30KG')).toBe('CO2-30KG');
    });

    it('returns original code if unknown', () => {
      expect(resolveLegacyCode('UNKNOWN')).toBe('UNKNOWN');
    });

    describe('size-variant codes from customer balances', () => {
      it('resolves O2 small volume codes to IND-6', () => {
        expect(resolveLegacyCode('4')).toBe('IND-6');
        expect(resolveLegacyCode('5Cbm')).toBe('IND-6');
        expect(resolveLegacyCode('6Cbm')).toBe('IND-6');
        expect(resolveLegacyCode('6')).toBe('IND-6');
      });

      it('resolves O2 large volume codes to IND-7', () => {
        expect(resolveLegacyCode('7')).toBe('IND-7');
        expect(resolveLegacyCode('8')).toBe('IND-7');
        expect(resolveLegacyCode('15')).toBe('IND-7');
        expect(resolveLegacyCode('18')).toBe('IND-7');
        expect(resolveLegacyCode('20')).toBe('IND-7');
        expect(resolveLegacyCode('24')).toBe('IND-7');
        expect(resolveLegacyCode('29')).toBe('IND-7');
      });

      it('resolves O2 10m3 to IND-10', () => {
        expect(resolveLegacyCode('10')).toBe('IND-10');
      });

      it('resolves small O2 to MED-A', () => {
        expect(resolveLegacyCode('1.5')).toBe('MED-A');
      });

      it('resolves CO2 Kg variants', () => {
        expect(resolveLegacyCode('2Kg')).toBe('CO2-27KG');
        expect(resolveLegacyCode('10Kg')).toBe('CO2-27KG');
        expect(resolveLegacyCode('15Kg')).toBe('CO2-27KG');
        expect(resolveLegacyCode('18Kg')).toBe('CO2-27KG');
        expect(resolveLegacyCode('20Kg')).toBe('CO2-27KG');
        expect(resolveLegacyCode('25Kg')).toBe('CO2-27KG');
        expect(resolveLegacyCode('29Kg')).toBe('CO2-30KG');
      });

      it('resolves LPG weight variant', () => {
        expect(resolveLegacyCode('19.2Kg')).toBe('LPG/C-19.2');
      });
    });
  });

  // ---------------------------------------------------------------
  // getGasType() and getCylinderType()
  // ---------------------------------------------------------------
  describe('getGasType()', () => {
    it('returns O2 for IND-7', () => {
      expect(getGasType('IND-7')).toBe('O2');
    });

    it('returns CO2 for CO2-30KG', () => {
      expect(getGasType('CO2-30KG')).toBe('CO2');
    });

    it('returns Mixed for CB-80', () => {
      expect(getGasType('CB-80')).toBe('Mixed');
    });

    it('returns Mixed for CB-95', () => {
      expect(getGasType('CB-95')).toBe('Mixed');
    });

    it('returns Mixed for HB-95', () => {
      expect(getGasType('HB-95')).toBe('Mixed');
    });

    it('returns undefined for unknown', () => {
      expect(getGasType('UNKNOWN')).toBeUndefined();
    });
  });

  describe('getCylinderType()', () => {
    it('returns Type D for IND-7', () => {
      expect(getCylinderType('IND-7')).toBe('Type D');
    });

    it('returns CB6 for IND-6', () => {
      expect(getCylinderType('IND-6')).toBe('CB6');
    });

    it('returns Type D for CB-95', () => {
      expect(getCylinderType('CB-95')).toBe('Type D');
    });

    it('returns undefined for unknown', () => {
      expect(getCylinderType('UNKNOWN')).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------
  // getVesselCost()
  // ---------------------------------------------------------------
  describe('getVesselCost()', () => {
    it('returns 6000 for IND-7 (Type D)', () => {
      expect(getVesselCost('IND-7')).toBe(6000);
    });

    it('returns 6000 for CO2-30KG', () => {
      expect(getVesselCost('CO2-30KG')).toBe(6000);
    });

    it('returns 3000 for MED-B (Type B)', () => {
      expect(getVesselCost('MED-B')).toBe(3000);
    });

    it('returns 2100 for LPG/C-19.2', () => {
      expect(getVesselCost('LPG/C-19.2')).toBe(2100);
    });

    it('returns 0 for CB-80', () => {
      expect(getVesselCost('CB-80')).toBe(0);
    });

    it('returns FALLBACK (0) for unknown product code', () => {
      expect(getVesselCost('UNKNOWN-XYZ')).toBe(FALLBACK_VESSEL_COST);
    });

    it('returns FALLBACK (0) for empty string', () => {
      expect(getVesselCost('')).toBe(FALLBACK_VESSEL_COST);
    });

    it('is case-sensitive', () => {
      expect(getVesselCost('ind-7')).toBe(FALLBACK_VESSEL_COST);
      expect(getVesselCost('IND-7')).toBe(6000);
    });

    it('returns 6000 for CB-95', () => {
      expect(getVesselCost('CB-95')).toBe(6000);
    });

    it('returns 6000 for HB-95', () => {
      expect(getVesselCost('HB-95')).toBe(6000);
    });
  });

  // ---------------------------------------------------------------
  // calculateCapitalLocked()
  // ---------------------------------------------------------------
  describe('calculateCapitalLocked()', () => {
    it('sums per-product costs from holdings array', () => {
      const holdings = [
        { productCode: 'IND-7', cylinderCount: 10 },
        { productCode: 'MED-B', cylinderCount: 5 },
      ];
      // 10 * 6000 + 5 * 3000 = 75000
      expect(calculateCapitalLocked(holdings, 100)).toBe(75000);
    });

    it('ignores totalCylinders when holdings array has entries', () => {
      const holdings = [
        { productCode: 'IND-7', cylinderCount: 2 },
      ];
      // 2 * 6000 = 12000
      expect(calculateCapitalLocked(holdings, 999)).toBe(12000);
    });

    it('falls back to totalCylinders * FALLBACK when holdings is empty', () => {
      expect(calculateCapitalLocked([], 20)).toBe(20 * FALLBACK_VESSEL_COST);
    });

    it('falls back when holdings is null', () => {
      expect(calculateCapitalLocked(null, 15)).toBe(15 * FALLBACK_VESSEL_COST);
    });

    it('falls back when holdings is undefined', () => {
      expect(calculateCapitalLocked(undefined, 8)).toBe(8 * FALLBACK_VESSEL_COST);
    });

    it('returns 0 when all holdings have cylinderCount of 0', () => {
      const holdings = [
        { productCode: 'IND-7', cylinderCount: 0 },
        { productCode: 'MED-B', cylinderCount: 0 },
      ];
      expect(calculateCapitalLocked(holdings, 50)).toBe(0);
    });

    it('correctly handles a mix of zero and non-zero quantities', () => {
      const holdings = [
        { productCode: 'IND-7', cylinderCount: 0 },
        { productCode: 'CO2-30KG', cylinderCount: 3 },
      ];
      // 0 * 6000 + 3 * 6000 = 18000
      expect(calculateCapitalLocked(holdings, 50)).toBe(18000);
    });

    it('uses FALLBACK for unknown product codes in holdings', () => {
      const holdings = [
        { productCode: 'IND-7', cylinderCount: 4 },
        { productCode: 'MYSTERY-GAS', cylinderCount: 2 },
      ];
      // 4 * 6000 + 2 * 0 = 24000
      expect(calculateCapitalLocked(holdings, 100)).toBe(24000);
    });

    it('handles holdings with all unknown product codes', () => {
      const holdings = [
        { productCode: 'UNKNOWN-A', cylinderCount: 3 },
        { productCode: 'UNKNOWN-B', cylinderCount: 7 },
      ];
      // 3 * 0 + 7 * 0 = 0
      expect(calculateCapitalLocked(holdings, 100)).toBe(0);
    });

    it('returns 0 when holdings is empty and totalCylinders is 0', () => {
      expect(calculateCapitalLocked([], 0)).toBe(0);
    });

    it('returns 0 when holdings is null and totalCylinders is 0', () => {
      expect(calculateCapitalLocked(null, 0)).toBe(0);
    });
  });

  // ---------------------------------------------------------------
  // calculateCapitalLockedDetailed()
  // ---------------------------------------------------------------
  describe('calculateCapitalLockedDetailed()', () => {
    it('returns correct shape', () => {
      const result = calculateCapitalLockedDetailed(null, 10);
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('unknownCostCylinders');
    });

    it('uses fallback when holdings is null', () => {
      const result = calculateCapitalLockedDetailed(null, 10);
      expect(result.total).toBe(10 * 0);
      expect(result.unknownCostCylinders).toBe(0);
    });

    it('uses fallback when holdings is empty', () => {
      const result = calculateCapitalLockedDetailed([], 10);
      expect(result.total).toBe(10 * 0);
      expect(result.unknownCostCylinders).toBe(0);
    });

    it('CB-80 cylinders are included at cost 0 (no longer null)', () => {
      const holdings = [
        { productCode: 'IND-7', cylinderCount: 5 },
        { productCode: 'CB-80', cylinderCount: 3 },
      ];
      const result = calculateCapitalLockedDetailed(holdings, 8);
      // CB-80 vesselCost is now 0 (not null), so it goes through the normal path
      // 5 * 6000 + 3 * 0 = 30000
      expect(result.total).toBe(30000);
      expect(result.unknownCostCylinders).toBe(0);
    });

    it('handles all-known holdings', () => {
      const holdings = [
        { productCode: 'IND-7', cylinderCount: 2 },
        { productCode: 'MED-B', cylinderCount: 3 },
      ];
      const result = calculateCapitalLockedDetailed(holdings, 5);
      // 2 * 6000 + 3 * 3000 = 21000
      expect(result.total).toBe(21000);
      expect(result.unknownCostCylinders).toBe(0);
    });

    it('handles all-zero-cost holdings', () => {
      const holdings = [
        { productCode: 'CB-80', cylinderCount: 10 },
      ];
      const result = calculateCapitalLockedDetailed(holdings, 10);
      // CB-80 is 0 cost, not null -- so total = 0, unknownCostCylinders = 0
      expect(result.total).toBe(0);
      expect(result.unknownCostCylinders).toBe(0);
    });

    it('uses fallback for truly unknown products (not in catalog)', () => {
      const holdings = [
        { productCode: 'MYSTERY-GAS', cylinderCount: 2 },
      ];
      const result = calculateCapitalLockedDetailed(holdings, 2);
      // MYSTERY-GAS not in catalog, getVesselCost returns FALLBACK (0)
      expect(result.total).toBe(2 * 0);
      expect(result.unknownCostCylinders).toBe(0);
    });
  });
});
