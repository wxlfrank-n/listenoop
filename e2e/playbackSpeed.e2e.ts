import {expect, test} from '@playwright/test';
import {hookMedia, playButton, seedConfig, waitForClips} from './helpers';

test('speed presets persist and are locked during normal playback', async ({
  page,
}) => {
  await hookMedia(page);
  await seedConfig(page, {});
  await page.goto('/');
  await waitForClips(page);
  await page.getByRole('button', {name: 'More', exact: true}).click();
  await page.getByRole('menuitem', {name: 'Settings'}).click();
  await page.getByRole('tab', {name: 'Playback', exact: true}).click();
  await page.getByRole('button', {name: '0.75×', exact: true}).click();
  const field = page
    .locator('.settings-field')
    .filter({has: page.locator('input[aria-label="Playback speed"]')});
  expect(await field.locator('.settings-slider-preview').count()).toBe(0);
  await page.locator('.settings-close').click();
  await page.reload();
  await waitForClips(page);
  await playButton(page).click();
  const dial = page.locator('.playback-speed');
  await expect(dial).toHaveAttribute('aria-disabled', 'true');
  await dial.press('ArrowUp');
  await expect(dial).toHaveAttribute('aria-valuenow', '0.75');
  await page.getByRole('button', {name: 'More', exact: true}).click();
  await page.getByRole('menuitem', {name: 'Settings'}).click();
  await page.getByRole('tab', {name: 'Playback', exact: true}).click();
  await expect(field.locator('input')).toBeDisabled();
  await expect(
    page.getByRole('button', {name: '0.5×', exact: true}),
  ).toBeDisabled();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const audio = (window as unknown as {__media: HTMLMediaElement})
          .__media;
        return {speed: audio.playbackRate, pitch: audio.preservesPitch};
      }),
    )
    .toEqual({speed: 0.75, pitch: true});
});

test('paused speed wheel appears left of its button and changes in 0.05 steps', async ({
  page,
}) => {
  await seedConfig(page, {playbackSpeed: 1});
  await page.goto('/');
  await waitForClips(page);
  const dial = page.locator('.playback-speed');
  const box = (await dial.boundingBox())!;
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  const wheel = (await dial.locator('.playback-speed__window').boundingBox())!;
  expect(wheel.x + wheel.width).toBeLessThan(box.x);
  await page.mouse.move(x, y - 16, {steps: 4});
  await page.mouse.up();
  await expect(dial).toHaveAttribute('aria-valuenow', '1.05');
  await dial.press('Home');
  await dial.press('ArrowDown');
  await expect(dial).toHaveAttribute('aria-valuenow', '0.5');
  await dial.press('End');
  await dial.press('ArrowUp');
  await expect(dial).toHaveAttribute('aria-valuenow', '1.5');
});

test('clip playback locks speed and all four skip controls until stopped', async ({
  page,
}) => {
  await seedConfig(page, {repetitions: 20});
  await page.goto('/');
  await waitForClips(page);
  await page.locator('.waveform-clip').nth(1).click();
  await expect(playButton(page)).toHaveAttribute('aria-label', 'Pause');
  const skips = page.locator('.player-controls button:not(.control-btn--play)');
  await expect(skips).toHaveCount(4);
  for (const button of await skips.all()) await expect(button).toBeDisabled();
  await expect(page.locator('.playback-speed')).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await playButton(page).click();
  await expect(page.locator('.playback-speed')).toHaveAttribute(
    'aria-disabled',
    'false',
  );
  await expect(skips.nth(2)).toBeEnabled();
});
