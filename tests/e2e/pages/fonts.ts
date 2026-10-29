import { expect, type Page } from '@playwright/test'

/**
 * The app and login self-host their faces (#404). `document.fonts.check`
 * proves each family and weight is available; the resource entries prove the
 * bytes came from this origin, not Google Fonts.
 */
export async function expectSelfHostedFonts(page: Page): Promise<void> {
  const fonts = await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('800 16px "Syne"'),
      document.fonts.load('700 16px "DM Sans"'),
      document.fonts.load('italic 400 16px "DM Sans"'),
      document.fonts.load('500 12px "DM Mono"'),
    ])
    await document.fonts.ready

    const fontResources = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((url) => /\/fonts\/[^/]+\.woff2$/.test(new URL(url).pathname))
    const externalFontResources = fontResources.filter(
      (url) => new URL(url).origin !== window.location.origin,
    )

    return {
      syne: document.fonts.check('800 16px "Syne"'),
      dmSans: document.fonts.check('700 16px "DM Sans"'),
      dmSansItalic: document.fonts.check('italic 400 16px "DM Sans"'),
      dmMono: document.fonts.check('500 12px "DM Mono"'),
      localFontResources: fontResources.length > 0 && externalFontResources.length === 0,
    }
  })

  expect(fonts).toEqual({
    syne: true,
    dmSans: true,
    dmSansItalic: true,
    dmMono: true,
    localFontResources: true,
  })
}
