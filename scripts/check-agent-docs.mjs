import { readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Every local document AGENTS.md points to must exist and have content: agents (and the
// Standards axis of /code-review) read them as authoritative, and an empty one passes in silence.
// A bad merge emptied CODING_STANDARDS.md once (#454) and reviews ran against nothing.
const ENTRY = 'AGENTS.md'
const LINK = /\[[^\]]*\]\(([^)\s#]+)(?:#[^)]*)?\)/g

export default async function checkAgentDocs(entry = ENTRY) {
  const text = await readFile(entry, 'utf8')
  const targets = [...text.matchAll(LINK)]
    .map((match) => match[1])
    .filter((target) => !/^[a-z]+:/i.test(target))
  const problems = []
  for (const target of new Set(targets)) {
    const path = join(dirname(entry), target)
    const info = await stat(path).catch(() => null)
    if (!info) problems.push(`${path} no existe`)
    else if (info.isFile() && (await readFile(path, 'utf8')).trim() === '')
      problems.push(`${path} está vacío`)
  }
  if (problems.length > 0) {
    throw new Error(`Documentos enlazados desde ${entry}:\n- ${problems.join('\n- ')}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await checkAgentDocs()
}
