import { test, expect } from '@playwright/test';

test.describe('static help mirror', () => {
  test('landing page lists top-level topics and links to manifest', async ({ page }) => {
    await page.goto('/help/');
    await expect(page).toHaveTitle(/help/i);
    await expect(page.getByText(/cyoda-go v\d/).first()).toBeVisible();
    await expect(page.getByRole('link', { name: '/help/index.json' })).toHaveAttribute('href', /\/help\/index\.json$/);
    await expect(page.getByRole('link', { name: '/help/versions.json' })).toHaveAttribute('href', /\/help\/versions\.json$/);
  });

  test('topic tree page links into rendered mirror', async ({ page }) => {
    await page.goto('/help/topic-tree/');
    // At least one topic invocation appears as a link to /help/<top>/.
    // Scope to <main>: the sidebar also carries /help/ links, and it is
    // collapsed (and so not visible) on mobile viewports — an unscoped
    // .first() resolves to one of those and fails on Mobile Chrome/Safari.
    const link = page.locator('main a[href^="/help/"]').first();
    await expect(link).toBeVisible();
  });

  test('per-topic page renders body, version indicator, raw-format links', async ({ page }) => {
    await page.goto('/help/cli/');
    await expect(page.getByText(/cyoda-go version \d/)).toBeVisible();
    await expect(page.getByText(/cyoda help cli/).first()).toBeVisible();
    await expect(page.getByRole('link', { name: '/help/cli.json' })).toBeVisible();
    await expect(page.getByRole('link', { name: '/help/cli.md' })).toBeVisible();
  });

  test('manifest endpoint returns valid JSON with live-API envelope', async ({ request }) => {
    const resp = await request.get('/help/index.json');
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.schema).toBe(1);
    expect(typeof body.version).toBe('string');
    expect(Array.isArray(body.topics)).toBe(true);
    expect(body.topics.length).toBeGreaterThan(0);
    for (const t of body.topics) {
      expect(typeof t.topic).toBe('string');
      expect(typeof t.title).toBe('string');
      expect(typeof t.tagline).toBe('string');
      expect(Array.isArray(t.see_also)).toBe(true);
      expect('body' in t).toBe(false);
    }
  });

  test('per-topic JSON descriptor returns full body and sections', async ({ request }) => {
    const resp = await request.get('/help/cli.json');
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.topic).toBe('cli');
    expect(body.path).toEqual(['cli']);
    expect(typeof body.body).toBe('string');
    expect(body.body.length).toBeGreaterThan(0);
    expect(Array.isArray(body.sections)).toBe(true);
  });

  test('per-topic raw markdown returns body without frontmatter', async ({ request }) => {
    const resp = await request.get('/help/cli.md');
    expect(resp.status()).toBe(200);
    const text = await resp.text();
    expect(text.startsWith('---')).toBe(false);
    expect(text).toContain('cli');
  });

  test('asset and Starlight page coexist at distinct URLs', async ({ request }) => {
    const asset = await request.get('/help/cli.md');
    expect(asset.status()).toBe(200);
    expect((await asset.text()).startsWith('---')).toBe(false);

    const pageResp = await request.get('/help/cli/');
    expect(pageResp.status()).toBe(200);
    expect(await pageResp.text()).toContain('<html');
  });

  test('versions.json returns the registry', async ({ request }) => {
    const resp = await request.get('/help/versions.json');
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(typeof body.current).toBe('string');
    expect(Array.isArray(body.versions)).toBe(true);
    expect(body.versions[0].current).toBe(true);
  });

  test('legacy /reference/cyoda-help/ redirects to /help/topic-tree/', async ({ page }) => {
    await page.goto('/reference/cyoda-help/');
    await expect(page).toHaveURL(/\/help\/topic-tree\/?$/);
  });
});
