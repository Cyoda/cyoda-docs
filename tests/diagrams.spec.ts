import { test, expect } from '@playwright/test';

// The three diagrams on these pages were authored as ```mermaid fences and
// rendered to SVG at build time by rehype-mermaid. They are now hand-authored
// Astro components wrapping real markdown lists, so the content stays in the
// page source (and in dist/markdown/ + Pagefind) instead of becoming an image.

const DIAGRAM_PAGES = [
  '/cyoda-cloud/identity-and-entitlements/',
  '/reference/trino/',
];

test.describe('Hand-authored diagrams', () => {
  test('key rotation renders as a five-step flow', async ({ page }) => {
    await page.goto('/cyoda-cloud/identity-and-entitlements/');
    const flow = page.locator('.step-flow');
    await expect(flow).toHaveCount(1);
    await expect(flow.locator('ol > li')).toHaveCount(5);
    await expect(flow).toContainText('Invalidate the old key');
  });

  test('OIDC login renders as a three-lane swimlane', async ({ page }) => {
    await page.goto('/cyoda-cloud/identity-and-entitlements/');
    const seq = page.locator('.seq-flow');
    await expect(seq).toHaveCount(1);
    // Lanes are derived from the order actors first appear in the markdown.
    await expect(seq.locator('.seq-flow__actor')).toHaveText([
      'User',
      'OIDC Provider',
      'Cyoda Cloud',
    ]);
    await expect(seq.locator('.seq-flow__lane')).toHaveCount(3);
    await expect(seq.locator('.seq-flow__message')).toHaveCount(5);
    // Arrow direction follows lane order, so the response legs point back.
    await expect(seq.locator('.seq-flow__arrow[data-dir="rtl"]')).toHaveCount(2);
    // The actor pair stays in the DOM for screen readers even though the
    // lanes carry it visually.
    await expect(seq.locator('.seq-flow__pair').first()).toHaveText('User → OIDC Provider');
  });

  test('swimlane arrows start and end on the lifelines', async ({ page }) => {
    await page.goto('/cyoda-cloud/identity-and-entitlements/');
    const geometry = await page.evaluate(() => {
      const centre = (el: Element) => {
        const r = el.getBoundingClientRect();
        return Math.round(r.left + r.width / 2);
      };
      const lanes = [...document.querySelectorAll('.seq-flow__lane')].map(centre);
      const arrows = [...document.querySelectorAll('.seq-flow__arrow')].map((a) => {
        const r = a.getBoundingClientRect();
        return [Math.round(r.left), Math.round(r.right)];
      });
      return { lanes, arrows };
    });
    // Guards the layout bug where Starlight's list padding outranked the
    // grid reset and shifted every arrow off its lane by half a column.
    for (const [left, right] of geometry.arrows) {
      expect(geometry.lanes).toContain(left);
      expect(geometry.lanes).toContain(right);
    }
  });

  test('trino tree renders nested nodes plus a legend', async ({ page }) => {
    await page.goto('/reference/trino/');
    const tree = page.locator('.entity-tree');
    await expect(tree).toHaveCount(1);
    // 10 nodes in the decomposition, matching the original graph.
    await expect(tree.locator('li')).toHaveCount(10);
    // Bold marks a node that maps to a SQL table; the mermaid version left
    // that meaning implicit in a purple stroke.
    await expect(tree.locator('li strong')).toHaveCount(3);
    await expect(tree.locator('.entity-tree__legend')).toContainText('own SQL table');
  });

  for (const path of DIAGRAM_PAGES) {
    test(`no mermaid artifacts remain on ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('[class*="mermaid"]')).toHaveCount(0);
      const body = await page.locator('body').innerText();
      expect(body).not.toContain('flowchart TB');
      expect(body).not.toContain('sequenceDiagram');
      expect(body).not.toContain('graph TD');
    });
  }
});
