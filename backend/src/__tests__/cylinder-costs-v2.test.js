import { describe, it, expect } from 'vitest';
import {
  PRODUCT_CATALOG,
  SKU_THRESHOLDS,
  CYLINDER_SKUS,
  LPG_SKUS,
  DASHBOARD_SEGMENTS,
  classifySkuPerformance,
  getFillCost,
  resolveLegacyCode,
  // Verify backward-compatible exports still exist
  PRODUCT_THRESHOLDS,
  classifyPerformance,
  classifyProductPerformance,
  normalizeProductType,
} from '../lib/cylinder-costs.js';

describe('cylinder-costs v2 additions', () => {
  // ---------------------------------------------------------------
  // fillCost field on PRODUCT_CATALOG
  // ---------------------------------------------------------------
  describe('PRODUCT_CATALOG fillCost field', () => {
    it('every entry has a fillCost property (number or null)', () => {
      for (const entry of PRODUCT_CATALOG) {
        expect(
          entry.fillCost === null || typeof entry.fillCost === 'number',
          `${entry.code} fillCost should be number or null, got ${typeof entry.fillCost}`,
        ).toBe(true);
      }
    });

    it('active entries have correct fill costs', () => {
      const lookup = new Map(PRODUCT_CATALOG.map((e) => [e.code, e]));
      expect(lookup.get('ARG').fillCost).toBe(750);
      expect(lookup.get('CB-95').fillCost).toBe(750);
      expect(lookup.get('HB-92').fillCost).toBe(750);
      expect(lookup.get('HB-95').fillCost).toBe(750);
      expect(lookup.get('CO2-27KG').fillCost).toBe(270);
      expect(lookup.get('CO2-30KG').fillCost).toBe(300);
      expect(lookup.get('CO2-45KG').fillCost).toBe(450);
      expect(lookup.get('DA-001').fillCost).toBe(2000);
      expect(lookup.get('IND-10').fillCost).toBe(110);
      expect(lookup.get('IND-6').fillCost).toBe(90);
      expect(lookup.get('IND-7').fillCost).toBe(100);
      expect(lookup.get('MED-6').fillCost).toBe(90);
      expect(lookup.get('MED-A').fillCost).toBe(70);
      expect(lookup.get('MED-B').fillCost).toBe(80);
      expect(lookup.get('MED-D').fillCost).toBe(100);
      expect(lookup.get('N2-7').fillCost).toBe(100);
      expect(lookup.get('LPG/C-19.2').fillCost).toBe(2100);
    });

    it('null fillCost entries are correct', () => {
      const lookup = new Map(PRODUCT_CATALOG.map((e) => [e.code, e]));
      expect(lookup.get('LPG/D-19.2').fillCost).toBeNull();
      expect(lookup.get('CB-80').fillCost).toBeNull();
      expect(lookup.get('ACM8020').fillCost).toBeNull();
    });

    it('all legacy entries have fillCost: null', () => {
      const legacy = PRODUCT_CATALOG.filter((e) => e.isLegacy);
      for (const entry of legacy) {
        expect(
          entry.fillCost,
          `Legacy code "${entry.code}" should have fillCost: null`,
        ).toBeNull();
      }
    });
  });

  // ---------------------------------------------------------------
  // HB-92 new entry
  // ---------------------------------------------------------------
  describe('HB-92 entry', () => {
    it('exists as an active entry', () => {
      const hb92 = PRODUCT_CATALOG.find((e) => e.code === 'HB-92');
      expect(hb92).toBeDefined();
      expect(hb92.name).toBe('ARGON HYBLEND-92');
      expect(hb92.cylinderType).toBe('Type D');
      expect(hb92.gasType).toBe('Argon');
      expect(hb92.vesselCost).toBe(6000);
      expect(hb92.fillCost).toBe(750);
      expect(hb92.isLegacy).toBe(false);
      expect(hb92.mapsTo).toBeNull();
    });

    it('is positioned after HB-95 in the catalog', () => {
      const hb95Idx = PRODUCT_CATALOG.findIndex((e) => e.code === 'HB-95');
      const hb92Idx = PRODUCT_CATALOG.findIndex((e) => e.code === 'HB-92');
      expect(hb92Idx).toBeGreaterThan(hb95Idx);
    });
  });

  // ---------------------------------------------------------------
  // SKU_THRESHOLDS
  // ---------------------------------------------------------------
  describe('SKU_THRESHOLDS', () => {
    it('has 17 entries', () => {
      expect(Object.keys(SKU_THRESHOLDS).length).toBe(17);
    });

    it('all entries have good and avg numeric fields', () => {
      for (const [code, t] of Object.entries(SKU_THRESHOLDS)) {
        expect(typeof t.good, `${code}.good`).toBe('number');
        expect(typeof t.avg, `${code}.avg`).toBe('number');
        expect(t.good).toBeGreaterThan(t.avg);
      }
    });

    it('O2 SKUs have good=3, avg=2', () => {
      for (const code of ['IND-7', 'IND-6', 'IND-10', 'MED-D', 'MED-6', 'MED-B', 'MED-A']) {
        expect(SKU_THRESHOLDS[code].good, `${code}.good`).toBe(3);
        expect(SKU_THRESHOLDS[code].avg, `${code}.avg`).toBe(2);
      }
    });

    it('Argon/Mixed SKUs have good=2, avg=1.5', () => {
      for (const code of ['ARG', 'CB-95', 'HB-92', 'HB-95']) {
        expect(SKU_THRESHOLDS[code].good, `${code}.good`).toBe(2);
        expect(SKU_THRESHOLDS[code].avg, `${code}.avg`).toBe(1.5);
      }
    });

    it('CO2/specialty SKUs have good=2, avg=1', () => {
      for (const code of ['CO2-27KG', 'CO2-30KG', 'CO2-45KG', 'DA-001', 'N2-7', 'LPG/C-19.2']) {
        expect(SKU_THRESHOLDS[code].good, `${code}.good`).toBe(2);
        expect(SKU_THRESHOLDS[code].avg, `${code}.avg`).toBe(1);
      }
    });
  });

  // ---------------------------------------------------------------
  // classifySkuPerformance()
  // ---------------------------------------------------------------
  describe('classifySkuPerformance()', () => {
    it('classifies O2 SKU: Good when rate >= 3', () => {
      expect(classifySkuPerformance(3, 'IND-7')).toBe('Good');
      expect(classifySkuPerformance(5, 'MED-D')).toBe('Good');
    });

    it('classifies O2 SKU: Avg when rate >= 2 but < 3', () => {
      expect(classifySkuPerformance(2, 'IND-7')).toBe('Avg');
      expect(classifySkuPerformance(2.9, 'MED-B')).toBe('Avg');
    });

    it('classifies O2 SKU: Poor when rate < 2', () => {
      expect(classifySkuPerformance(1.9, 'IND-7')).toBe('Poor');
      expect(classifySkuPerformance(0.5, 'MED-A')).toBe('Poor');
      expect(classifySkuPerformance(0, 'IND-6')).toBe('Poor');
    });

    it('classifies Argon SKU: Good when rate >= 2', () => {
      expect(classifySkuPerformance(2, 'ARG')).toBe('Good');
      expect(classifySkuPerformance(3, 'HB-92')).toBe('Good');
    });

    it('classifies Argon SKU: Avg when rate >= 1.5 but < 2', () => {
      expect(classifySkuPerformance(1.5, 'ARG')).toBe('Avg');
      expect(classifySkuPerformance(1.9, 'CB-95')).toBe('Avg');
    });

    it('classifies Argon SKU: Poor when rate < 1.5', () => {
      expect(classifySkuPerformance(1.4, 'ARG')).toBe('Poor');
      expect(classifySkuPerformance(0, 'HB-95')).toBe('Poor');
    });

    it('classifies CO2 SKU: Good when rate >= 2', () => {
      expect(classifySkuPerformance(2, 'CO2-27KG')).toBe('Good');
    });

    it('classifies CO2 SKU: Avg when rate >= 1 but < 2', () => {
      expect(classifySkuPerformance(1, 'CO2-30KG')).toBe('Avg');
      expect(classifySkuPerformance(1.5, 'CO2-45KG')).toBe('Avg');
    });

    it('classifies CO2 SKU: Poor when rate < 1', () => {
      expect(classifySkuPerformance(0.9, 'CO2-27KG')).toBe('Poor');
    });

    it('resolves legacy codes before lookup', () => {
      // '7m3' resolves to 'IND-7' which has good=3, avg=2
      expect(classifySkuPerformance(3, '7m3')).toBe('Good');
      expect(classifySkuPerformance(2, '7m3')).toBe('Avg');
      expect(classifySkuPerformance(1, '7m3')).toBe('Poor');

      // 'Argon' resolves to 'ARG' which has good=2, avg=1.5
      expect(classifySkuPerformance(2, 'Argon')).toBe('Good');
      expect(classifySkuPerformance(1.5, 'Argon')).toBe('Avg');
      expect(classifySkuPerformance(1, 'Argon')).toBe('Poor');
    });

    it('falls back to generic thresholds for unknown codes', () => {
      // Unknown: good=3, avg=1.5
      expect(classifySkuPerformance(3, 'MYSTERY')).toBe('Good');
      expect(classifySkuPerformance(1.5, 'MYSTERY')).toBe('Avg');
      expect(classifySkuPerformance(1.4, 'MYSTERY')).toBe('Poor');
      expect(classifySkuPerformance(0, 'MYSTERY')).toBe('Poor');
    });

    it('handles LPG SKU', () => {
      expect(classifySkuPerformance(2, 'LPG/C-19.2')).toBe('Good');
      expect(classifySkuPerformance(1, 'LPG/C-19.2')).toBe('Avg');
      expect(classifySkuPerformance(0.5, 'LPG/C-19.2')).toBe('Poor');
    });
  });

  // ---------------------------------------------------------------
  // getFillCost()
  // ---------------------------------------------------------------
  describe('getFillCost()', () => {
    it('returns correct fill cost for active SKUs', () => {
      expect(getFillCost('ARG')).toBe(750);
      expect(getFillCost('IND-7')).toBe(100);
      expect(getFillCost('CO2-45KG')).toBe(450);
      expect(getFillCost('DA-001')).toBe(2000);
      expect(getFillCost('LPG/C-19.2')).toBe(2100);
      expect(getFillCost('HB-92')).toBe(750);
    });

    it('returns null for null-fillCost entries', () => {
      expect(getFillCost('CB-80')).toBeNull();
      expect(getFillCost('ACM8020')).toBeNull();
      expect(getFillCost('LPG/D-19.2')).toBeNull();
    });

    it('returns null for legacy codes (fillCost: null)', () => {
      expect(getFillCost('7m3')).toBeNull();
      expect(getFillCost('Argon')).toBeNull();
      expect(getFillCost('Type-D')).toBeNull();
    });

    it('returns null for unknown codes', () => {
      expect(getFillCost('UNKNOWN')).toBeNull();
      expect(getFillCost('')).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // CYLINDER_SKUS, LPG_SKUS, DASHBOARD_SEGMENTS
  // ---------------------------------------------------------------
  describe('segment constants', () => {
    it('CYLINDER_SKUS has 16 items', () => {
      expect(CYLINDER_SKUS).toHaveLength(16);
    });

    it('CYLINDER_SKUS contains expected entries', () => {
      expect(CYLINDER_SKUS).toContain('ARG');
      expect(CYLINDER_SKUS).toContain('HB-92');
      expect(CYLINDER_SKUS).toContain('IND-7');
      expect(CYLINDER_SKUS).toContain('N2-7');
      expect(CYLINDER_SKUS).toContain('DA-001');
    });

    it('CYLINDER_SKUS does not contain LPG', () => {
      expect(CYLINDER_SKUS).not.toContain('LPG/C-19.2');
      expect(CYLINDER_SKUS).not.toContain('LPG/D-19.2');
    });

    it('LPG_SKUS has 1 item', () => {
      expect(LPG_SKUS).toHaveLength(1);
      expect(LPG_SKUS[0]).toBe('LPG/C-19.2');
    });

    it('DASHBOARD_SEGMENTS has 3 items', () => {
      expect(DASHBOARD_SEGMENTS).toHaveLength(3);
      expect(DASHBOARD_SEGMENTS).toEqual(['Marketing', 'Factory', 'Dealer']);
    });

    it('every CYLINDER_SKU exists as an active entry in PRODUCT_CATALOG', () => {
      const activeCodes = new Set(
        PRODUCT_CATALOG.filter((e) => !e.isLegacy).map((e) => e.code),
      );
      for (const code of CYLINDER_SKUS) {
        expect(activeCodes.has(code), `${code} should be in active catalog`).toBe(true);
      }
    });

    it('every CYLINDER_SKU has a SKU_THRESHOLDS entry', () => {
      for (const code of CYLINDER_SKUS) {
        expect(SKU_THRESHOLDS[code], `${code} should have threshold`).toBeDefined();
      }
    });
  });

  // ---------------------------------------------------------------
  // Backward compatibility -- existing exports still work
  // ---------------------------------------------------------------
  describe('backward compatibility', () => {
    it('PRODUCT_THRESHOLDS is exported and has CO2/O2/LPG', () => {
      expect(PRODUCT_THRESHOLDS).toBeDefined();
      expect(PRODUCT_THRESHOLDS.CO2).toBeDefined();
      expect(PRODUCT_THRESHOLDS.O2).toBeDefined();
      expect(PRODUCT_THRESHOLDS.LPG).toBeDefined();
    });

    it('classifyPerformance() still works', () => {
      expect(classifyPerformance(4)).toBe('Excellent');
      expect(classifyPerformance(2)).toBe('Good');
      expect(classifyPerformance(1)).toBe('Poor');
      expect(classifyPerformance(0.5)).toBe('Critical');
      expect(classifyPerformance(0)).toBe('Data Review');
    });

    it('classifyProductPerformance() still works', () => {
      expect(classifyProductPerformance(2, 'CO2')).toBe('Excellent');
      expect(classifyProductPerformance(3, 'O2')).toBe('Excellent');
    });

    it('normalizeProductType() still works', () => {
      expect(normalizeProductType('CO2-27KG')).toBe('CO2');
      expect(normalizeProductType('IND-7')).toBeNull();
    });
  });
});
