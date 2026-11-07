import { expect, type Locator } from '@playwright/test'

/** ToggleSwitch draws a track over a hidden input; hit its visible label. */
export async function setSwitch(control: Locator, checked: boolean): Promise<void> {
  if ((await control.isChecked()) !== checked) {
    await control.locator('xpath=ancestor::label[1]').click()
  }
  await expect(control).toBeChecked({ checked })
}
