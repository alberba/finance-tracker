# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Particulares hispanohablantes que llevan sus propias finanzas: registran movimientos, revisan presupuestos y patrimonio, y siguen sus inversiones y objetivos. Uso recurrente, desde móvil y escritorio, con la app funcionando también sin conexión. Gestor multiusuario: cada persona tiene sus propios datos.

## Product Purpose

Gestor de finanzas personales (finanzas.) con dashboard mensual/anual, movimientos, presupuesto por categoría frente a real, patrimonio con snapshots, cartera de inversión, objetivos e informes imprimibles. El éxito es que el usuario entienda de un vistazo cómo van su gasto, su patrimonio y sus inversiones, y que registrar un movimiento cueste poco.

## Positioning

Una sola vista que junta gasto, patrimonio e inversión (presupuestos, cartera, objetivos e informes en el mismo sitio), en lugar de un tracker de gastos aparte de una hoja de inversiones.

## Operating Context

Los datos viven en SQLite (sync v2; D1 en el destino Cloudflare) y el cliente trabaja offline-first contra una cola de comandos. Se puede autoalojar con Docker o en Oracle. Existe una demo con datos sintéticos (`/?demo=1`). Los recurrentes y las reglas automáticas se revisan explícitamente antes de contar.

## Capabilities and Constraints

- Vocabulario de dominio en `GLOSSARY.md` (comando, cola de comandos, mes contable, informe, periodo del informe); usar esos términos en el copy.
- Movimientos de ingreso, gasto e inversión; mes contable distinto de la fecha cuando el usuario lo elige.
- Exportación/importación JSON, CSV de movimientos e informe mensual en PDF.
- Cotizaciones server-side para instrumentos configurados.

## Brand Commitments

Respetar el sistema visual ya documentado en `DESIGN.md` (neón de garaje: carbón cálido, un único naranja lámpara, Unbounded para cifras y Manrope para texto). Interfaz en español.

## Evidence on Hand

`src/data/seed.json` con datos semilla sintéticos y neutros; demo en `/?demo=1`. No hay testimonios, clientes ni métricas de uso que citar.

## Product Principles

- Las cifras mandan: saldos y porcentajes legibles de un vistazo.
- Tono de informe financiero, no de juego.
- Lo automático se revisa a mano antes de contar.
- Gasto, patrimonio e inversión se leen como un único panorama.
