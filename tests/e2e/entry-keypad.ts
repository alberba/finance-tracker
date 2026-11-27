import type { Locator } from '@playwright/test'

/**
 * Types an amount on the entry sheet's keypad (the mobile «Apuntar»), key by
 * key, as a finger would: «12,34» presses 1, 2, the comma, 3 and 4.
 */
export async function typeOnKeypad(sheet: Locator, amount: string): Promise<void> {
  const keypad = sheet.getByRole('group', { name: 'Teclado del importe' })
  for (const key of amount) {
    await keypad
      .getByRole('button', { name: key === ',' ? 'Coma decimal' : key, exact: true })
      .click()
  }
}
