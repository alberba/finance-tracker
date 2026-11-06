# Product

<!-- impeccable:product-schema 1 -->

## Platform

web (PWA usada en móvil y en escritorio; mobile web, no app nativa)

## Users

Una persona que lleva sus finanzas personales a mano, en euros y en español. La usa en dos
situaciones distintas:

- **Móvil:** un dashboard completo (mes, presupuesto, patrimonio, inversión, objetivos,
  pendientes, últimos movimientos) donde la acción principal, apuntar un gasto, está siempre a un
  toque. Apunta casi siempre justo al pagar (una mano, segundos, a veces sin cobertura: la app es
  offline-first), y a veces recupera gastos olvidados de días anteriores en tanda. Después de
  apuntar solo quiere confirmación con deshacer.
- **Escritorio:** seguimiento. Revisa el mes, el presupuesto, el patrimonio, la inversión y los
  objetivos con calma.

## Product Purpose

Tracker financiero personal: dashboard mensual y anual, registro de movimientos (gasto, ingreso,
inversión, ahorro), presupuesto por categoría contra real, patrimonio con snapshots mensuales,
inversión con cotizaciones, objetivos de ahorro y movimientos recurrentes que se confirman de
forma explícita (pendientes). Éxito en móvil: apuntar un gasto en segundos sin pensar. Éxito en
escritorio: entender cómo va el mes y el patrimonio de un vistazo.

## Positioning

Es la herramienta propia del usuario, no un agregador bancario: los movimientos se apuntan a mano
(o se confirman desde pendientes recurrentes), con mes contable propio, presupuesto por celda y
patrimonio por cuentas de efectivo, inversión y pasivo.

## Terminology

Usa el vocabulario de [GLOSSARY.md](GLOSSARY.md): movimiento, mes contable, ahorro, cuenta,
pendiente, plantilla de movimiento, informe (no «reporte»).

## Constraints

- Idioma de la interfaz: español de España; importes con formato `1.233,55 €` y signo menos `−`.
- Offline-first con cola de comandos: apuntar nunca puede depender de la red.
- Fuentes servidas desde el propio dominio (sin CDN en la app).

## Open decisions

- Mundo visual del móvil: se exploran dos líneas en paralelo, una desde cero y otra que conserva
  el modo oscuro y las fuentes actuales (Syne, DM Sans, DM Mono).
