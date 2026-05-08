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
} from '../cylinder-costs';

// ---- Constants for test assertions ----
const TYPE_D_COST = 6000;   // IND-7, MED-D, N2-7, ARG
const CB6_COST = 5000;      // IND-6, MED-6
const CB10_COST = 7500;     // IND-10
const TYPE_B_COST = 3000;   // MED-B
const TYPE_A_COST = 3000;   // MED-A
const DA_COST = 5000;       // DA-001
const CO2_27_COST = 5000;   // CO2-27KG
const CO2_30_COST = 6000;   // CO2-30KG
const CO2_45_COST = 7500;   // CO2-45KG
const LPG_COST = 2100;      // LPG/C-19.2, LPG/D-19.2
const EXPECTED_FALLBACK = 0;

// ---------------------------------------------------------------------------
// PRODUCT_CATALOG structure
// ---------------------------------------------------------------------------
describe('PRODUCT_CATALOG', () => {
  it('should have no duplicate codes', () => {
    const codes = PRODUCT_CATALOG.map((e) => e.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('should have required fields on every entry', () => {
    for (const entry of PRODUCT_CATALOG) {
      expect(entry.code).toBeTruthy();
      expect(entry.name).toBeTruthy();
      expect(entry.cylinderType).toBeTruthy();
      expect(entry.gasType).toBeTruthy();
      expect(typeof entry.isLegacy).toBe('boolean');
      // vesselCost can be null or number
      expect(entry.vesselCost === null || typeof entry.vesselCost === 'number').toBe(true);
    }
  });

  it('should have 20 active codes and 34 legacy codes', () => {
    const active = PRODUCT_CATALOG.filter((e) => !e.isLegacy);
    const legacy = PRODUCT_CATALOG.filter((e) => e.isLegacy);
    expect(active.length).toBe(20);
    expect(legacy.length).toBe(34);
  });

  it('legacy entries should all have mapsTo pointing to an existing active code', () => {
    const activeCodes = new Set(
      PRODUCT_CATALOG.filter((e) => !e.isLegacy).map((e) => e.code),
    );
    const legacy = PRODUCT_CATALOG.filter((e) => e.isLegacy);

    for (const entry of legacy) {
      expect(entry.mapsTo, `Legacy code "${entry.code}" should have mapsTo`).toBeTruthy();
      expect(
        activeCodes.has(entry.mapsTo!),
        `Legacy code "${entry.code}" maps to "${entry.mapsTo}" which is not an active code`,
      ).toBe(true);
    }
  });

  it('active entries should have mapsTo = null', () => {
    const active = PRODUCT_CATALOG.filter((e) => !e.isLegacy);
    for (const entry of active) {
      expect(entry.mapsTo).toBeNull();
    }
  });

  it('CB-80 should have vesselCost = 0', () => {
    const cb80 = PRODUCT_CATALOG.find((e) => e.code === 'CB-80');
    expect(cb80).toBeDefined();
    expect(cb80!.vesselCost).toBe(0);
    expect(cb80!.isLegacy).toBe(false);
  });

  it('should not contain MED-10', () => {
    const med10 = PRODUCT_CATALOG.find((e) => e.code === 'MED-10');
    expect(med10).toBeUndefined();
  });

  it('should contain CB-95 and HB-95 as active mixed-gas codes', () => {
    const cb95 = PRODUCT_CATALOG.find((e) => e.code === 'CB-95');
    expect(cb95).toBeDefined();
    expect(cb95!.name).toBe('Argon Carbomix-95');
    expect(cb95!.cylinderType).toBe('Type D');
    expect(cb95!.gasType).toBe('Mixed');
    expect(cb95!.vesselCost).toBe(6000);
    expect(cb95!.isLegacy).toBe(false);
    expect(cb95!.mapsTo).toBeNull();

    const hb95 = PRODUCT_CATALOG.find((e) => e.code === 'HB-95');
    expect(hb95).toBeDefined();
    expect(hb95!.name).toBe('Argon Hyblend-95');
    expect(hb95!.cylinderType).toBe('Type D');
    expect(hb95!.gasType).toBe('Mixed');
    expect(hb95!.vesselCost).toBe(6000);
    expect(hb95!.isLegacy).toBe(false);
    expect(hb95!.mapsTo).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PRODUCT_VESSEL_COST backward-compatible map
// ---------------------------------------------------------------------------
describe('PRODUCT_VESSEL_COST map', () => {
  describe('Type D codes cost 6,000', () => {
    const typeDCodes = ['IND-7', 'MED-D', 'N2-7', 'ARG', '7m3', 'Type-D'];
    it.each(typeDCodes)('%s -> 6000', (code) => {
      expect(getVesselCost(code)).toBe(TYPE_D_COST);
    });
  });

  it('DA-001 costs 5,000', () => {
    expect(getVesselCost('DA-001')).toBe(DA_COST);
  });

  it('10Cbm (legacy CB10) costs 7,500', () => {
    expect(getVesselCost('10Cbm')).toBe(CB10_COST);
  });

  describe('CB6 codes cost 5,000', () => {
    const cb6Codes = ['IND-6', 'MED-6'];
    it.each(cb6Codes)('%s -> 5000', (code) => {
      expect(getVesselCost(code)).toBe(CB6_COST);
    });
  });

  describe('Type B/A codes cost 3,000', () => {
    const typeBACodes = ['MED-B', 'MED-A', 'Type-B', 'Type-A'];
    it.each(typeBACodes)('%s -> 3000', (code) => {
      expect(getVesselCost(code)).toBe(TYPE_B_COST);
    });
  });

  it('IND-10 costs 7,500', () => {
    expect(getVesselCost('IND-10')).toBe(CB10_COST);
  });

  describe('CO2 27KG codes cost 5,000', () => {
    const co2_27Codes = ['CO2-27KG', '27Kg', '27'];
    it.each(co2_27Codes)('%s -> 5000', (code) => {
      expect(getVesselCost(code)).toBe(CO2_27_COST);
    });
  });

  describe('CO2 30KG codes cost 6,000', () => {
    const co2_30Codes = ['CO2-30KG', '30Kg'];
    it.each(co2_30Codes)('%s -> 6000', (code) => {
      expect(getVesselCost(code)).toBe(CO2_30_COST);
    });
  });

  describe('CO2 45KG codes cost 7,500', () => {
    const co2_45Codes = ['CO2-45KG', '45Kg'];
    it.each(co2_45Codes)('%s -> 7500', (code) => {
      expect(getVesselCost(code)).toBe(CO2_45_COST);
    });
  });

  describe('LPG codes cost 2,100', () => {
    const lpgCodes = ['LPG/C-19.2', 'LPG/D-19.2'];
    it.each(lpgCodes)('%s -> 2100', (code) => {
      expect(getVesselCost(code)).toBe(LPG_COST);
    });
  });

  it('should include CB-80 in the map with cost 0', () => {
    expect(PRODUCT_VESSEL_COST['CB-80']).toBe(0);
  });

  it('should include ACM8020 in the map with cost 0', () => {
    expect(PRODUCT_VESSEL_COST['ACM8020']).toBe(0);
  });

  it('should include CB-95 and HB-95 in the map', () => {
    expect(PRODUCT_VESSEL_COST['CB-95']).toBe(TYPE_D_COST);
    expect(PRODUCT_VESSEL_COST['HB-95']).toBe(TYPE_D_COST);
  });
});

// ---------------------------------------------------------------------------
// FALLBACK_VESSEL_COST
// ---------------------------------------------------------------------------
describe('FALLBACK_VESSEL_COST', () => {
  it('should be 0', () => {
    expect(FALLBACK_VESSEL_COST).toBe(EXPECTED_FALLBACK);
  });

  it('unknown code should return fallback', () => {
    expect(getVesselCost('NONEXISTENT')).toBe(EXPECTED_FALLBACK);
  });
});

// ---------------------------------------------------------------------------
// getProductEntry()
// ---------------------------------------------------------------------------
describe('getProductEntry()', () => {
  it('should return full entry for IND-7', () => {
    const entry = getProductEntry('IND-7');
    expect(entry).toBeDefined();
    expect(entry!.name).toBe('Industrial Oxygen Type D 7m³');
    expect(entry!.cylinderType).toBe('Type D');
    expect(entry!.gasType).toBe('O2');
    expect(entry!.vesselCost).toBe(6000);
    expect(entry!.isLegacy).toBe(false);
  });

  it('should return entry for legacy code "Argon"', () => {
    const entry = getProductEntry('Argon');
    expect(entry).toBeDefined();
    expect(entry!.isLegacy).toBe(true);
    expect(entry!.mapsTo).toBe('ARG');
  });

  it('should return entry for CB-80 with cost 0', () => {
    const entry = getProductEntry('CB-80');
    expect(entry).toBeDefined();
    expect(entry!.vesselCost).toBe(0);
    expect(entry!.gasType).toBe('Mixed');
  });

  it('should return undefined for unknown code', () => {
    expect(getProductEntry('UNKNOWN')).toBeUndefined();
  });

  it('should return undefined for removed MED-10', () => {
    expect(getProductEntry('MED-10')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resolveLegacyCode()
// ---------------------------------------------------------------------------
describe('resolveLegacyCode()', () => {
  it('should resolve "Argon" to "ARG"', () => {
    expect(resolveLegacyCode('Argon')).toBe('ARG');
  });

  it('should resolve "7m3" to "IND-7"', () => {
    expect(resolveLegacyCode('7m3')).toBe('IND-7');
  });

  it('should resolve "Type-D" to "IND-7"', () => {
    expect(resolveLegacyCode('Type-D')).toBe('IND-7');
  });

  it('should resolve "27Kg" to "CO2-27KG"', () => {
    expect(resolveLegacyCode('27Kg')).toBe('CO2-27KG');
  });

  it('should resolve "CO2IND45m" to "CO2-45KG"', () => {
    expect(resolveLegacyCode('CO2IND45m')).toBe('CO2-45KG');
  });

  it('should return original code if not legacy', () => {
    expect(resolveLegacyCode('IND-7')).toBe('IND-7');
    expect(resolveLegacyCode('CO2-30KG')).toBe('CO2-30KG');
  });

  it('should return original code if unknown', () => {
    expect(resolveLegacyCode('UNKNOWN')).toBe('UNKNOWN');
  });

  describe('size-variant codes from customer balances', () => {
    it('should resolve O2 small volume codes to IND-6', () => {
      expect(resolveLegacyCode('4')).toBe('IND-6');
      expect(resolveLegacyCode('5Cbm')).toBe('IND-6');
      expect(resolveLegacyCode('6Cbm')).toBe('IND-6');
      expect(resolveLegacyCode('6')).toBe('IND-6');
    });

    it('should resolve O2 large volume codes to IND-7', () => {
      expect(resolveLegacyCode('7')).toBe('IND-7');
      expect(resolveLegacyCode('8')).toBe('IND-7');
      expect(resolveLegacyCode('15')).toBe('IND-7');
      expect(resolveLegacyCode('18')).toBe('IND-7');
      expect(resolveLegacyCode('20')).toBe('IND-7');
      expect(resolveLegacyCode('24')).toBe('IND-7');
      expect(resolveLegacyCode('29')).toBe('IND-7');
    });

    it('should resolve O2 10m³ to IND-10', () => {
      expect(resolveLegacyCode('10')).toBe('IND-10');
    });

    it('should resolve small O2 to MED-A', () => {
      expect(resolveLegacyCode('1.5')).toBe('MED-A');
    });

    it('should resolve CO2 Kg variants', () => {
      expect(resolveLegacyCode('2Kg')).toBe('CO2-27KG');
      expect(resolveLegacyCode('10Kg')).toBe('CO2-27KG');
      expect(resolveLegacyCode('15Kg')).toBe('CO2-27KG');
      expect(resolveLegacyCode('18Kg')).toBe('CO2-27KG');
      expect(resolveLegacyCode('20Kg')).toBe('CO2-27KG');
      expect(resolveLegacyCode('25Kg')).toBe('CO2-27KG');
      expect(resolveLegacyCode('29Kg')).toBe('CO2-30KG');
    });

    it('should resolve LPG weight variant', () => {
      expect(resolveLegacyCode('19.2Kg')).toBe('LPG/C-19.2');
    });
  });
});

// ---------------------------------------------------------------------------
// getGasType() and getCylinderType()
// ---------------------------------------------------------------------------
describe('getGasType()', () => {
  it('should return O2 for IND-7', () => {
    expect(getGasType('IND-7')).toBe('O2');
  });

  it('should return CO2 for CO2-30KG', () => {
    expect(getGasType('CO2-30KG')).toBe('CO2');
  });

  it('should return Mixed for CB-80', () => {
    expect(getGasType('CB-80')).toBe('Mixed');
  });

  it('should return Mixed for CB-95', () => {
    expect(getGasType('CB-95')).toBe('Mixed');
  });

  it('should return Mixed for HB-95', () => {
    expect(getGasType('HB-95')).toBe('Mixed');
  });

  it('should return undefined for unknown', () => {
    expect(getGasType('UNKNOWN')).toBeUndefined();
  });
});

describe('getCylinderType()', () => {
  it('should return Type D for IND-7', () => {
    expect(getCylinderType('IND-7')).toBe('Type D');
  });

  it('should return CB6 for IND-6', () => {
    expect(getCylinderType('IND-6')).toBe('CB6');
  });

  it('should return Type D for CB-95', () => {
    expect(getCylinderType('CB-95')).toBe('Type D');
  });

  it('should return undefined for unknown', () => {
    expect(getCylinderType('UNKNOWN')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getVesselCost()
// ---------------------------------------------------------------------------
describe('getVesselCost()', () => {
  it('should return correct cost for IND-7', () => {
    expect(getVesselCost('IND-7')).toBe(6000);
  });

  it('should return correct cost for MED-B', () => {
    expect(getVesselCost('MED-B')).toBe(3000);
  });

  it('should return 0 for CB-80', () => {
    expect(getVesselCost('CB-80')).toBe(0);
  });

  it('should return FALLBACK (0) for unknown product codes', () => {
    expect(getVesselCost('UNKNOWN')).toBe(EXPECTED_FALLBACK);
    expect(getVesselCost('')).toBe(EXPECTED_FALLBACK);
  });

  it('should be case-sensitive', () => {
    expect(getVesselCost('ind-7')).toBe(EXPECTED_FALLBACK);
    expect(getVesselCost('IND-7')).toBe(TYPE_D_COST);
  });
});

// ---------------------------------------------------------------------------
// calculateCapitalLocked()
// ---------------------------------------------------------------------------
describe('calculateCapitalLocked()', () => {
  describe('with per-product holdings', () => {
    it('should sum cost * count for a single product type', () => {
      const holdings = [{ productCode: 'IND-7', cylinderCount: 10 }];
      expect(calculateCapitalLocked(holdings, 10)).toBe(10 * 6000);
    });

    it('should sum cost * count for multiple product types', () => {
      const holdings = [
        { productCode: 'IND-7', cylinderCount: 5 },   // 5 * 6000 = 30000
        { productCode: 'MED-B', cylinderCount: 3 },   // 3 * 3000 = 9000
        { productCode: 'CO2-30KG', cylinderCount: 2 }, // 2 * 6000 = 12000
      ];
      expect(calculateCapitalLocked(holdings, 10)).toBe(51000);
    });

    it('should use fallback cost (0) for unknown products within the array', () => {
      const holdings = [
        { productCode: 'IND-7', cylinderCount: 2 },    // 2 * 6000 = 12000
        { productCode: 'MYSTERY', cylinderCount: 1 },   // 1 * 0 = 0
      ];
      expect(calculateCapitalLocked(holdings, 3)).toBe(12000);
    });

    it('should ignore totalCylinders param when holdings are provided', () => {
      const holdings = [{ productCode: 'MED-B', cylinderCount: 4 }];
      expect(calculateCapitalLocked(holdings, 100)).toBe(4 * 3000);
    });

    it('should handle a mix of all vessel categories', () => {
      const holdings = [
        { productCode: 'IND-7', cylinderCount: 6 },      // 6 * 6000 = 36000
        { productCode: 'MED-B', cylinderCount: 3 },      // 3 * 3000 = 9000
        { productCode: 'CO2-45KG', cylinderCount: 1 },   // 1 * 7500 = 7500
        { productCode: 'LPG/C-19.2', cylinderCount: 2 }, // 2 * 2100 = 4200
      ];
      expect(calculateCapitalLocked(holdings, 12)).toBe(56700);
    });
  });

  describe('fallback to totalCylinders * FALLBACK_VESSEL_COST', () => {
    it('should use fallback when holdings is undefined', () => {
      expect(calculateCapitalLocked(undefined, 10)).toBe(10 * 0);
    });

    it('should use fallback when holdings is null', () => {
      expect(calculateCapitalLocked(null, 10)).toBe(10 * 0);
    });

    it('should use fallback when holdings is an empty array', () => {
      expect(calculateCapitalLocked([], 10)).toBe(10 * 0);
    });

    it('should return 0 when holdings is empty and totalCylinders is 0', () => {
      expect(calculateCapitalLocked([], 0)).toBe(0);
    });

    it('should return 0 when holdings is null and totalCylinders is 0', () => {
      expect(calculateCapitalLocked(null, 0)).toBe(0);
    });

    it('should return 0 when holdings is undefined and totalCylinders is 0', () => {
      expect(calculateCapitalLocked(undefined, 0)).toBe(0);
    });
  });

  describe('with zero quantities', () => {
    it('should return 0 when all cylinder counts are 0', () => {
      const holdings = [
        { productCode: 'IND-7', cylinderCount: 0 },
        { productCode: 'MED-B', cylinderCount: 0 },
      ];
      expect(calculateCapitalLocked(holdings, 0)).toBe(0);
    });

    it('should handle mix of zero and non-zero counts', () => {
      const holdings = [
        { productCode: 'IND-7', cylinderCount: 0 },
        { productCode: 'MED-B', cylinderCount: 5 },
      ];
      expect(calculateCapitalLocked(holdings, 5)).toBe(5 * 3000);
    });
  });

  describe('edge cases', () => {
    it('should handle a single holding entry', () => {
      const holdings = [{ productCode: 'ARG', cylinderCount: 1 }];
      expect(calculateCapitalLocked(holdings, 1)).toBe(6000);
    });

    it('should handle large cylinder counts', () => {
      const holdings = [{ productCode: 'IND-7', cylinderCount: 10000 }];
      expect(calculateCapitalLocked(holdings, 10000)).toBe(60_000_000);
    });

    it('should handle large totalCylinders in fallback path', () => {
      expect(calculateCapitalLocked(null, 50000)).toBe(50000 * 0);
    });
  });
});

// ---------------------------------------------------------------------------
// calculateCapitalLockedDetailed()
// ---------------------------------------------------------------------------
describe('calculateCapitalLockedDetailed()', () => {
  it('should return correct shape', () => {
    const result = calculateCapitalLockedDetailed(null, 10);
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('unknownCostCylinders');
  });

  it('should use fallback when holdings is null', () => {
    const result = calculateCapitalLockedDetailed(null, 10);
    expect(result.total).toBe(10 * 0);
    expect(result.unknownCostCylinders).toBe(0);
  });

  it('should use fallback when holdings is empty', () => {
    const result = calculateCapitalLockedDetailed([], 10);
    expect(result.total).toBe(10 * 0);
    expect(result.unknownCostCylinders).toBe(0);
  });

  it('should include CB-80 cylinders in total with cost 0', () => {
    const holdings = [
      { productCode: 'IND-7', cylinderCount: 5 },  // 5 * 6000 = 30000
      { productCode: 'CB-80', cylinderCount: 3 },  // 3 * 0 = 0
    ];
    const result = calculateCapitalLockedDetailed(holdings, 8);
    expect(result.total).toBe(5 * 6000); // CB-80 contributes 0
    expect(result.unknownCostCylinders).toBe(0); // CB-80 is no longer null-cost
  });

  it('should handle all-known holdings', () => {
    const holdings = [
      { productCode: 'IND-7', cylinderCount: 2 },  // 2 * 6000 = 12000
      { productCode: 'MED-B', cylinderCount: 3 },  // 3 * 3000 = 9000
    ];
    const result = calculateCapitalLockedDetailed(holdings, 5);
    expect(result.total).toBe(2 * 6000 + 3 * 3000);
    expect(result.unknownCostCylinders).toBe(0);
  });

  it('should handle CB-80 only holdings with cost 0', () => {
    const holdings = [
      { productCode: 'CB-80', cylinderCount: 10 },
    ];
    const result = calculateCapitalLockedDetailed(holdings, 10);
    expect(result.total).toBe(0);
    expect(result.unknownCostCylinders).toBe(0);
  });

  it('should use fallback (0) for truly unknown products (not in catalog at all)', () => {
    const holdings = [
      { productCode: 'MYSTERY-GAS', cylinderCount: 2 },
    ];
    const result = calculateCapitalLockedDetailed(holdings, 2);
    // MYSTERY-GAS is not in catalog, so it goes through getVesselCost -> fallback (0)
    expect(result.total).toBe(2 * 0);
    expect(result.unknownCostCylinders).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Cross-package consistency
// ---------------------------------------------------------------------------
describe('Cross-package consistency with backend', () => {
  // Backend product codes — all that have known costs (excluding MED-10)
  const backendKnownCodes = [
    'IND-7', 'MED-D', 'N2-7', 'ARG', 'DA-001', '7m3', '10Cbm', 'Type-D',
    'MED-B', 'IND-6', 'MED-6', 'IND-10', 'MED-A', 'Type-B', 'Type-A',
    'CO2-27KG', 'CO2-30KG', 'CO2-45KG', '27Kg', '30Kg', '45Kg', '27',
    'LPG/C-19.2', 'LPG/D-19.2', 'CB-95', 'HB-95',
  ];

  it('should map all known product codes to catalog entries', () => {
    for (const code of backendKnownCodes) {
      expect(getProductEntry(code), `${code} should exist in catalog`).toBeDefined();
    }
  });

  it('should agree on Type D cost (6000)', () => {
    expect(getVesselCost('IND-7')).toBe(6000);
    expect(getVesselCost('7m3')).toBe(6000);
  });

  it('should agree on Type B cost (3000)', () => {
    expect(getVesselCost('MED-B')).toBe(3000);
    expect(getVesselCost('Type-A')).toBe(3000);
  });

  it('should agree on CO2-30KG cost (6000)', () => {
    expect(getVesselCost('CO2-30KG')).toBe(6000);
  });

  it('should agree on CO2-27KG cost (5000)', () => {
    expect(getVesselCost('CO2-27KG')).toBe(5000);
    expect(getVesselCost('27Kg')).toBe(5000);
  });

  it('should agree on LPG cost (2100)', () => {
    expect(getVesselCost('LPG/C-19.2')).toBe(2100);
  });

  it('should use the same fallback cost (0)', () => {
    expect(getVesselCost('DOES_NOT_EXIST')).toBe(0);
  });
});
