import { expect, test } from '@playwright/test';

test('loads editor shell and opens export drawer', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Capability Canvas')).toBeVisible();
  await expect(page.getByText('Outline')).toBeVisible();
  await expect(page.getByTestId('canvas')).toBeVisible();
  await page.getByRole('button', { name: /export/i }).first().click();
  await expect(page.getByRole('complementary', { name: 'Export' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export file' })).toBeVisible();
});

test('supports panel rail, padding controls and outline actions', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await page.getByRole('button', { name: 'Collapse outline' }).click();
  await expect(page.getByText('Outline')).toHaveCount(0);
  await page.getByRole('button', { name: 'Toggle outline' }).click();
  await expect(page.getByText('Outline')).toBeVisible();

  await page.getByRole('button', { name: 'Collapse inspector' }).click();
  await expect(page.locator('.cc-inspector')).toHaveCount(0);
  await page.getByRole('button', { name: 'Toggle inspector' }).click();
  await expect(page.locator('.cc-inspector')).toHaveCount(1);

  await page.getByRole('button', { name: 'Open settings' }).click();
  await expect(page.getByRole('complementary', { name: 'Settings' })).toBeVisible();
  await page.getByLabel('Top', { exact: true }).fill('48');
  await page.getByRole('button', { name: 'Apply auto layout' }).click();
  await expect(page.getByLabel('Top', { exact: true })).toHaveValue('48');

  await page.getByRole('button', { name: 'Open export' }).click();
  await expect(page.getByRole('complementary', { name: 'Export' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Settings' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Actions for Customer', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Add child' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Duplicate' })).toBeVisible();
});

test('loads viewer route read-only', async ({ page }) => {
  await page.goto('/viewer', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Capability Canvas Viewer')).toBeVisible();
  await expect(page.getByText('Read-only').first()).toBeVisible();
  await expect(page.getByTestId('canvas')).toBeVisible();
});

test('viewer presentation controls do not mutate the serialized document', async ({ page }) => {
  await page.goto('/viewer', { waitUntil: 'domcontentloaded' });
  const serialize = () =>
    page.evaluate(() =>
      JSON.stringify(
        (
          window as Window & {
            __ccTestSerializeDocument?: () => unknown;
          }
        ).__ccTestSerializeDocument?.(),
      ),
    );

  const before = await serialize();
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  expect(await serialize()).toBe(before);
  await page.getByRole('button', { name: 'Heatmap' }).click();
  expect(await serialize()).toBe(before);
});
