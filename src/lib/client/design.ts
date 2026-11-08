import { parseDesign, serializeDesignCookie, type Design } from '../design'

/** The design the page was rendered with: the server stamps it on `<html data-ui>`. */
export function currentDesign(root: { dataset: DOMStringMap } = document.documentElement): Design {
  return parseDesign(root.dataset.ui)
}

/**
 * Remembers `design` in the cookie the server reads and reloads, so the whole
 * page, frame included, is rendered again with it. A no-op when it is already
 * the current one.
 */
export function switchDesign(
  design: Design,
  env: {
    document: { cookie: string }
    location: { protocol: string; reload(): void }
    current: Design
  } = {
    document,
    location: window.location,
    current: currentDesign(),
  },
): void {
  if (design === env.current) return
  env.document.cookie = serializeDesignCookie(design, env.location.protocol === 'https:')
  env.location.reload()
}
