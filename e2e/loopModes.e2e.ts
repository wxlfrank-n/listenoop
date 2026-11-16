import {expect, test} from '@playwright/test';
import {
  hookMedia,
  openClipDetectionTab,
  playButton,
  seedConfig,
  waitForClips,
} from './helpers';

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
  for (const value of ['off', 'track', 'playlist', 'shuffle', 'clips']) {
    await mode.selectOption(value);
    await page.reload();
    await waitForClips(page);
    await openClipDetectionTab(page);
    await page.getByRole('tab', {name: 'Playback', exact: true}).click();
    await expect(mode).toHaveValue(value);
  }
});

for (const waveformView of ['horizontal', 'stacked']) {
  test(`clip tracklist repeats and advances in ${waveformView} view`, async ({
    page,
  }) => {
    await hookMedia(page);
    await seedConfig(page, {loopMode: 'clips', repetitions: 2, waveformView});
    await page.goto('/');
    await waitForClips(page);
    await playButton(page).click();
    const active = page.locator('.waveform-clip--active').first();
    await expect(active).toHaveAttribute('data-clip-idx', '0');
    const end = Number(await active.getAttribute('data-clip-end-sec'));
    const start = Number(await active.getAttribute('data-clip-start-sec'));
    // Drive the real media clock past the first clip's padded end, once per round.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const audio = (window as unknown as {__media: HTMLMediaElement})
            .__media;
          return !audio.paused;
        }),
      )
      .toBe(true);
    await page.waitForTimeout(150);
    await page.evaluate(time => {
      (window as unknown as {__media: HTMLMediaElement}).__media.currentTime =
        time;
    }, end + 0.2);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as {__media: HTMLMediaElement}).__media
              .currentTime,
        ),
      )
      .toBeLessThan(start + 0.3);
    await expect(active).toHaveAttribute('data-clip-idx', '0');
    await page.waitForTimeout(150);
    await page.evaluate(time => {
      (window as unknown as {__media: HTMLMediaElement}).__media.currentTime =
        time;
    }, end + 0.2);
    await expect(active).toHaveAttribute('data-clip-idx', '1');
    await playButton(page).click();
    await expect(playButton(page)).toHaveAttribute('aria-label', 'Play');
  });
}
