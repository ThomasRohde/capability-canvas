import { expect, test } from '@playwright/test';

test('loads editor shell and opens export drawer', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.cc-editor-toolbar .cc-brand-mark')).toBeVisible();
  await expect(page.getByText('Outline')).toBeVisible();
  await expect(page.getByTestId('canvas')).toBeVisible();
  await page.getByRole('button', { name: /export/i }).first().click();
  await expect(page.getByRole('complementary', { name: 'Export' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export file' })).toBeVisible();
});

test('keeps compact editor toolbar single-row and exposes grouped menus', async ({ page }) => {
  for (const viewport of [
    { width: 1366, height: 800 },
    { width: 960, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const toolbar = page.locator('.cc-editor-toolbar');
    await expect(toolbar).toBeVisible();

    for (const name of [
      'Add root',
      'Add child',
      'Model actions',
      'View options',
      'Fit',
      'Auto layout',
      'Import',
      'Export',
    ]) {
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    }

    const metrics = await toolbar.evaluate((element) => ({
      clientWidth: element.clientWidth,
      height: element.getBoundingClientRect().height,
      scrollWidth: element.scrollWidth,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
    expect(metrics.height).toBeLessThanOrEqual(54);

    await page.getByTestId('canvas').getByText('Digital Onboarding').click();
    await page.getByRole('button', { name: 'Model actions', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem', { name: 'Duplicate' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Copy BCM prompt' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Duplicate' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    expect(await page.evaluate(() => document.activeElement?.textContent?.trim())).toContain(
      'Remove from active view',
    );
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'View options', exact: true }).click();
    await expect(page.getByRole('menuitemcheckbox', { name: 'Heatmap' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: 'Import JSON file' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Import pasted JSON' })).toBeVisible();
  }
});

test('renames a canvas label inline and undoes the rename', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const canvas = page.getByTestId('canvas');

  await canvas.getByText('Digital Onboarding').dblclick();
  const input = page.getByRole('textbox', { name: 'Edit label for Digital Onboarding' });
  await expect(input).toBeFocused();
  await input.fill('Online Origination');
  await input.press('Enter');

  await expect(canvas.getByText('Online Origination')).toBeVisible();
  await page.keyboard.press('Control+Z');
  await expect(canvas.getByText('Digital Onboarding')).toBeVisible();
});

test('cancels a canvas inline label edit with Escape', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const canvas = page.getByTestId('canvas');

  await canvas.getByText('Digital Onboarding').dblclick();
  const input = page.getByRole('textbox', { name: 'Edit label for Digital Onboarding' });
  await input.fill('Canceled label');
  await input.press('Escape');

  await expect(input).toHaveCount(0);
  await expect(canvas.getByText('Digital Onboarding')).toBeVisible();
  await expect(canvas.getByText('Canceled label')).toHaveCount(0);
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

test('separates active view remove from source-model delete', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const serializedContains = (nodeId: string) =>
    page.evaluate((id) => {
      const doc = (
        window as Window & {
          __ccTestSerializeDocument?: () => { nodes?: Array<{ id?: string }> };
        }
      ).__ccTestSerializeDocument?.();
      return doc?.nodes?.some((node) => node.id === id) ?? false;
    }, nodeId);

  const canvas = page.getByTestId('canvas');
  await canvas.getByText('Digital Onboarding').click();
  await page.keyboard.press('Delete');

  await expect(canvas.getByText('Digital Onboarding')).toHaveCount(0);
  await expect(page.locator('.cc-outline').getByText('Digital Onboarding')).toBeVisible();
  expect(await serializedContains('digital-onboarding')).toBe(true);

  await page.keyboard.press('Shift+Delete');
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Delete "Digital Onboarding" from the source model');
  await dialog.getByRole('button', { name: 'Delete from model' }).click();

  await expect(page.locator('.cc-outline').getByText('Digital Onboarding')).toHaveCount(0);
  expect(await serializedContains('digital-onboarding')).toBe(false);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.cc-outline').getByText('Digital Onboarding')).toBeVisible();
  expect(await serializedContains('digital-onboarding')).toBe(true);
});

test('outline search finds, restores and expands active view results', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const outline = page.locator('.cc-outline');
  const canvas = page.getByTestId('canvas');
  const search = page.getByPlaceholder('Search outline');

  await search.fill('open accounts');
  await expect(outline).toContainText('Digital Onboarding');
  await expect(outline).toContainText('Retail Banking > Customer > Channels > Digital');
  await search.press('Enter');
  await expect(outline.locator('.cc-tree-row.active').filter({ hasText: 'Digital Onboarding' })).toBeVisible();

  await canvas.getByText('Digital Onboarding').click();
  await page.keyboard.press('Delete');
  await expect(canvas.getByText('Digital Onboarding')).toHaveCount(0);

  await search.fill('Digital Onboarding');
  await expect(page.getByTitle('Hidden in active view')).toBeVisible();
  await page.getByRole('button', { name: 'Add Digital Onboarding to active view' }).click();
  await expect(canvas.getByText('Digital Onboarding')).toBeVisible();

  await search.fill('');
  await page.getByRole('button', { name: 'Actions for Digital', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Collapse in view' }).click();
  await expect(canvas.getByText('Digital Onboarding')).toHaveCount(0);

  await search.fill('Digital Onboarding');
  await page
    .getByRole('button', { name: 'Expand Digital in active view to show Digital Onboarding' })
    .click();
  await expect(canvas.getByText('Digital Onboarding')).toBeVisible();
});

test('bulk-selects sibling leaves, aligns, undoes and redoes', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const canvas = page.getByTestId('canvas');
  const nodeX = (nodeId: string) =>
    page
      .locator(`.cc-node:has-text("${nodeIdToLabel(nodeId)}")`)
      .first()
      .evaluate((element) => Number((element as HTMLElement).style.left.replace('px', '')));

  await canvas.getByText('Credit Risk').click();
  await canvas.getByText('Fraud Risk').click({ modifiers: ['Shift'] });
  await canvas.getByText('Operational Risk').click({ modifiers: ['Shift'] });
  await expect(page.locator('.cc-bulk-toolbar')).toContainText('3 selected');
  await expect(page.locator('.cc-bulk-toolbar')).toContainText('Reference: Credit Risk');

  const before = await Promise.all([
    nodeX('credit-risk'),
    nodeX('fraud-risk'),
    nodeX('operational-risk'),
  ]);
  await page.getByRole('button', { name: 'Align left' }).click();
  const aligned = await Promise.all([
    nodeX('credit-risk'),
    nodeX('fraud-risk'),
    nodeX('operational-risk'),
  ]);
  expect(new Set(aligned).size).toBe(1);

  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await Promise.all([
    nodeX('credit-risk'),
    nodeX('fraud-risk'),
    nodeX('operational-risk'),
  ])).toEqual(before);

  await page.getByRole('button', { name: 'Redo' }).click();
  expect(new Set(await Promise.all([
    nodeX('credit-risk'),
    nodeX('fraud-risk'),
    nodeX('operational-risk'),
  ])).size).toBe(1);
});

function nodeIdToLabel(nodeId: string) {
  return {
    'credit-risk': 'Credit Risk',
    'fraud-risk': 'Fraud Risk',
    'operational-risk': 'Operational Risk',
  }[nodeId]!;
}

test('Ctrl+A expands from selected risk child to risk siblings', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const canvas = page.getByTestId('canvas');

  await canvas.getByText('Credit Risk').click();
  await page.keyboard.press('Control+A');

  await expect(page.locator('.cc-bulk-toolbar')).toContainText('3 selected');
  await expect(page.locator('.cc-bulk-toolbar')).toContainText('Reference: Credit Risk');
  await expect(canvas.locator('.cc-node.multi-selected').filter({ hasText: 'Credit Risk' })).toHaveCount(1);
  await expect(canvas.locator('.cc-node.multi-selected').filter({ hasText: 'Fraud Risk' })).toHaveCount(1);
  await expect(canvas.locator('.cc-node.multi-selected').filter({ hasText: 'Operational Risk' })).toHaveCount(1);
  await expect(canvas.locator('.cc-node.multi-selected').filter({ hasText: 'Process Management' })).toHaveCount(0);
});

test('invalid mixed-parent multi-select shows selection feedback', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const canvas = page.getByTestId('canvas');

  await canvas.getByText('Credit Risk').click();
  await canvas.getByText('Process Management').click({ modifiers: ['Shift'] });

  await expect(page.getByText('Bulk operations require sibling capabilities.')).toBeVisible();
  await expect(page.locator('.cc-bulk-toolbar')).toHaveCount(0);
});

test('marquee selection preview is transient', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
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
  const box = await page.getByTestId('canvas').boundingBox();
  expect(box).not.toBeNull();

  await page.keyboard.down('Shift');
  await page.mouse.move(box!.x + 6, box!.y + 6);
  await page.mouse.down();
  await page.mouse.move(box!.x + 460, box!.y + 360);

  await expect(page.locator('.cc-marquee-count')).toBeVisible();
  expect(await serialize()).toBe(before);

  await page.mouse.up();
  await page.keyboard.up('Shift');
});
