import { z } from 'zod'

import {
  DIAGNOSTIC_OPTIONS,
  DIAGNOSTIC_SUBVIEWS,
  REPORT_SCREENS,
  diagnosticLabels,
  reportTopics,
  type DiagnosticCode,
  type ReportTopic,
} from '../../domain/reports/diagnostic'

export const reportScreenSchema = z.enum(REPORT_SCREENS)
export const reportTopicSchema = z.enum(Object.keys(reportTopics) as ReportTopic[])
const optionSchema = z.enum(DIAGNOSTIC_OPTIONS)
const subviewSchema = z.enum(DIAGNOSTIC_SUBVIEWS)
const codeSchema = z.enum(Object.keys(diagnosticLabels) as DiagnosticCode[])
const yearSchema = z.number().int().min(1900).max(2200)
const monthSchema = z.number().int().min(1).max(12)

export const diagnosticSchema = z.object({
  screen: reportScreenSchema,
  capturedAt: z.iso.datetime(),
  version: z.string().regex(/^(?:[a-f0-9]{7,40}|\d{1,4}\.\d{1,4}\.\d{1,4})$/),
  device: z.enum(['mobile', 'desktop']),
  load: z.enum(['starting', 'ready', 'error']),
  sync: z
    .object({
      revision: z.number().int().nonnegative(),
      pending: z.number().int().nonnegative(),
    })
    .nullable(),
  section: z.object({
    subview: subviewSchema.optional(),
    year: yearSchema.optional(),
    month: monthSchema.optional(),
    fromYear: yearSchema.optional(),
    fromMonth: monthSchema.optional(),
    options: z.array(optionSchema).max(10).optional(),
    checks: z.array(codeSchema).min(1).max(8),
  }),
  steps: z.array(z.union([reportScreenSchema, codeSchema])).max(8),
  sentryEventId: z
    .string()
    .regex(/^[0-9a-f]{32}$/)
    .optional(),
})
