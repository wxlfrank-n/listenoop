import {expect, test} from '@playwright/test';
import {playButton, seedConfig, waitForClips} from './helpers';

for (const viewport of [
  {width: 390, height: 844},
  {width: 320, height: 568},
]) {
  test.describe(`mobile playback at ${viewport.width}px`, () => {
    test.use({viewport, isMobile: true, hasTouch: true});

    test('keeps error actions visible and recovers using touch', async ({
      page,
    }) => {
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
      await playButton(page).tap();
      const alert = page.getByRole('alert');
      await expect(alert).toBeVisible();
      for (const name of ['Retry', 'Next track']) {
        const button = alert.getByRole('button', {name, exact: true});
        await expect(button).toBeInViewport({ratio: 1});
        const box = await button.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(viewport.width);
      await page.screenshot({
        path: `dist/verification-mobile-${viewport.width}-error.png`,
      });
      await alert.getByRole('button', {name: 'Retry', exact: true}).tap();
      await expect(alert).toHaveCount(0);
      await expect(playButton(page)).toHaveClass(/control-btn--playing/);
      await playButton(page).tap();
      await expect(playButton(page)).toHaveClass(/control-btn--paused/);
      await page.screenshot({
        path: `dist/verification-mobile-${viewport.width}-recovered.png`,
      });
    });
  });
}
