import {expect, test} from '@playwright/test';
import {openClipDetectionTab, seedConfig, waitForClips} from './helpers';

for (const [name, theme, background, button] of [
  ['Listenoop Night', 'listenoop', 'rgb(6, 10, 36)', 'rgb(0, 212, 175)'],
  ['Solarized Dark', 'dark', 'rgb(0, 43, 54)', 'rgb(42, 161, 152)'],
  ['Gruvbox Dark', 'midnight', 'rgb(29, 32, 33)', 'rgb(250, 189, 47)'],
  ['Tokyo Night', 'nova', 'rgb(26, 27, 38)', 'rgb(122, 162, 247)'],
  ['Spring', 'light', 'rgb(225, 241, 207)', 'rgb(50, 101, 27)'],
  ['Summer', 'paper', 'rgb(229, 244, 255)', 'rgb(0, 143, 232)'],
  ['Autumn', 'autumn', 'rgb(255, 244, 184)', 'rgb(255, 176, 0)'],
  ['Winter', 'winter', 'rgb(233, 244, 252)', 'rgb(33, 150, 210)'],
] as const) {
  test(`${name} renders its seasonal colors in the player`, async ({page}) => {
    await page.setViewportSize({width: 375, height: 812});
    await seedConfig(page, {theme});
    await page.goto('/');
    await waitForClips(page);
    await expect(page.locator('body')).toHaveCSS(
      'background-color',
      background,
    );
    await expect(page.locator('.control-btn--play')).toHaveCSS(
      'background-color',
      button,
    );
    const foreground = (
      {
        paper: 'rgb(245, 251, 255)',
        autumn: 'rgb(255, 251, 226)',
        winter: 'rgb(246, 251, 255)',
      } as Record<string, string>
    )[theme];
    if (foreground) {
      await expect(page.locator('.control-btn--play')).toHaveCSS(
        'color',
        foreground,
      );
    }
    await expect(page.locator('.progress-container')).toHaveCSS(
      'box-shadow',
      'none',
    );
    await expect(page.locator('.progress-container')).toHaveCSS(
      'background-image',
      'none',
    );
    await expect(page.locator('.control-btn--play')).toHaveCSS(
      'box-shadow',
      'none',
    );
    await page.screenshot({
      path: `dist/clear-themes/${name.toLowerCase()}-player.png`,
    });
  });
}

test('seasonal and dark themes apply and persist on a phone screen', async ({
  page,
}) => {
  await page.setViewportSize({width: 375, height: 812});
  await seedConfig(page, {});
  await page.goto('/');
  await waitForClips(page);
  await openClipDetectionTab(page);
  await page.getByRole('tab', {name: 'Appearance', exact: true}).click();

  const palettes = [
    ['Listenoop Night', '#060A24'],
    ['Solarized Dark', '#002B36'],
    ['Gruvbox Dark', '#1D2021'],
    ['Tokyo Night', '#1A1B26'],
    ['Spring', '#E1F1CF'],
    ['Summer', '#E5F4FF'],
    ['Autumn', '#FFF4B8'],
    ['Winter', '#E9F4FC'],
  ];
  for (const [name, background] of palettes) {
    const option = page.getByRole('button', {name, exact: true});
    await option.click();
    await expect(option).toHaveAttribute('aria-pressed', 'true');
    expect(
      await page.evaluate(() =>
        document.documentElement.style.getPropertyValue('--bg-primary'),
      ),
    ).toBe(background);
  }
  await page.getByRole('button', {name: 'Autumn', exact: true}).click();
  await page.reload();
  await waitForClips(page);
  await openClipDetectionTab(page);
  await page.getByRole('tab', {name: 'Appearance', exact: true}).click();
  await expect(
    page.getByRole('button', {name: 'Autumn', exact: true}),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(
    await page.evaluate(() =>
      document.documentElement.style.getPropertyValue('--accent'),
    ),
  ).toBe('#FFB000');
  expect(
    await page.evaluate(() =>
      document.documentElement.style.getPropertyValue('--accent-ink'),
    ),
  ).toBe('#8C5300');
  await expect(
    page.getByRole('button', {name: 'Qinghua', exact: true}),
  ).toBeVisible();
  await page.screenshot({path: 'dist/theme-refresh/autumn-settings.png'});
});

for (const legacy of [false, true]) {
  test(`Listenoop Night is first and remains fixed with ${legacy ? 'old System settings' : 'new settings'}`, async ({
    page,
  }) => {
    await page.emulateMedia({colorScheme: 'light'});
    await seedConfig(page, legacy ? {theme: 'system'} : {});
    await page.goto('/');
    await waitForClips(page);
    await expect(page.locator('body')).toHaveCSS(
      'background-color',
      'rgb(6, 10, 36)',
    );
    await openClipDetectionTab(page);
    await page.getByRole('tab', {name: 'Appearance', exact: true}).click();
    const first = page.locator('.theme-grid .theme-card').first();
    await expect(first).toHaveText('Listenoop Night');
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByRole('button', {name: 'System', exact: true}),
    ).toHaveCount(0);
    await page.emulateMedia({colorScheme: 'dark'});
    await expect(page.locator('body')).toHaveCSS(
      'background-color',
      'rgb(6, 10, 36)',
    );
    await page.reload();
    await waitForClips(page);
    await expect(page.locator('body')).toHaveCSS(
      'background-color',
      'rgb(6, 10, 36)',
    );
  });
}
