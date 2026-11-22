import { test, expect } from '@playwright/test';

// Every CloudEvent schema composes BaseEvent through `allOf: [{ $ref }]`.
// The generator resolves those refs so inherited fields (id, success, error,
// warnings) are shown, in the interactive viewer and in the static list.
const EVENT_PAGE = '/reference/schemas/processing/calculation-member-join-event/';

test.describe('Generated schema pages', () => {
  test('an event page shows the properties it inherits from BaseEvent', async ({ page }) => {
    await page.goto(EVENT_PAGE);

    const inherited = page.locator('.json-schema-viewer-wrapper .schema-inherited');
    await expect(inherited).toHaveCount(1);
    await expect(inherited.locator('a')).toHaveText('BaseEvent');
    await expect(inherited.locator('a')).toHaveAttribute('href', '/reference/schemas/common/base-event/');
    await expect(inherited.locator('.property-name')).toContainText(['error', 'id', 'success', 'warnings']);

    // The event's own properties are still listed first.
    const own = page.locator('.json-schema-viewer-wrapper > .schema-properties .property-name');
    await expect(own).toContainText(['joinedLegalEntityId', 'tags']);

    // Static markdown list, for readers and the markdown export.
    await expect(page.getByRole('heading', { name: /Inherited from BaseEvent/ })).toHaveCount(1);
  });
});
