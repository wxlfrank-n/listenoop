import {expect, test} from '@playwright/test';
import {
  openClipDetectionTab,
  seedConfig,
  waitForClips,
  CONFIG_KEY,
} from './helpers';

function speechFixture() {
  const rate = 16000;
  // Two phrases, each with an internal 100 ms pause, separated by 400 ms.
  const parts = [
    [0.3, 0],
    [0.4, 0.2],
    [0.1, 0],
    [0.4, 0.2],
    [0.4, 0],
    [0.4, 0.2],
    [0.1, 0],
    [0.4, 0.2],
    [0.3, 0],
  ];
  const count = parts.reduce(
    (sum, part) => sum + Math.round(part[0]! * rate),
    0,
  );
  const wav = Buffer.alloc(44 + count * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(count * 2, 40);
  let offset = 44;
  for (const [seconds = 0, amplitude = 0] of parts) {
    for (let i = 0; i < Math.round(seconds * rate); i++) {
      const value = Math.sin((i * 2 * Math.PI * 220) / rate) * amplitude;
      wav.writeInt16LE(Math.round(value * 32767), offset);
      offset += 2;
    }
  }
  return wav;
}

test('automatic gap selection and the single clip minimum survive settings migration', async ({
  page,
}) => {
  await seedConfig(page, {
    minSilenceSec: 0.2,
    minSplitPieceSec: 0.1,
    minClipLength: 0.3,
    blockMs: 20,
    waveformView: 'horizontal',
  });
  await page.route('**/01A.mp3', route =>
    route.fulfill({contentType: 'audio/wav', body: speechFixture()}),
  );
  await page.goto('/');
  await waitForClips(page);
  const clips = page.locator('.waveform-clip');
  expect(await clips.count()).toBeGreaterThan(1);
  await openClipDetectionTab(page);
  await expect(
    page.getByRole('slider', {name: 'Minimum pause', exact: true}),
  ).toHaveCount(0);
  await expect(
    page.getByRole('slider', {name: 'Minimum split piece', exact: true}),
  ).toHaveCount(0);
  const minimum = page.getByRole('slider', {
    name: 'Minimum clip length',
    exact: true,
  });
  await expect(minimum).toHaveValue('0.3');
  const expansion = page.getByRole('slider', {
    name: 'Expansion rate',
    exact: true,
  });
  await expect(expansion).toHaveAttribute('min', '0.25');
  await expect(expansion).toHaveAttribute('max', '0.4');
  await expect(expansion).toHaveValue('0.25');
  const originalWidth = (await clips.first().boundingBox())!.width;
  await expansion.fill('0.4');
  await expect
    .poll(async () => (await clips.first().boundingBox())!.width)
    .toBeGreaterThan(originalWidth);
  await minimum.fill('1');
  await expect(clips).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(
        key => JSON.parse(localStorage.getItem(key)!).minClipLength,
        CONFIG_KEY,
      ),
    )
    .toBe(1);
  const saved = await page.evaluate(
    key => JSON.parse(localStorage.getItem(key)!),
    CONFIG_KEY,
  );
  expect(saved.expansionRate).toBe(0.4);
  expect(saved).not.toHaveProperty('minSilenceSec');
  expect(saved).not.toHaveProperty('minSplitPieceSec');
  await page.reload();
  await waitForClips(page);
  await expect(clips).toHaveCount(1);
  await openClipDetectionTab(page);
  await expect(
    page.getByRole('slider', {name: 'Expansion rate', exact: true}),
  ).toHaveValue('0.4');
});
