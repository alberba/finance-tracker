import { expect, type Page } from '@playwright/test'
import type { SyncCommandInput } from '../../../src/lib/server/sync/command-schemas'

/** Register before submitting the UI action; completion means its own command was applied. */
export async function expectSyncCommand(
  page: Page,
  matches: (command: SyncCommandInput) => boolean,
  count = 1,
): Promise<void> {
  const applied = new Set<string>()
  await page.waitForResponse(async (candidate) => {
    if (!candidate.url().endsWith('/api/sync') || candidate.request().method() !== 'POST')
      return false
    const body = candidate.request().postDataJSON() as { commands: SyncCommandInput[] }
    const commands = body.commands.filter(matches)
    if (!commands.length) return false
    expect(candidate.ok()).toBe(true)
    const response = (await candidate.json()) as {
      results: Array<{ commandId: string; status: string }>
    }
    for (const command of commands) {
      expect(
        response.results.find((result) => result.commandId === command.commandId),
      ).toMatchObject({
        status: 'applied',
      })
      applied.add(command.commandId)
    }
    return applied.size >= count
  })
}
