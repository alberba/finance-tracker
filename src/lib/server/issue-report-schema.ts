import { z } from "zod";

/**
 * `enhancement` was the value emitted by the first version of the form. Keep
 * accepting it at the API boundary so old clients/bookmarks can still create
 * reports, while all new issues use the GitHub-friendly `feature` value.
 */
const ISSUE_TYPES = ["bug", "feature", "enhancement"] as const;

export const issueReportSchema = z.object({
  type: z.enum(ISSUE_TYPES),
  summary: z.string().trim().min(5).max(140),
  description: z.string().trim().min(12).max(8000),
  section: z.string().trim().min(1).max(64),
  context: z.object({
    userAgent: z.string().trim().max(512).optional().default(""),
    pathname: z.string().trim().max(256).optional().default(""),
    timestamp: z.string().trim().max(64).optional().default(""),
  }),
  stepsToReproduce: z.string().trim().max(5000).optional(),
  expectedResult: z.string().trim().max(4000).optional(),
  actualResult: z.string().trim().max(4000).optional(),
}).transform((parsed) => ({
  ...parsed,
  type: parsed.type === "enhancement" ? "feature" as const : parsed.type,
}));

export type IssueReportInput = z.input<typeof issueReportSchema>;

export type IssueReportPayload = z.output<typeof issueReportSchema>;

function removeControlCharacters(value: string): string {
  return Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 0x1f && codePoint !== 0x7f;
    })
    .join("");
}

function sanitizeText(value: string): string {
  return removeControlCharacters(value).replace(/\r\n/g, "\n").trim();
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
