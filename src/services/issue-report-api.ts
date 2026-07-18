export type ReportType = 'bug' | 'enhancement'

export interface ReportPayload {
  type: ReportType
  summary: string
  description: string
  mentionClaude: boolean
  section: string
  context: {
    userAgent: string
    pathname: string
    timestamp: string
  }
  stepsToReproduce?: string
  expectedResult?: string
  actualResult?: string
}

interface ReportResponseOk {
  ok: true
  issueNumber: number
  issueUrl: string
  enrichmentStatus?: 'pending' | 'completed'
}

interface ReportResponseError {
  ok: false
  error: string
}

export type ReportResponse = ReportResponseOk | ReportResponseError

export type ReportSubmissionPayload = Omit<ReportPayload, 'mentionClaude'> & {
  mentionClaude?: boolean
}

export const ISSUE_REPORT_ENDPOINT = '/api/issues/report'

export async function submitIssueReport(payload: ReportSubmissionPayload): Promise<ReportResponse> {
  const response = await fetch(ISSUE_REPORT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const data = (await response.json()) as ReportResponse
  if (!response.ok) {
    const errorMessage = 'error' in data ? data.error : 'No se pudo crear la issue.'
    return { ok: false, error: errorMessage }
  }
  return data
}
