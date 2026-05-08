import { describe, it, expect } from 'vitest';

// Pure matching logic extracted from ingest-customers.js

function normalizeForComparison(str) {
  return (str || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .trim();
}

function calculateSimilarity(a, b) {
  const s1 = normalizeForComparison(a);
  const s2 = normalizeForComparison(b);

  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1.0;

  // Simple Dice coefficient using bigrams
  const bigrams = (str) => {
    const result = new Set();
    for (let i = 0; i < str.length - 1; i++) {
      result.add(str.slice(i, i + 2));
    }
    return result;
  };

  const bg1 = bigrams(s1);
  const bg2 = bigrams(s2);

  let intersection = 0;
  for (const b of bg1) {
    if (bg2.has(b)) intersection++;
  }

  return (2 * intersection) / (bg1.size + bg2.size);
}

function findBestMatch(name, candidates, threshold = 0.8) {
  let bestMatch = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const score = calculateSimilarity(name, candidate.name);
    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  return bestMatch ? { match: bestMatch, score: bestScore } : null;
}

describe('normalizeForComparison', () => {
  it('should lowercase strings', () => {
    expect(normalizeForComparison('ABC Corp')).toBe('abc corp');
  });

  it('should collapse whitespace', () => {
    expect(normalizeForComparison('ABC   Corp')).toBe('abc corp');
  });

  it('should remove special characters', () => {
    expect(normalizeForComparison('A.B.C. Corp!')).toBe('abc corp');
  });

  it('should handle null/undefined', () => {
    expect(normalizeForComparison(null)).toBe('');
    expect(normalizeForComparison(undefined)).toBe('');
  });

  it('should trim', () => {
    expect(normalizeForComparison('  ABC  ')).toBe('abc');
  });
});

describe('calculateSimilarity', () => {
  it('should return 1 for identical strings', () => {
    expect(calculateSimilarity('ABC Corp', 'ABC Corp')).toBe(1);
  });

  it('should return 1 for case-insensitive match', () => {
    expect(calculateSimilarity('ABC CORP', 'abc corp')).toBe(1);
  });

  it('should return high score for very similar strings', () => {
    const score = calculateSimilarity('ABC Industries', 'ABC Industry');
    expect(score).toBeGreaterThan(0.7);
  });

  it('should return low score for very different strings', () => {
    const score = calculateSimilarity('ABC Corp', 'XYZ Ltd');
    expect(score).toBeLessThan(0.3);
  });

  it('should return 0 for empty strings', () => {
    expect(calculateSimilarity('', '')).toBe(0);
    expect(calculateSimilarity('ABC', '')).toBe(0);
  });
});

describe('findBestMatch', () => {
  const candidates = [
    { name: 'ABC Industries', id: '1' },
    { name: 'XYZ Corporation', id: '2' },
    { name: 'Global Gas Ltd', id: '3' },
  ];

  it('should find exact match', () => {
    const result = findBestMatch('ABC Industries', candidates);
    expect(result).not.toBeNull();
    expect(result?.match.id).toBe('1');
    expect(result?.score).toBe(1);
  });

  it('should find close match above threshold', () => {
    const result = findBestMatch('ABC Industry', candidates);
    expect(result).not.toBeNull();
    expect(result?.match.id).toBe('1');
  });

  it('should return null when no match above threshold', () => {
    const result = findBestMatch('Completely Different Name', candidates);
    expect(result).toBeNull();
  });

  it('should respect custom threshold', () => {
    const result = findBestMatch('ABC Ind', candidates, 0.95);
    expect(result).toBeNull();
  });
});
