import { test as base, expect, type Page } from '@playwright/test';

/**
 * Pages are pre-rendered, so they are visible before React hydrates and clicks made in
 * that window are lost. This `page.goto` waits for the network to settle (scripts loaded,
 * page hydrated) so tests interact with the live app, not the static HTML.
 */
export const test = base.extend({
  page: async ({ page }, provide) => {
    const goto = page.goto.bind(page);
    page.goto = async (url, options) => {
      const response = await goto(url, options);
      await page.waitForLoadState('networkidle');
      return response;
    };
    await provide(page);
  },
});

export { expect };

/**
 * Wait until no CSS animation or transition is running (a dialog or sheet has finished opening),
 * so checks such as axe never see half-faded text. Deterministic, unlike a fixed sleep.
 */
export async function settleAnimations(page: Page): Promise<void> {
  // Endless ones (spinners) never finish, so they don't count.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity));
}
