import { expect, test } from '@playwright/test';

test.setTimeout(60_000);

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
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible({
        timeout: 15000,
      });
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

test('runs common actions from the command palette', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await page.getByRole('button', { name: 'Open command palette' }).click();
  let palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  await palette.getByLabel('Search commands').fill('Add child');
  await expect(palette.getByText('Select a capability first.')).toBeVisible();
  await page.keyboard.press('Escape');

  const canvas = page.getByTestId('canvas');
  await canvas.getByText('Digital Onboarding').click();

  await page.getByRole('button', { name: 'Open command palette' }).click();
  palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByLabel('Search commands').fill('Add child');
  await page.keyboard.press('Enter');
  await expect(canvas.getByText('New capability')).toBeVisible();

  await page.getByRole('button', { name: 'Open command palette' }).click();
  palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByLabel('Search commands').fill('Fit view');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Open command palette' }).click();
  palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByLabel('Search commands').fill('Export');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary', { name: 'Export' })).toBeVisible();
});

test('traps command palette focus for keyboard users', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const trigger = page.getByRole('button', { name: 'Open command palette' });
  await trigger.focus();
  await page.keyboard.press('Enter');

  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  await expect(palette.getByLabel('Search commands')).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  await expect(palette.getByRole('button', { name: 'Close command palette' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(palette.getByLabel('Search commands')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('supports a keyboard-only create rename restore and export smoke flow', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await page.getByRole('button', { name: 'Add root', exact: true }).focus();
  await page.keyboard.press('Enter');

  const canvas = page.getByTestId('canvas');
  let node = canvas.getByRole('button', { name: /New capability, leaf capability/ }).first();
  await node.focus();
  await page.keyboard.press('Space');
  node = canvas.getByRole('button', {
    name: /New capability, leaf capability, selected/,
  }).first();
  await expect(node).toBeFocused();

  await page.keyboard.press('Enter');
  const labelEditor = page.getByRole('textbox', {
    name: 'Edit label for New capability',
  });
  await expect(labelEditor).toBeFocused();
  await page.keyboard.type('Keyboard Root');
  await page.keyboard.press('Enter');

  node = canvas.getByRole('button', {
    name: /Keyboard Root, leaf capability, selected/,
  }).first();
  await expect(node).toBeFocused();

  await page.keyboard.press('Delete');
  await expect(canvas.getByRole('button', { name: /Keyboard Root/ })).toHaveCount(0);

  await page.keyboard.press('Control+Z');
  await expect(canvas.getByRole('button', { name: /Keyboard Root/ })).toBeVisible();

  await page.keyboard.press('Control+K');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByLabel('Search commands').fill('Export');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary', { name: 'Export' })).toBeVisible();
});

test('cancels pasted import review without replacing the document', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const before = await page.evaluate(() => {
    const testWindow = window as unknown as {
      __ccTestSerializeDocument?: () => { title?: string; nodes: unknown[] };
    };
    const doc = testWindow.__ccTestSerializeDocument?.();
    if (!doc) throw new Error('Missing test document serializer.');
    return { title: doc.title, nodeCount: doc.nodes.length };
  });
  const payload = await page.evaluate(() => {
    const testWindow = window as unknown as {
      __ccTestSerializeDocument?: () => { title?: string; nodes: unknown[] };
    };
    const doc = testWindow.__ccTestSerializeDocument?.();
    if (!doc) throw new Error('Missing test document serializer.');
    doc.title = 'Canceled e2e import';
    return JSON.stringify(doc);
  });

  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Import pasted JSON' }).click();
  const pasteDialog = page.getByRole('dialog', { name: 'Import pasted JSON' });
  await pasteDialog.getByRole('textbox').fill(payload);
  await pasteDialog.getByRole('button', { name: 'Import', exact: true }).click();

  const review = page.getByRole('dialog', { name: 'Review import' });
  await expect(review).toBeVisible();
  await review.getByRole('button', { name: 'Cancel' }).click();

  const after = await page.evaluate(() => {
    const testWindow = window as unknown as {
      __ccTestSerializeDocument?: () => { title?: string; nodes: unknown[] };
    };
    const doc = testWindow.__ccTestSerializeDocument?.();
    if (!doc) throw new Error('Missing test document serializer.');
    return { title: doc.title, nodeCount: doc.nodes.length };
  });
  expect(after).toEqual(before);
});

test('applies repairable pasted import and surfaces diagnostics', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const payload = await page.evaluate(() => {
    const testWindow = window as unknown as {
      __ccTestSerializeDocument?: () => {
        title?: string;
        nodes: Array<Record<string, unknown>>;
      };
    };
    const doc = testWindow.__ccTestSerializeDocument?.();
    if (!doc) throw new Error('Missing test document serializer.');
    const duplicateSource = doc.nodes.find((node) => node.id === 'digital-servicing');
    if (!duplicateSource) throw new Error('Missing duplicate source node.');
    doc.title = 'Repairable e2e import';
    doc.nodes.push({
      ...duplicateSource,
      id: 'digital-onboarding',
      label: 'Duplicate onboarding',
    });
    return JSON.stringify(doc);
  });

  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Import pasted JSON' }).click();
  const pasteDialog = page.getByRole('dialog', { name: 'Import pasted JSON' });
  await pasteDialog.getByRole('textbox').fill(payload);
  await pasteDialog.getByRole('button', { name: 'Import', exact: true }).click();

  const review = page.getByRole('dialog', { name: 'Review import' });
  await expect(review.getByText('duplicate-id-repaired')).toBeVisible();
  await review.getByRole('button', { name: 'Apply import' }).click();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const testWindow = window as unknown as {
          __ccTestSerializeDocument?: () => { title?: string };
        };
        return testWindow.__ccTestSerializeDocument?.().title;
      }),
    )
    .toBe('Repairable e2e import');

  await page.getByRole('button', { name: 'Diagnostics' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Diagnostics' }).getByText('duplicate-id-repaired'),
  ).toBeVisible();
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
  await page.getByRole('button', { name: 'Close settings' }).click();
  await expect(page.getByRole('complementary', { name: 'Settings' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open settings' }).click();
  const topPadding = page.getByLabel('Top', { exact: true });
  const previousTopPadding = await topPadding.inputValue();
  await topPadding.fill('48');
  await topPadding.press('Enter');
  await expect(topPadding).toHaveValue('48');
  await expect(page.getByRole('button', { name: 'Apply auto layout' })).toBeEnabled();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(topPadding).toHaveValue(previousTopPadding);

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

test('creates, renames, duplicates, resets, deletes and persists visual views', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const sourceNodeIds = () =>
    page.evaluate(() =>
      (
        (
          window as Window & {
            __ccTestSerializeDocument?: () => { nodes?: Array<{ id?: string }> };
          }
        ).__ccTestSerializeDocument?.().nodes ?? []
      )
        .map((node) => node.id)
        .sort(),
    );
  const beforeNodeIds = await sourceNodeIds();

  await page.getByRole('button', { name: 'Open views' }).click();
  await page.getByLabel('New view name').fill('Stakeholder map');
  await page.getByRole('button', { name: 'Create and switch' }).click();
  await expect(page.getByRole('button', { name: 'Open active view' })).toContainText(
    'Stakeholder map',
  );

  const nameInput = page.getByLabel('Name for Stakeholder map');
  await nameInput.fill('Executive map');
  await nameInput.blur();
  await expect(page.getByRole('button', { name: 'Open active view' })).toContainText(
    'Executive map',
  );

  await page
    .getByRole('button', { name: 'Duplicate visual state for Executive map', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Open active view' })).toContainText(
    'Executive map copy',
  );

  await page.getByRole('button', { name: 'View actions for Executive map copy' }).click();
  await page.getByRole('menuitem', { name: 'Set as default' }).click();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('complementary', { name: 'Views' })).toHaveCount(0);
  const canvas = page.getByTestId('canvas');
  await canvas.getByText('Digital Onboarding').click();
  await page.keyboard.press('Delete');
  await expect(canvas.getByText('Digital Onboarding')).toHaveCount(0);
  expect(await sourceNodeIds()).toEqual(beforeNodeIds);

  await page.getByRole('button', { name: 'Open views' }).click();
  await page.getByRole('button', { name: 'View actions for Executive map copy' }).click();
  await page.getByRole('menuitem', { name: 'Reset visibility/collapse' }).click();
  await page.getByRole('alertdialog', { name: 'Reset visibility and collapse' })
    .getByRole('button', { name: 'Reset visibility' })
    .click();
  await expect(canvas.getByText('Digital Onboarding')).toBeVisible();

  await page
    .getByRole('button', { name: 'View actions for Executive map', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Delete view' }).click();
  await expect(page.getByRole('alertdialog', { name: 'Delete view' })).toContainText(
    'source model and capabilities are not deleted',
  );
  await page.getByRole('alertdialog', { name: 'Delete view' })
    .getByRole('button', { name: 'Delete view' })
    .click();
  await expect(page.getByLabel('Name for Executive map', { exact: true })).toHaveCount(0);
  expect(await sourceNodeIds()).toEqual(beforeNodeIds);

  await expect(page.getByText('Saved locally just now')).toBeVisible({ timeout: 5000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Open active view' })).toContainText(
    'Executive map copy',
  );
});

test('views drawer remains readable on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 720 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Open views' }).click();
  await expect(page.getByRole('complementary', { name: 'Views' })).toBeVisible();
  await page.getByLabel('New view name').fill('Narrow menu check');
  await page.getByRole('button', { name: 'Create and switch' }).click();

  const metrics = await page.getByRole('complementary', { name: 'Views' }).evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);

  const listMetrics = await page.locator('.cc-view-list').evaluate((element) => {
    const listRect = element.getBoundingClientRect();
    const drawerRect = document
      .querySelector('.cc-views-drawer')
      ?.getBoundingClientRect();
    return {
      drawerBottom: drawerRect?.bottom ?? 0,
      listBottom: listRect.bottom,
      listHeight: listRect.height,
    };
  });
  expect(listMetrics.listHeight).toBeGreaterThan(0);
  expect(listMetrics.drawerBottom - listMetrics.listBottom).toBeLessThanOrEqual(30);

  await page.getByRole('button', { name: 'View actions for Narrow menu check' }).click();
  const menu = page.getByRole('menu', { name: 'Actions for Narrow menu check' });
  await expect(menu.getByRole('menuitem', { name: 'Delete view' })).toBeVisible();

  const menuBox = await menu.boundingBox();
  const viewport = page.viewportSize();
  expect(menuBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(menuBox?.y).toBeGreaterThanOrEqual(0);
  expect((menuBox?.y ?? 0) + (menuBox?.height ?? 0)).toBeLessThanOrEqual(
    (viewport?.height ?? 0) + 1,
  );
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
