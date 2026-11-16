import {expect, test} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {seedConfig} from './helpers';

test('named playlists keep separate tracks and restore imported audio after reload', async ({
  page,
}) => {
  await seedConfig(page, {});
  await page.goto('/');

  async function openPlaylist() {
    await page.getByRole('button', {name: 'More', exact: true}).click();
    await page.getByRole('menuitem', {name: 'Playlist', exact: true}).click();
  }
  const picker = page.getByRole('combobox', {name: 'Choose playlist'});
  const panel = page.getByRole('dialog');
  async function create(name: string) {
    await panel.getByRole('button', {name: 'New playlist'}).click();
    await panel.getByRole('textbox', {name: 'Playlist name'}).fill(name);
    await panel.getByRole('button', {name: 'Create', exact: true}).click();
    await expect(picker).toHaveValue(name);
    await expect(panel.getByText('No tracks yet')).toBeVisible();
  }

  await openPlaylist();
  const defaultTrack = await panel
    .locator('.track-item__title')
    .first()
    .innerText();
  await create('Listening practice');
  await panel.locator('input[type=file]').setInputFiles({
    name: 'Practice recording.mp3',
    mimeType: 'audio/mpeg',
    buffer: await readFile('public/music/01A.mp3'),
  });
  const imported = panel.getByText('Practice recording', {exact: true});
  await expect(imported).toBeVisible();

  await create('Review');
  await picker.selectOption('');
  await expect(panel.getByText(defaultTrack, {exact: true})).toBeVisible();
  await expect(imported).toHaveCount(0);

  await picker.selectOption('Listening practice');
  await expect(imported).toBeVisible();
  await page.reload();
  await openPlaylist();
  await expect(picker).toHaveValue('Listening practice');
  await expect(imported).toBeVisible();
  await panel.getByRole('button', {name: 'Close playlist'}).click();
  await expect(page.locator('.waveform-clip').first()).toBeVisible();
});
