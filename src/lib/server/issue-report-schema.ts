import { z } from "zod";

const ISSUE_TYPES = ["bug", "enhancement"] as const;

export const issueReportSchema = z.object({
  type: z.enum(ISSUE_TYPES),
  summary: z.string().trim().min(5).max(140),
  description: z.string().trim().min(12).max(8000),
  mentionClaude: z.boolean().optional().default(false),
  section: z.string().trim().min(1).max(64),
  context: z.object({
    userAgent: z.string().trim().max(512).optional().default(""),
    pathname: z.string().trim().max(256).optional().default(""),
    timestamp: z.string().trim().max(64).optional().default(""),
  }),
  stepsToReproduce: z.string().trim().max(5000).optional(),
  expectedResult: z.string().trim().max(4000).optional(),
  actualResult: z.string().trim().max(4000).optional(),
});

export type IssueReportInput = z.input<typeof issueReportSchema>;
export type IssueReportPayload = z.output<typeof issueReportSchema>;

const CONTROL_CHARACTERS_REGEX =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

function sanitizeText(value: string): string {
  return value
    .replace(CONTROL_CHARACTERS_REGEX, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

export function parseIssueReportPayload(input: unknown): IssueReportPayload {
  const parsed = issueReportSchema.parse(input);
  return {
    ...parsed,
    summary: sanitizeText(parsed.summary),
    description: sanitizeText(parsed.description),
    section: sanitizeText(parsed.section),
    context: {
      userAgent: sanitizeText(parsed.context.userAgent),
      pathname: sanitizeText(parsed.context.pathname),
      timestamp: sanitizeText(parsed.context.timestamp),
    },
    stepsToReproduce: parsed.stepsToReproduce
      ? sanitizeText(parsed.stepsToReproduce)
      : undefined,
    expectedResult: parsed.expectedResult
      ? sanitizeText(parsed.expectedResult)
      : undefined,
    actualResult: parsed.actualResult
      ? sanitizeText(parsed.actualResult)
      : undefined,
  };
}
