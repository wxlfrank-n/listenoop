import {expect, test} from '@playwright/test';
import {seedConfig} from './helpers';

test('settings aligns bounds with the slider and keeps the value on its thumb', async ({
  page,
}) => {
  await page.setViewportSize({width: 375, height: 812});
  await seedConfig(page, {});
  await page.goto('/');
  await page.getByRole('button', {name: 'More', exact: true}).click();
  await page.getByRole('menuitem', {name: 'Settings'}).click();
  await page.getByRole('tab', {name: 'Playback', exact: true}).click();
  const panel = (await page.locator('.settings-panel').boundingBox())!;
  expect(panel.width).toBeCloseTo(351, 0);
  expect(panel.y).toBeGreaterThanOrEqual(12);
  expect(panel.y + panel.height).toBeLessThanOrEqual(800);
  const field = page
    .locator('.settings-field')
    .filter({has: page.locator('input[aria-label="Playback speed"]')});
  const slider = field.locator('input');
  const bounds = field.locator('.settings-range-bound');
  const center = (box: {y: number; height: number}) => box.y + box.height / 2;
  const track = (await slider.boundingBox())!;
  for (let i = 0; i < 2; i++) {
    expect(
      Math.abs(center((await bounds.nth(i).boundingBox())!) - center(track)),
    ).toBeLessThan(1);
  }
  for (const [key, value] of [
    ['Home', '0.5'],
    ['ArrowRight', '0.55'],
    ['End', '1.5'],
  ] as const) {
    await slider.press(key);
    await expect(slider).toHaveValue(value);
    await expect(field.locator('.settings-slider-value')).toHaveText(
      `${value}×`,
    );
    const thumb = (await field
      .locator('.settings-slider-value')
      .boundingBox())!;
    expect(thumb.x).toBeGreaterThanOrEqual(track.x);
    expect(thumb.x + thumb.width).toBeLessThanOrEqual(track.x + track.width);
    expect(Math.abs(center(thumb) - center(track))).toBeLessThan(1);
  }
  await page.screenshot({path: 'test-results/settings-sliders.png'});
});

test('settings uses the wider panel on desktop', async ({page}) => {
  await page.setViewportSize({width: 1024, height: 768});
  await seedConfig(page, {});
  await page.goto('/');
  await page.getByRole('button', {name: 'More', exact: true}).click();
  await page.getByRole('menuitem', {name: 'Settings'}).click();
  const panel = (await page.locator('.settings-panel').boundingBox())!;
  expect(panel.width).toBeCloseTo(560, 0);
  expect(panel.y).toBeGreaterThanOrEqual(12);
  expect(panel.y + panel.height).toBeLessThanOrEqual(756);
});

test('extra value appears only for thumb dragging and disappears on release or cancellation', async ({
  page,
}) => {
  await seedConfig(page, {});
  await page.goto('/');
  await page.getByRole('button', {name: 'More', exact: true}).click();
  await page.getByRole('menuitem', {name: 'Settings'}).click();
  await page.getByRole('tab', {name: 'Playback', exact: true}).click();
  const field = page
    .locator('.settings-field')
    .filter({has: page.locator('input[aria-label="Playback speed"]')});
  const input = field.locator('input');
  const preview = field.locator('.settings-slider-preview');
  await page.getByRole('button', {name: '0.75×', exact: true}).click();
  expect(await preview.count()).toBe(0);
  await input.press('End');
  expect(await preview.count()).toBe(0);
  const track = (await input.boundingBox())!;
  const x = track.x + track.width - 32,
    y = track.y + track.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  expect(await preview.count()).toBe(0);
  await page.mouse.move(x - 16, y, {steps: 4});
  await expect(preview).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(preview).toBeVisible();
  const readout = (await preview.boundingBox())!;
  const thumb = (await field.locator('.settings-slider-value').boundingBox())!;
  expect(
    Math.abs(readout.x + readout.width / 2 - thumb.x - thumb.width / 2),
  ).toBeLessThan(1);
  await page.mouse.up();
  expect(await preview.count()).toBe(0);
  await input.press('End');
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 16, y, {steps: 4});
  await expect(preview).toBeVisible();
  await input.dispatchEvent('pointercancel');
  expect(await preview.count()).toBe(0);
  await page.mouse.up();
});
