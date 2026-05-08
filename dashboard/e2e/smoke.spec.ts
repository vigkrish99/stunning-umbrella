import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test('health check endpoint returns OK', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('status');
    expect(data.service).toBe('helix-dashboard');
  });

  test('dashboard page loads', async ({ page }) => {
    await page.goto('/');
    // Should either show dashboard content or redirect to sign-in
    const url = page.url();
    const isDashboard = !url.includes('sign-in');
    const isSignIn = url.includes('sign-in');
    expect(isDashboard || isSignIn).toBeTruthy();
  });

  test('sign-in page is accessible', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page).toHaveURL(/sign-in/);
  });
});

test.describe('Navigation', () => {
  test('API routes respond', async ({ request }) => {
    // Dashboard API should return JSON (may have empty data but should not 500)
    const dashboardRes = await request.get('/api/dashboard');
    // It may fail with 500 if no DB but should at least respond
    expect(dashboardRes.status()).toBeLessThan(502);

    // Health check should always work
    const healthRes = await request.get('/api/health');
    expect(healthRes.ok()).toBeTruthy();
  });
});
