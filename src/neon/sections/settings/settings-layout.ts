import type { InjectionKey } from 'vue'

/**
 * True inside the mobile screen of one apartado: there the screen brings the
 * title and the line under it, so the block shows only its content.
 */
export const BARE_BLOCK: InjectionKey<boolean> = Symbol('settings-bare-block')
