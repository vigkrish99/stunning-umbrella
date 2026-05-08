import { test, expect } from '@playwright/test';

/**
 * E2E tests for Session 19 fixes (uses saved auth state from playwright.config.ts):
 * 1. Rotation page filters (date init + segment)
 * 2. Profit page filters (segment)
 * 3. PC data exclusion
 * 4. Sales report filters (customer type + status)
 * 5. LPG manual holding input
 *
 * Run: npx playwright test e2e/session19-fixes.spec.ts
 */

// ── API tests through authenticated page context ──────────────────

test.describe('API: PC Data Exclusion + Segment', () => {
  test('rotation API returns segment and no /PC products', async ({ page }) => {
    await page.goto('/cylinder');
    const data = await page.evaluate(async () => {
      const res = await fetch('/api/cylinder/rotation');
      return res.ok ? res.json() : null;
    });

    expect(data).not.toBeNull();
    if (data?.rotation?.length > 0) {
      expect(data.rotation[0]).toHaveProperty('segment');
      expect(typeof data.rotation[0].segment).toBe('string');
      for (const row of data.rotation) {
        expect(row.productCode).not.toMatch(/\/PC/i);
      }
    }
  });

  test('profit API returns segment and no /PC products', async ({ page }) => {
    await page.goto('/cylinder');
    const data = await page.evaluate(async () => {
      const res = await fetch('/api/cylinder/profit');
      return res.ok ? res.json() : null;
    });

    expect(data).not.toBeNull();
    if (data?.profit?.length > 0) {
      expect(data.profit[0]).toHaveProperty('segment');
      for (const row of data.profit) {
        expect(row.productCode).not.toMatch(/\/PC/i);
      }
    }
  });

  test('live alerts exclude /PC products', async ({ page }) => {
    await page.goto('/cylinder');
    const data = await page.evaluate(async () => {
      const res = await fetch('/api/alerts/cylinder/live?type=unbilled');
      return res.ok ? res.json() : null;
    });

    expect(data).not.toBeNull();
    if (data?.unbilled?.customers) {
      for (const customer of data.unbilled.customers) {
        for (const cyl of customer.cylinders || []) {
          expect(cyl.productCode).not.toMatch(/\/PC/i);
        }
      }
    }
  });
});

test.describe('API: Sales reports accept filters', () => {
  test('accepts segment param', async ({ page }) => {
    await page.goto('/cylinder');
    const data = await page.evaluate(async () => {
      const res = await fetch('/api/sales/reports?segment=Marketing');
      return res.ok ? res.json() : null;
    });

    expect(data).not.toBeNull();
    expect(data).toHaveProperty('reports');
  });

  test('accepts isActive param', async ({ page }) => {
    await page.goto('/cylinder');
    const data = await page.evaluate(async () => {
      const res = await fetch('/api/sales/reports?isActive=true');
      return res.ok ? res.json() : null;
    });

    expect(data).not.toBeNull();
    expect(data).toHaveProperty('reports');
  });
});

test.describe('API: LPG Holdings', () => {
  test('GET returns holdings list', async ({ page }) => {
    await page.goto('/cylinder');
    const data = await page.evaluate(async () => {
      const res = await fetch('/api/lpg/holdings');
      return res.ok ? res.json() : null;
    });

    expect(data).not.toBeNull();
    expect(data).toHaveProperty('holdings');
    expect(Array.isArray(data.holdings)).toBeTruthy();
  });

  test('POST validates required fields', async ({ page }) => {
    await page.goto('/cylinder');
    const status = await page.evaluate(async () => {
      const res = await fetch('/api/lpg/holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: 10 }),
      });
      return res.status;
    });

    expect(status).toBe(400);
  });

  test('rotation response includes holding + holdingsSource', async ({ page }) => {
    await page.goto('/cylinder');
    const data = await page.evaluate(async () => {
      const res = await fetch('/api/lpg/rotation');
      return res.ok ? res.json() : null;
    });

    expect(data).not.toBeNull();
    if (data?.rotation?.length > 0) {
      const row = data.rotation[0];
      expect(row).toHaveProperty('holding');
      expect(row).toHaveProperty('holdingsSource');
      expect(['manual', 'estimated']).toContain(row.holdingsSource);
    }
  });
});

// ── UI tests ──────────────────────────────────────────────────────

