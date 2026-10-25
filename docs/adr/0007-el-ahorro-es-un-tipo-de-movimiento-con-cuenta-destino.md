# El ahorro es un tipo de movimiento con cuenta destino

Un ahorro es un tipo de movimiento propio, no una categoría de gasto ni una transferencia entre
entidades. Lleva dos cuentas de efectivo, origen y destino, y viaja con la cuenta destino dentro
del comando del movimiento, como la operación de inversión (ADR 0002).

La alternativa era reutilizar `investment`, pero eso mezcla ahorro e inversión en el dashboard,
el presupuesto y los objetivos, que es lo que se quería separar. Elegimos el tipo propio aunque
tocar el tipo de movimiento afecta al registro, las plantillas, el sync v2 y el dashboard.
