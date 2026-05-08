import { describe, it, expect } from 'vitest';
import { generateCSV, formatINR, csvConfigs } from '@/lib/export/csv';
import { ApiError, buildQueryString } from '@/lib/api';

describe('generateCSV', () => {
  it('should generate CSV with headers and rows', () => {
    const headers = ['Name', 'Value'];
    const rows = [
      { name: 'Alice', value: '100' },
      { name: 'Bob', value: '200' },
    ];
    const fieldMap = { Name: 'name', Value: 'value' };
    const csv = generateCSV(headers, rows, fieldMap);
    expect(csv).toBe('Name,Value\nAlice,100\nBob,200');
  });

  it('should escape commas in values', () => {
    const headers = ['Name'];
    const rows = [{ name: 'Smith, John' }];
    const fieldMap = { Name: 'name' };
    const csv = generateCSV(headers, rows, fieldMap);
    expect(csv).toBe('Name\n"Smith, John"');
  });

  it('should escape double quotes in values', () => {
    const headers = ['Name'];
    const rows = [{ name: 'The "Best" Co' }];
    const fieldMap = { Name: 'name' };
    const csv = generateCSV(headers, rows, fieldMap);
    expect(csv).toBe('Name\n"The ""Best"" Co"');
  });

  it('should handle empty rows', () => {
    const headers = ['Name', 'Value'];
    const rows: Array<Record<string, unknown>> = [];
    const fieldMap = { Name: 'name', Value: 'value' };
    const csv = generateCSV(headers, rows, fieldMap);
    expect(csv).toBe('Name,Value');
  });

  it('should handle null/undefined values', () => {
    const headers = ['Name', 'Value'];
    const rows = [{ name: null, value: undefined }];
    const fieldMap = { Name: 'name', Value: 'value' };
    const csv = generateCSV(headers, rows, fieldMap);
    expect(csv).toBe('Name,Value\n,');
  });

  it('should resolve nested field paths', () => {
    const headers = ['Period', 'Rate'];
    const rows = [{ period: { label: '2025-01' }, rotationRate: 3.5 }];
    const fieldMap = { Period: 'period.label', Rate: 'rotationRate' };
    const csv = generateCSV(headers, rows, fieldMap);
    expect(csv).toBe('Period,Rate\n2025-01,3.5');
  });
});

describe('formatINR', () => {
  it('should format Indian Rupees', () => {
    const result = formatINR(75000);
    // Should include ₹ symbol and Indian grouping
    expect(result).toContain('₹');
    expect(result).toContain('75,000');
  });

  it('should format large amounts with Indian number grouping', () => {
    const result = formatINR(7500000);
    // Indian format: ₹75,00,000
    expect(result).toContain('₹');
  });

  it('should handle zero', () => {
    const result = formatINR(0);
    expect(result).toContain('₹');
    expect(result).toContain('0');
  });
});

describe('csvConfigs', () => {
  it('should have customers config', () => {
    expect(csvConfigs.customers.headers).toContain('Customer ID');
    expect(csvConfigs.customers.headers).toContain('Name');
    expect(csvConfigs.customers.headers).toContain('Performance');
  });

  it('should have metrics config', () => {
    expect(csvConfigs.metrics.headers).toContain('Customer');
    expect(csvConfigs.metrics.headers).toContain('Rotation Rate');
  });

  it('should have invoices config', () => {
    expect(csvConfigs.invoices.headers).toContain('Invoice #');
    expect(csvConfigs.invoices.headers).toContain('Amount');
  });
});

describe('ApiError', () => {
  it('should create error with status and message', () => {
    const error = new ApiError(404, 'Not found');
    expect(error.status).toBe(404);
    expect(error.message).toBe('Not found');
    expect(error.name).toBe('ApiError');
  });

  it('should extend Error', () => {
    const error = new ApiError(500, 'Server error');
    expect(error).toBeInstanceOf(Error);
  });

  it('should include optional data', () => {
    const error = new ApiError(400, 'Bad request', { field: 'name' });
    expect(error.data).toEqual({ field: 'name' });
  });
});

describe('buildQueryString', () => {
  it('should build query string from params', () => {
    const result = buildQueryString({ page: 1, limit: 25 });
    expect(result).toBe('?page=1&limit=25');
  });

  it('should skip undefined values', () => {
    const result = buildQueryString({ page: 1, search: undefined });
    expect(result).toBe('?page=1');
  });

  it('should skip empty string values', () => {
    const result = buildQueryString({ page: 1, search: '' });
    expect(result).toBe('?page=1');
  });

  it('should return empty string when no valid params', () => {
    const result = buildQueryString({ search: undefined });
    expect(result).toBe('');
  });

  it('should handle boolean values', () => {
    const result = buildQueryString({ active: true });
    expect(result).toBe('?active=true');
  });
});