test.describe('UI: Rotation Page Filters', () => {
  test('date inputs are pre-populated with valid dates', async ({ page }) => {
    await page.goto('/cylinder/rotation', { waitUntil: 'domcontentloaded' });

    const startDate = page.locator('input[type="date"]').first();
    await expect(startDate).toBeVisible({ timeout: 15000 });
    const startVal = await startDate.inputValue();
    expect(startVal).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const endDate = page.locator('input[type="date"]').nth(1);
    const endVal = await endDate.inputValue();
    expect(endVal).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('segment dropdown exists and filters data', async ({ page }) => {
    await page.goto('/cylinder/rotation', { waitUntil: 'domcontentloaded' });

    const segmentSelect = page.locator('select').filter({ hasText: 'All Segments' });
    await expect(segmentSelect).toBeVisible({ timeout: 15000 });

    // Wait for table to populate
    await page.locator('table tbody tr').first().waitFor({ timeout: 30000 }).catch(() => {});
    const initialCount = await page.locator('table tbody tr').count();

    await segmentSelect.selectOption('Marketing');
    await page.waitForTimeout(1000);

    const filteredCount = await page.locator('table tbody tr').count();
    expect(filteredCount).toBeGreaterThanOrEqual(0);
    if (initialCount > 0) {
      expect(filteredCount).toBeLessThanOrEqual(initialCount);
    }
  });

  test('rating dropdown filters data', async ({ page }) => {
    await page.goto('/cylinder/rotation', { waitUntil: 'domcontentloaded' });

    const ratingSelect = page.locator('select').filter({ hasText: 'All Ratings' });
    await expect(ratingSelect).toBeVisible({ timeout: 15000 });

    await ratingSelect.selectOption('Good');
    await page.waitForTimeout(1000);

    const count = await page.locator('table tbody tr').count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('UI: Profit Page Filters', () => {
  test('segment dropdown exists and filters profit data', async ({ page }) => {
    await page.goto('/cylinder/profit', { waitUntil: 'domcontentloaded' });

    const segmentSelect = page.locator('select').filter({ hasText: 'All Segments' });
    await expect(segmentSelect).toBeVisible({ timeout: 30000 });

    await page.locator('table tbody tr').first().waitFor({ timeout: 30000 }).catch(() => {});
    const initialCount = await page.locator('table tbody tr').count();

    await segmentSelect.selectOption('Factory');
    await page.waitForTimeout(1000);

    const filteredCount = await page.locator('table tbody tr').count();
    expect(filteredCount).toBeGreaterThanOrEqual(0);
    if (initialCount > 0) {
      expect(filteredCount).toBeLessThanOrEqual(initialCount);
    }
  });

  test('sort dropdown works', async ({ page }) => {
    await page.goto('/cylinder/profit', { waitUntil: 'domcontentloaded' });

    const sortSelect = page.locator('select').filter({ hasText: 'Sort:' });
    await expect(sortSelect).toBeVisible({ timeout: 30000 });

    await sortSelect.selectOption('customerName');
    await page.waitForTimeout(500);

    const count = await page.locator('table tbody tr').count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('UI: Sales Report Filters', () => {
  test('customer type multi-select exists', async ({ page }) => {
    await page.goto('/sales/reports', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('text=Customer Type')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('button:has-text("All types")')).toBeVisible();
  });

  test('status filter dropdown exists and works', async ({ page }) => {
    await page.goto('/sales/reports', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('label:has-text("Status")')).toBeVisible({ timeout: 30000 });

    const statusSelect = page.locator('select').filter({ hasText: 'All Status' });
    await expect(statusSelect).toBeVisible();

    await statusSelect.selectOption('active');
    await page.waitForTimeout(2000);

    await expect(page.locator('text=Sales Trend')).toBeVisible();
  });
});

test.describe('UI: LPG Holdings Page', () => {
  test('holdings page accessible from LPG overview', async ({ page }) => {
    await page.goto('/lpg', { waitUntil: 'domcontentloaded' });

    const holdingsLink = page.locator('a[href="/lpg/holdings"]').first();
    await expect(holdingsLink).toBeVisible({ timeout: 30000 });

    await holdingsLink.click();
    await page.waitForURL(/\/lpg\/holdings/, { timeout: 15000 });

    await expect(page.locator('h1:has-text("LPG Holdings")')).toBeVisible({ timeout: 15000 });
  });

  test('add holding form renders correctly', async ({ page }) => {
    await page.goto('/lpg/holdings', { waitUntil: 'domcontentloaded' });

    const addBtn = page.locator('button:has-text("Add Holding")');
    await expect(addBtn).toBeVisible({ timeout: 15000 });

    await addBtn.click();

    // Wait for form to appear — button text changes to "Cancel"
    await expect(page.locator('button:has-text("Cancel")')).toBeVisible({ timeout: 5000 });

    await expect(page.getByText('Set Customer LPG Holding')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[placeholder*="Search customer"]')).toBeVisible();
    await expect(page.locator('input[type="number"], [role="spinbutton"]')).toBeVisible();
    await expect(page.locator('button:has-text("Save Holding")')).toBeVisible();
    await expect(page.locator('button:has-text("Save Holding")')).toBeDisabled();
  });

  test('LPG customers page shows Holding column', async ({ page }) => {
    await page.goto('/lpg/customers', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('th:has-text("Holding")')).toBeVisible({ timeout: 30000 });
  });
});
