# La identidad de una entidad nueva no se deriva de sus datos

Hasta ahora el cliente correlacionaba cada entidad con su fila en D1 mediante un `legacyId`
derivado de los datos de negocio (`expense:Comida`, `gasto:cat:3`). Eso hacía que renombrar
una categoría se viera como borrar y crear, que el identificador de una celda de presupuesto
colisionara entre años, y que la convención del cliente y la de la migración divergieran en
silencio.

Decidimos que el identificador derivado de los datos queda reservado a reconciliar las filas
que vienen de v1: las entidades creadas a partir de ahora llevan identidad propia, estable
frente a cualquier edición. Las entidades con clave natural real —celda de presupuesto,
snapshot de patrimonio— protegen esa clave con un índice UNIQUE en la base de datos, no con
una cadena convenida entre cliente y migrador.
