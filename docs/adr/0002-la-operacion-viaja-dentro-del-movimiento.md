# La operación de inversión viaja dentro del comando del movimiento

Los datos de una compra o venta (símbolo, títulos, precio unitario, comisión) viven en
`investment_trade_details`, una tabla sin ninguna ruta de escritura en runtime: hoy se pierden
salvo en las filas migradas.

Podríamos convertirla en una entidad sincronizada más, con sus propios comandos. Elegimos
en cambio anidar la operación en el comando del movimiento: importe y operación se escriben
juntos o no se escriben, lo que evita que queden desincronizados y que la cola dependa del
orden entre dos comandos con una clave foránea de por medio. `time` y `declared` sí pasan a ser
columnas de `transactions`, porque también aplican a movimientos que no son de inversión.
