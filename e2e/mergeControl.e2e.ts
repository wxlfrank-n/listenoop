import {expect, test} from '@playwright/test';
import {seedConfig, waitForClips} from './helpers';

test('upward swipes on the merge slider and stepper do not click or merge', async ({
  page,
}) => {
  await seedConfig(page, {showAdvancedControls: true, mergeScope: 'global'});
  await page.goto('/');
  await waitForClips(page);
  const slider = page.locator('.clip-merge input');
  const value = await slider.inputValue();
  const count = await page.locator('.waveform-clip').count();
  const swipeUp = async (target: import('@playwright/test').Locator) => {
    const box = (await target.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 2, y - 50, {steps: 10});
    await page.mouse.up();
  };
  await swipeUp(slider);
  await expect(slider).toHaveValue(value);
  await expect(page.locator('.waveform-clip')).toHaveCount(count);
  const stepper = page.locator('.clip-merge button').first();
  await swipeUp(stepper);
  await expect(slider).toHaveValue(value);
  await expect(page.locator('.waveform-clip')).toHaveCount(count);
  await stepper.press('Enter');
  await expect(slider).not.toHaveValue(value);
  await stepper.click();
  await expect(slider).not.toHaveValue(value);
  const beforeDrag = await slider.inputValue();
  const track = (await slider.boundingBox())!;
  await page.mouse.move(track.x + track.width / 2, track.y + track.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width - 1, track.y + track.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  await expect(slider).not.toHaveValue(beforeDrag);
});
