import {expect, test} from '@playwright/test';
import {openClipDetectionTab, seedConfig, waitForClips} from './helpers';

test('all loop modes can be selected and survive a reload on a narrow screen', async ({
  page,
}) => {
  await page.setViewportSize({width: 375, height: 812});
  await seedConfig(page, {loopPlaylist: true});
  await page.goto('/');
  await waitForClips(page);
  await openClipDetectionTab(page);
  await page.getByRole('tab', {name: 'Playback', exact: true}).click();
  const mode = page.getByRole('combobox', {name: 'Loop mode'});
  await expect(mode).toHaveValue('playlist');
  for (const value of ['off', 'track', 'playlist', 'shuffle']) {
    await mode.selectOption(value);
    await page.reload();
    await waitForClips(page);
    await openClipDetectionTab(page);
    await page.getByRole('tab', {name: 'Playback', exact: true}).click();
    await expect(mode).toHaveValue(value);
  }
});
