import { expect, type Page } from '@playwright/test';

/** Exercise real page layout; optional screenshots stay outside the repository. */
export async function reviewSurface(page: Page, name: string) {
  const original = page.viewportSize();
  for (const width of [1440, 1280, 900, 768, 390, 430]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
    if (process.env.UI_REVIEW_DIR) {
      // Full-page captures otherwise place sticky UI at the previous scroll position.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `${process.env.UI_REVIEW_DIR}/${name}-${width}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    }
  }
  if (original) await page.setViewportSize(original);
}
