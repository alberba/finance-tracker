import { expect, type Page } from '@playwright/test'
import type { SyncCommandInput } from '../../../src/lib/server/sync/command-schemas'

/** Register before submitting the UI action; completion means its own command was applied. */
export async function expectSyncCommand(
  page: Page,
  matches: (command: SyncCommandInput) => boolean,
): Promise<void> {
  const response = await page.waitForResponse((candidate) => {
    if (!candidate.url().endsWith('/api/sync') || candidate.request().method() !== 'POST')
      return false
    const body = candidate.request().postDataJSON() as { commands: SyncCommandInput[] }
    return body.commands.some(matches)
  })
  const sent = response.request().postDataJSON() as { commands: SyncCommandInput[] }
  const command = sent.commands.find(matches)!
  expect(response.ok()).toBe(true)
  const body = (await response.json()) as { results: Array<{ commandId: string; status: string }> }
  expect(body.results.find((result) => result.commandId === command.commandId)).toMatchObject({
    status: 'applied',
  })
}
