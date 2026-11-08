/**
 * Which design the app paints during the «neón de garaje» migration
 * (ADR 0010, docs/adr/0010-migracion-con-convivencia-aislada.md).
 *
 * The choice is a per-device cookie, not an account setting. The server reads
 * it to render the chosen design from the first byte, so the other design is
 * never painted first; the toggle writes it and reloads. The migration's last
 * ticket deletes this file with the cookie and the toggle.
 */

export const DESIGN_COOKIE = 'finance-design'

export type Design = 'neon' | 'legacy'

/** Without a cookie (or with an unknown value) the new design shows. */
export const DEFAULT_DESIGN: Design = 'neon'

export const DESIGN_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export function parseDesign(value: string | null | undefined): Design {
  return value === 'legacy' ? 'legacy' : DEFAULT_DESIGN
}

/** The `Set-Cookie`-style string `document.cookie` takes to remember `design`. */
export function serializeDesignCookie(design: Design, secure: boolean): string {
  return [
    `${DESIGN_COOKIE}=${design}`,
    'Path=/',
    `Max-Age=${DESIGN_COOKIE_MAX_AGE_SECONDS}`,
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ')
}

/** The two choices of the toggle, in the order both frames show them. */
export const DESIGN_OPTIONS: ReadonlyArray<{ value: Design; label: string; name: string }> = [
  { value: 'neon', label: 'Nuevo', name: 'Diseño nuevo' },
  { value: 'legacy', label: 'Antiguo', name: 'Diseño antiguo' },
]
