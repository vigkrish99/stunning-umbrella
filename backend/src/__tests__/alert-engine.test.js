import { describe, it, expect } from 'vitest';

// Pure alert detection logic extracted from alert-engine.js

function detectDowngrade(current, previous) {
  if (!previous) return null;
  const wasHealthy = ['Excellent', 'Good'].includes(previous.performance);
  const isNowBad = ['Poor', 'Critical'].includes(current.performance);

  if (wasHealthy && isNowBad) {
    return {
      type: 'performance_downgrade',
      severity: current.performance === 'Critical' ? 'critical' : 'warning',
      message: `Performance dropped from ${previous.performance} to ${current.performance}`,
    };
  }
  return null;
}

function detectSustainedCritical(current, previous) {
  if (
    current.performance === 'Critical' &&
    previous?.performance === 'Critical'
  ) {
    return {
      type: 'sustained_critical',
      severity: 'critical',
      message: 'Critical performance for 2+ consecutive months. Consider cylinder recovery.',
    };
  }
  return null;
}

function detectRotationDrop(current, previous) {
  if (!previous || previous.rotationRate <= 0) return null;
  const drop = (previous.rotationRate - current.rotationRate) / previous.rotationRate;
  if (drop >= 0.5) {
    return {
      type: 'rotation_drop',
      severity: 'warning',
      dropPercent: Math.round(drop * 100),
    };
  }
  return null;
}

describe('detectDowngrade', () => {
  it('should detect Good to Poor transition', () => {
    const current = { performance: 'Poor', rotationRate: 1.5 };
    const previous = { performance: 'Good', rotationRate: 3.0 };
    const result = detectDowngrade(current, previous);
    expect(result).not.toBeNull();
    expect(result.type).toBe('performance_downgrade');
    expect(result.severity).toBe('warning');
  });

  it('should detect Good to Critical transition', () => {
    const current = { performance: 'Critical', rotationRate: 0.5 };
    const previous = { performance: 'Good', rotationRate: 2.5 };
    const result = detectDowngrade(current, previous);
    expect(result).not.toBeNull();
    expect(result.severity).toBe('critical');
  });

  it('should detect Excellent to Poor transition', () => {
    const current = { performance: 'Poor', rotationRate: 1.2 };
    const previous = { performance: 'Excellent', rotationRate: 4.5 };
    const result = detectDowngrade(current, previous);
    expect(result).not.toBeNull();
  });

  it('should NOT trigger for Poor to Critical', () => {
    const current = { performance: 'Critical', rotationRate: 0.5 };
    const previous = { performance: 'Poor', rotationRate: 1.2 };
    const result = detectDowngrade(current, previous);
    expect(result).toBeNull();
  });

  it('should NOT trigger for upgrade', () => {
    const current = { performance: 'Good', rotationRate: 3.0 };
    const previous = { performance: 'Poor', rotationRate: 1.5 };
    const result = detectDowngrade(current, previous);
    expect(result).toBeNull();
  });

  it('should NOT trigger when no previous data', () => {
    const current = { performance: 'Critical', rotationRate: 0.5 };
    const result = detectDowngrade(current, null);
    expect(result).toBeNull();
  });
});

describe('detectSustainedCritical', () => {
  it('should detect two consecutive Critical months', () => {
    const current = { performance: 'Critical' };
    const previous = { performance: 'Critical' };
    const result = detectSustainedCritical(current, previous);
    expect(result).not.toBeNull();
    expect(result.type).toBe('sustained_critical');
    expect(result.severity).toBe('critical');
  });

  it('should NOT trigger for single Critical month', () => {
    const current = { performance: 'Critical' };
    const previous = { performance: 'Poor' };
    const result = detectSustainedCritical(current, previous);
    expect(result).toBeNull();
  });

  it('should NOT trigger for non-Critical', () => {
    const current = { performance: 'Poor' };
    const previous = { performance: 'Poor' };
    const result = detectSustainedCritical(current, previous);
    expect(result).toBeNull();
  });

  it('should NOT trigger without previous data', () => {
    const current = { performance: 'Critical' };
    const result = detectSustainedCritical(current, null);
    expect(result).toBeNull();
  });
});

describe('detectRotationDrop', () => {
  it('should detect 50%+ drop', () => {
    const current = { rotationRate: 1.0 };
    const previous = { rotationRate: 3.0 };
    const result = detectRotationDrop(current, previous);
    expect(result).not.toBeNull();
    expect(result.type).toBe('rotation_drop');
    expect(result.dropPercent).toBe(67);
  });

  it('should detect exactly 50% drop', () => {
    const current = { rotationRate: 1.5 };
    const previous = { rotationRate: 3.0 };
    const result = detectRotationDrop(current, previous);
    expect(result).not.toBeNull();
    expect(result.dropPercent).toBe(50);
  });

  it('should NOT trigger for less than 50% drop', () => {
    const current = { rotationRate: 2.0 };
    const previous = { rotationRate: 3.0 };
    const result = detectRotationDrop(current, previous);
    expect(result).toBeNull();
  });

  it('should NOT trigger for improvement', () => {
    const current = { rotationRate: 4.0 };
    const previous = { rotationRate: 2.0 };
    const result = detectRotationDrop(current, previous);
    expect(result).toBeNull();
  });

  it('should NOT trigger without previous data', () => {
    const current = { rotationRate: 1.0 };
    const result = detectRotationDrop(current, null);
    expect(result).toBeNull();
  });

  it('should NOT trigger when previous rate is 0', () => {
    const current = { rotationRate: 1.0 };
    const previous = { rotationRate: 0 };
    const result = detectRotationDrop(current, previous);
    expect(result).toBeNull();
  });
});
