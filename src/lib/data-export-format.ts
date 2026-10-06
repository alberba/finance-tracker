/**
 * Marks a `GET /api/data/export` file. `POST /api/data/import` and the Datos
 * page use it to tell a v2 backup apart from the legacy whole-state JSON,
 * which has a different shape and cannot be restored into D1.
 */
export const DATA_EXPORT_FORMAT = 'finance-tracker/v2-export'
