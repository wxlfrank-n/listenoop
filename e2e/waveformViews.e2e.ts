import {expect, test} from '@playwright/test';

import {
  flipWaveformView,
  seedConfig,
  waitForClips,
  stopPlayback,
} from './helpers';

/**
 * The two waveform views render different trees from the same clip list, and
 * the page-flip control is the only way to move between them.
 */
test.describe('waveform views', () => {
  test.beforeEach(async ({page}) => {
    await seedConfig(page, {});
  });

  test('starts in the row view', async ({page}) => {
    await page.goto('/');
    await waitForClips(page);

    await expect(page.locator('.row-waveform')).toBeVisible();
    await expect(page.locator('.stacked-waveform')).toHaveCount(0);
  });

  test('flips to the stacked view and back', async ({page}) => {
    await page.goto('/');
    await waitForClips(page);

    await flipWaveformView(page);

    await expect(page.locator('.stacked-waveform')).toBeVisible();
    await expect(page.locator('.row-waveform')).toHaveCount(0);

    // Stacked renders one row per clip group.
    await expect(page.locator('.stacked-waveform__row').first()).toBeVisible();

    await flipWaveformView(page);

    await expect(page.locator('.row-waveform')).toBeVisible();
    await expect(page.locator('.stacked-waveform')).toHaveCount(0);
  });

  test('remembers the chosen view across a reload', async ({page}) => {
    await page.goto('/');
    await waitForClips(page);

    await flipWaveformView(page);
    await expect(page.locator('.stacked-waveform')).toBeVisible();

    await page.reload();
    await waitForClips(page);

    await expect(page.locator('.stacked-waveform')).toBeVisible();
  });
});

test('switching from the last visible stacked clip renders the row immediately', async ({
  page,
}) => {
  await seedConfig(page, {waveformView: 'stacked'});
  await page.goto('/');
  await waitForClips(page);
  const index = await page
    .locator('.stacked-waveform .waveform-clip')
    .evaluateAll(clips => {
      const panel = document
        .querySelector('.stacked-waveform')!
        .getBoundingClientRect();
      return clips
        .filter(clip => {
          const box = clip.getBoundingClientRect();
          return (
            box.width > 0 &&
            box.left >= panel.left &&
            box.right <= panel.right &&
            box.top >= panel.top &&
            box.bottom <= panel.bottom
          );
        })
        .at(-1)
        ?.getAttribute('data-clip-idx');
    });
  expect(index).toBeTruthy();
  await page
    .locator(`.stacked-waveform .waveform-clip[data-clip-idx="${index}"]`)
    .first()
    .click();
  await stopPlayback(page);
  await flipWaveformView(page);
  const active = page.locator(
    `.row-waveform .waveform-clip[data-clip-idx="${index}"]`,
  );
  await expect(active).toBeVisible();
  await expect
    .poll(() =>
      active.evaluate(clip => {
        const panel = document
          .querySelector('.row-waveform')!
          .getBoundingClientRect();
        const box = clip.getBoundingClientRect();
        return box.right > panel.left && box.left < panel.right;
      }),
    )
    .toBe(true);
});
