import {expect, test} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {
  hookMedia,
  mediaTime,
  playButton,
  seedConfig,
  waitForClips,
} from './helpers';

test('named playlists restore the selected imported track and playback position', async ({
  page,
}) => {
  await hookMedia(page);
  await seedConfig(page, {});
  await page.goto('/');

  async function openPlaylist() {
    await page.getByRole('button', {name: 'More', exact: true}).click();
    await page.getByRole('menuitem', {name: 'Playlist', exact: true}).click();
  }
  const picker = page.getByRole('textbox', {name: 'Find or name a playlist'});
  const panel = page.getByRole('dialog');
  async function create(name: string) {
    await picker.fill(name);
    await panel.getByRole('button', {name: 'New playlist'}).click();
    await expect(picker).toHaveValue(name);
    await expect(panel.getByText('No tracks yet')).toBeVisible();
  }

  await openPlaylist();
  const defaultTrack = await panel
    .locator('.track-item__title')
    .first()
    .innerText();
  await create('Listening practice');
  const recording = await readFile('public/music/01A.mp3');
  await panel.locator('input[type=file]:not([webkitdirectory])').setInputFiles(
    ['First recording', 'Practice recording'].map(name => ({
      name: `${name}.mp3`,
      mimeType: 'audio/mpeg',
      buffer: recording,
    })),
  );
  const imported = panel.getByText('Practice recording', {exact: true});
  await expect(imported).toBeVisible();

  await create('Review');
  await panel.getByRole('button', {name: 'Choose playlist'}).click();
  await panel.getByRole('button', {name: 'Default', exact: true}).click();
  await expect(panel.getByText(defaultTrack, {exact: true})).toBeVisible();
  await expect(imported).toHaveCount(0);

  await picker.fill('review');
  page.once('dialog', dialog => dialog.accept());
  await panel.getByRole('button', {name: 'Remove playlist'}).click();
  await panel.getByRole('button', {name: 'Choose playlist'}).click();
  await expect(
    panel.getByRole('button', {name: 'Review', exact: true}),
  ).toHaveCount(0);
  await picker.fill('listen');
  await panel
    .getByRole('button', {name: 'Listening practice', exact: true})
    .click();
  await expect(imported).toBeVisible();
  await imported.click();
  await page.keyboard.press('Escape');
  await expect.poll(() => mediaTime(page)).toBeGreaterThan(2);
  await playButton(page).click();
  await expect(playButton(page)).toHaveAttribute('aria-label', 'Play');
  const savedTime = (await mediaTime(page))!;

  await page.reload();
  await expect(page.locator('.now-playing__title')).toHaveText(
    'Practice recording',
  );
  await waitForClips(page);
  await expect(playButton(page)).toHaveAttribute('aria-label', 'Play');
  expect(await mediaTime(page)).toBeNull();
  await playButton(page).click();
  const resumedTime = (await mediaTime(page))!;
  expect(Math.abs(resumedTime - savedTime)).toBeLessThan(0.5);
  await playButton(page).click();
  await openPlaylist();
  await expect(picker).toHaveValue('Listening practice');
  await expect(imported).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.waveform-clip').first()).toBeVisible();
});
