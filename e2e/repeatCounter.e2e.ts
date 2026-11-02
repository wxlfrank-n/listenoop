import {expect, test} from '@playwright/test';
import {seedConfig, waitForClips} from './helpers';

test('compact repeat counter decreases left and increases right', async ({
  page,
}) => {
  await seedConfig(page, {
    showAdvancedControls: true,
    mergeScope: 'global',
    repetitions: 3,
  });
  await page.goto('/');
  await waitForClips(page);
  const dial = page.locator('.clip-reps__dial');
  await expect(dial.locator('.clip-reps__value--current')).toHaveCSS(
    'font-size',
    '14px',
  );
  await expect(page.locator('.clip-merge__bubble')).toHaveCSS(
    'font-size',
    '14px',
  );
  const box = (await dial.boundingBox())!;
  expect(box.width).toBeCloseTo(48, 0);
  expect(box.height).toBeCloseTo(30, 0);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  const row = (number: number) =>
    dial
      .locator('.clip-reps__value')
      .filter({hasText: new RegExp(`^${number}$`)});
  await expect(row(2)).toHaveCSS('opacity', '0.4');
  await expect(row(4)).toHaveCSS('opacity', '0.4');
  const wheel = (await dial.locator('.clip-reps__window').boundingBox())!;
  expect(wheel.y + wheel.height).toBeLessThan(box.y);
  expect((await row(2).boundingBox())!.x).toBeLessThan(
    (await row(3).boundingBox())!.x,
  );
  expect((await row(4).boundingBox())!.x).toBeGreaterThan(
    (await row(3).boundingBox())!.x,
  );
  await page.mouse.move(x + 32, y, {steps: 8});
  await page.mouse.up();
  await expect(dial).toHaveAttribute('aria-valuenow', '5');
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 16, y, {steps: 4});
  await page.mouse.up();
  await expect(dial).toHaveAttribute('aria-valuenow', '4');
});
