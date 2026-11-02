import {expect, test} from '@playwright/test';
import {seedConfig, waitForClips} from './helpers';

for (const width of [320, 375, 480, 1024]) {
  test(`playback controls fit and remain symmetric at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({width, height: 812});
    await seedConfig(page, {playbackSpeed: 1.25, skipSeconds: 30});
    await page.goto('/');
    await waitForClips(page);
    const controls = page.locator('.player-controls');
    const panel = (await controls.boundingBox())!;
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(width);
    for (const item of await controls.locator(':scope > *').all()) {
      const box = (await item.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(panel.x - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(panel.x + panel.width + 1);
    }
    const play = (await controls.locator('.control-btn--play').boundingBox())!;
    expect(Math.abs(play.x + play.width / 2 - width / 2)).toBeLessThan(1);
    const left = (await controls
      .locator('.playback-speed-spacer')
      .boundingBox())!;
    const speed = (await controls.locator('.playback-speed').boundingBox())!;
    expect(Math.abs(left.width - speed.width)).toBeLessThan(1);
    expect(speed.width).toBe(48);
    const targets = await controls.locator('button, .playback-speed').all();
    let previousRight = panel.x;
    for (const target of targets) {
      const box = (await target.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(48);
      expect(box.x).toBeGreaterThanOrEqual(previousRight - 1);
      previousRight = box.x + box.width;
    }
    const textFits = await controls
      .locator('.playback-speed__number--current')
      .evaluate(element => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return range.getBoundingClientRect().width <= element.clientWidth;
      });
    expect(textFits).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  });
}
