import {
  buildMonthlyReportDocument,
  REPORT_FONT_FILES,
  reportFileName,
} from '../../domain/monthly-report/pdf-document'
import type { MonthlyReportPeriod } from '../../domain/monthly-report/period'
import type { MonthlyReportViewModel } from '../../domain/monthly-report/view-model'

// Turns a report into a PDF in the browser (ADR 0009). pdfmake and the fonts it embeds weigh
// several hundred KB, so they are loaded only when the report is downloaded; the service worker
// keeps them for offline use once `preloadMonthlyReportPdf` has fetched them.

const FONT_LOADERS = import.meta.glob<string>('../../assets/fonts/report/*.ttf', {
  query: '?url',
  import: 'default',
})

const FONT_DICTIONARY = Object.fromEntries(
  Object.entries(REPORT_FONT_FILES).map(([family, files]) => [family, { ...files }]),
)

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk))
  }
  return btoa(binary)
}

async function fetchFont(file: string): Promise<Response> {
  const load = FONT_LOADERS[`../../assets/fonts/report/${file}`]
  if (!load) throw new Error(`Falta la fuente ${file} del informe.`)
  const response = await fetch(await load())
  if (!response.ok) throw new Error(`No se pudo cargar la fuente ${file}.`)
  return response
}

async function loadFontFile(file: string): Promise<string> {
  return toBase64(await (await fetchFont(file)).arrayBuffer())
}

function fontFiles(): string[] {
  return [...new Set(Object.values(REPORT_FONT_FILES).flatMap((files) => Object.values(files)))]
}

/** Generates the report as a PDF and hands it to the browser as a download. */
export async function downloadMonthlyReportPdf(
  report: MonthlyReportViewModel,
  period: MonthlyReportPeriod,
): Promise<void> {
  const files = fontFiles()
  const [pdfModule, contents] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    Promise.all(files.map(loadFontFile)),
  ])
  // The browser build is a CommonJS bundle: its API sits on `default` or on the module itself.
  const pdfMake = (pdfModule.default ?? pdfModule) as typeof pdfModule.default
  const vfs = Object.fromEntries(files.map((file, index) => [file, contents[index]]))
  pdfMake.addVirtualFileSystem(vfs)
  pdfMake.setFonts(FONT_DICTIONARY)
  await pdfMake.createPdf(buildMonthlyReportDocument(report)).download(reportFileName(period))
}

/**
 * Fetches pdfmake and the fonts ahead of time so that the service worker caches them and the
 * first download also works offline. Failing is harmless: the download will try again.
 */
export async function preloadMonthlyReportPdf(): Promise<void> {
  try {
    await Promise.all([import('pdfmake/build/pdfmake'), ...fontFiles().map(fetchFont)])
  } catch {
    // Offline or blocked: the real download reports its own error.
  }
}
