import {expect, test} from '@playwright/test';
import {playButton, seedConfig, waitForClips} from './helpers';

test('recovers from a failed play request using Retry', async ({page}) => {
  await seedConfig(page, {});
  await page.addInitScript(() => {
    const original = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      HTMLMediaElement.prototype.play = original;
      return Promise.reject(
        new DOMException('Playback failed', 'NotSupportedError'),
      );
    };
  });
  await page.goto('/');
  await waitForClips(page);
  await playButton(page).click();
  await expect(page.getByRole('alert')).toContainText(
    'This track could not play',
  );
  await expect(
    page.getByRole('button', {name: 'Next track', exact: true}),
  ).toBeVisible();
  await page.getByRole('button', {name: 'Retry', exact: true}).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(playButton(page)).toHaveClass(/control-btn--playing/);
});
