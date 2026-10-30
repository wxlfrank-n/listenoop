import {expect, test} from '@playwright/test';

import {
  activateClip,
  clipBounds,
  clipCount,
  hookMedia,
  mediaDuration,
  mediaTime,
  playAndAdvance,
  playButton,
  seedConfig,
  swipeClip,
  waitForClips,
} from './helpers';

/** Revealed portion of the played-progress overlay, as a 0-100 percentage. */
async function playedPercent(page: import('@playwright/test').Page) {
  const clipPath = await page
    .locator('.row-waveform__played')
    .evaluate(el => (el as HTMLElement).style.clipPath);

  // "inset(0px 96.2329% 0px 0px)" -> 96.2329
  const match = /inset\(0(?:px)?\s+([\d.]+)%/.exec(clipPath);

  return match ? Number(match[1]) : null;
}

test.describe('playing audio', () => {
  test.beforeEach(async ({page}) => {
    await hookMedia(page);
    await seedConfig(page, {});
  });

  test('plays the track and advances the audio clock', async ({page}) => {
    await page.goto('/');
    await waitForClips(page);

    // Nothing has been played yet, so there is no media element at all.
    expect(await mediaTime(page)).toBeNull();

    const time = await playAndAdvance(page);

    expect(time).toBeGreaterThan(0);

    const duration = await mediaDuration(page);
    expect(duration).toBeGreaterThan(0);
    expect(time!).toBeLessThan(duration!);

    await expect(playButton(page)).toHaveClass(/control-btn--playing/);
  });

  test('reveals the played portion of the waveform while playing', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForClips(page);

    const before = await playedPercent(page);
    expect(before).not.toBeNull();

    await playAndAdvance(page, 1500);

    const after = await playedPercent(page);

    // The overlay starts fully clipped and uncovers as the track plays.
    expect(after!).toBeLessThan(before!);
    expect(after!).toBeGreaterThanOrEqual(0);
  });

  test('pause halts the audio clock', async ({page}) => {
    await page.goto('/');
    await waitForClips(page);

    await playAndAdvance(page);

    await playButton(page).click();
    await expect(playButton(page)).toHaveAttribute('aria-label', 'Play');
    await expect(playButton(page)).toHaveClass(/control-btn--paused/);

    const paused = (await mediaTime(page))!;

    await page.waitForTimeout(1500);

    // Allow a little slack for the event that landed right after the click.
    expect((await mediaTime(page))!).toBeLessThan(paused + 0.25);
  });

  test('resumes from where it was paused', async ({page}) => {
    await page.goto('/');
    await waitForClips(page);

    await playAndAdvance(page);

    await playButton(page).click();
    await expect(playButton(page)).toHaveAttribute('aria-label', 'Play');

    const paused = (await mediaTime(page))!;

    await playAndAdvance(page);

    expect((await mediaTime(page))!).toBeGreaterThan(paused);
  });

  test('skip to end jumps to the end and pauses', async ({page}) => {
    await page.goto('/');
    await waitForClips(page);

    // Start playing and advance partway.
    await playAndAdvance(page);

    const before = await mediaTime(page);
    const duration = await mediaDuration(page);
    expect(duration).toBeGreaterThan(0);
    expect(before).toBeLessThan(duration! - 0.5);

    // Skip to end.
    await page.getByRole('button', {name: 'Go to end'}).click();

    // Should be very close to the end and paused.
    await expect(playButton(page)).toHaveAttribute('aria-label', 'Play');
    const atEnd = await mediaTime(page);
    expect(atEnd).toBeGreaterThanOrEqual(duration! - 0.1);
  });

  test('skip to start jumps to the start and pauses', async ({page}) => {
    await page.goto('/');
    await waitForClips(page);

    // Start playing and advance partway.
    await playAndAdvance(page);

    const before = await mediaTime(page);
    expect(before).toBeGreaterThan(0.5);

    // Skip to start.
    await page.getByRole('button', {name: 'Go to start'}).click();

    // Should be at or near the start and paused.
    await expect(playButton(page)).toHaveAttribute('aria-label', 'Play');
    const atStart = await mediaTime(page);
    expect(atStart).toBeLessThanOrEqual(0.05);
  });

  test('skip to end twice loads the next track paused at its start', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForClips(page);

    // Play partway then skip to end (parks and pauses).
    await playAndAdvance(page);
    const duration = await mediaDuration(page);
    await page.getByRole('button', {name: 'Go to end'}).click();
    await expect(playButton(page)).toHaveAttribute('aria-label', 'Play');
    expect((await mediaTime(page))!).toBeGreaterThanOrEqual(duration! - 0.1);

    // Second press should advance to the next track.
    await page.getByRole('button', {name: 'Go to end'}).click();
    // Adjacent-track navigation deliberately leaves playback paused.
    await expect(playButton(page)).toHaveAttribute('aria-label', 'Play');
    await expect.poll(() => mediaTime(page)).toBeLessThanOrEqual(0.05);
  });

  test('skip to start twice loads the previous track paused at its end', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForClips(page);

    // Advance partway then skip to start (parks and pauses).
    await playAndAdvance(page);
    expect((await mediaTime(page))!).toBeGreaterThan(0.5);
    await page.getByRole('button', {name: 'Go to start'}).click();
    await expect(playButton(page)).toHaveAttribute('aria-label', 'Play');
    expect((await mediaTime(page))!).toBeLessThanOrEqual(0.05);

    // Second press should go to the previous track.
    await page.getByRole('button', {name: 'Go to start'}).click();
    await expect(playButton(page)).toHaveAttribute('aria-label', 'Play');
    await expect
      .poll(async () => {
        const time = await mediaTime(page);
        const duration = await mediaDuration(page);
        return Math.abs((duration ?? 0) - (time ?? 0));
      })
      .toBeLessThanOrEqual(0.05);
  });
});

