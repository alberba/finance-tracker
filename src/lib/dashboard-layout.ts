import { Schema } from 'effect'
import { validator } from './schema'

// The wire format is shared by both designs. Widget ids and their minimum
// sizes belong to the renderer, which can ignore widgets it does not know.
export const dashboardLayoutSchema = Schema.Struct({
  version: Schema.Literal(1),
  items: Schema.Array(
    Schema.Struct({
      id: Schema.String.check(Schema.isMinLength(1)),
      col: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
      row: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
      w: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
      h: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
    }),
  ),
})

export type DashboardLayoutPreference = Schema.Schema.Type<typeof dashboardLayoutSchema>

const layoutValidator = validator(dashboardLayoutSchema)

/** Missing, damaged or unsupported preferences use the renderer's defaults. */
export function parseDashboardLayout(value: unknown): DashboardLayoutPreference | null {
  const parsed = layoutValidator.safeParse(value)
  return parsed.success ? parsed.data : null
}
