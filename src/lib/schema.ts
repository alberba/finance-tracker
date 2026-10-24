/**
 * The small parse surface the app needs from a schema (ADR-0006, fase 7).
 *
 * Effect Schema is the only schema library in the client bundle; callers get
 * the same `safeParse`-style result they had with zod (`success`/`data` or a
 * list of issues with a path), so the outbox and the sync endpoints do not
 * care which library is underneath. Objects reject excess properties, which
 * is what the `.strict()` schemas of the command contract relied on.
 */

import { Result, Schema } from 'effect'

export interface SchemaIssueInfo {
  readonly path: readonly PropertyKey[]
  readonly message: string
}

export type SchemaParse<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly issues: readonly SchemaIssueInfo[] }

export interface Validator<T> {
  /** The underlying schema, for callers that need to compose it (JSON Schema, unions…). */
  readonly schema: Schema.Schema<T>
  safeParse(input: unknown): SchemaParse<T>
  parse(input: unknown): T
}

/** Strict by default: the command contract rejects fields with no destination. */
export interface ValidatorOptions {
  readonly onExcessProperty?: 'error' | 'ignore'
}

export const safeParse = <T>(
  schema: Schema.Schema<T>,
  input: unknown,
  options: ValidatorOptions = {},
): SchemaParse<T> => {
  const decoder = Schema.decodeUnknownResult(
    schema as unknown as Schema.ConstraintDecoder<unknown, never>,
    { onExcessProperty: options.onExcessProperty ?? 'error' },
  )
  const result = decoder(input)
  if (Result.isSuccess(result)) return { success: true, data: result.success as T }
  return {
    success: false,
    // The decoder's message already names the offending path ("at [\"x\"]").
    issues: [{ path: [], message: result.failure.message }],
  }
}

export const validator = <S extends Schema.Top>(
  schema: S,
  options: ValidatorOptions = {},
): Validator<Schema.Schema.Type<S>> => {
  const typed = schema as unknown as Schema.Schema<Schema.Schema.Type<S>>
  return {
    schema: typed,
    safeParse: (input) => safeParse(typed, input, options),
    parse: (input) => {
      const result = safeParse(typed, input, options)
      if (result.success) return result.data
      throw new Error(`Valor inválido: ${result.issues.map((issue) => issue.message).join('; ')}`)
    },
  }
}