test.describe('clip playback', () => {
  test.beforeEach(async ({page}) => {
    await hookMedia(page);
  });

  test('clicking a clip plays that clip only', async ({page}) => {
    await seedConfig(page, {});
    await page.goto('/');
    await waitForClips(page);

    const index = 1;
    const bounds = await clipBounds(page, index);
    expect(bounds).not.toBeNull();

    await page.locator('.waveform-clip').nth(index).click();

    // The clip becomes active and starts playing in one gesture.
    await expect(page.locator('.stacked-clip-label--active')).toHaveCount(1);
    await expect(playButton(page)).toHaveAttribute('aria-label', 'Pause');

    await expect
      .poll(async () => (await mediaTime(page)) ?? -1, {timeout: 10_000})
      .toBeGreaterThanOrEqual(bounds!.start - 0.1);

    // The clock stays inside the clicked clip's range.
    expect((await mediaTime(page))!).toBeLessThanOrEqual(bounds!.end + 0.5);
  });

  test('clicking the active clip again stops it', async ({page}) => {
    await seedConfig(page, {});
    await page.goto('/');
    await waitForClips(page);

    await page.locator('.waveform-clip').nth(1).click();
    await expect(playButton(page)).toHaveAttribute('aria-label', 'Pause');

    await page.locator('.waveform-clip').nth(1).click();

    await expect(playButton(page)).toHaveAttribute('aria-label', 'Play');

    const stopped = (await mediaTime(page))!;

    await page.waitForTimeout(1200);

    expect((await mediaTime(page))!).toBeLessThanOrEqual(stopped + 0.25);
  });

  test('stopping playback leaves the clicked clip active', async ({page}) => {
    await seedConfig(page, {});
    await page.goto('/');
    await waitForClips(page);

    const index = 1;
    const before = await clipCount(page);

    await activateClip(page, index);

    // Stopping leaves the clip active, highlighted by its label.
    await expect(page.locator('.stacked-clip-label--active')).toHaveCount(1);

    expect(await clipCount(page)).toBe(before);
  });

  test('clip gestures still edit the track while a clip is playing', async ({
    page,
  }) => {
    await seedConfig(page, {showAdvancedControls: true, mergeScope: 'global'});
    await page.goto('/');
    await waitForClips(page);

    // The merge bubble reports the whole-track clip count, which stays put no
    // matter which clips the row view has scrolled into view.
    const bubble = page.locator('.clip-merge__bubble');
    const before = ((await bubble.textContent()) ?? '').trim();

    await page.locator('.waveform-clip').nth(1).click();
    await expect(playButton(page)).toHaveAttribute('aria-label', 'Pause');

    // Gestures are no longer swallowed just because a clip owns playback: the
    // merge is applied and the reported clip count changes.
    await swipeClip(page, 1, 'down');

    await expect(bubble).not.toHaveText(before);
  });
});
