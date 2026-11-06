---
version: 1
slug: "src-components-sections-dashboardsection-vue"
primary_target: "src/components/sections/DashboardSection.vue"
related_targets: []
---

# Dashboard · móvil

Scope: pantalla de inicio del móvil (dashboard). Mode: Operate.
Audience/job: dashboard completo del mes (gasto por día, presupuesto, patrimonio, inversión,
objetivos, pendientes, últimos movimientos) con «Apuntar» siempre a un toque desde cualquier
pantalla; tras apuntar, solo confirmación con deshacer. Corrección del usuario: una portada que
solo sea el teclado no vale.

## Direction contract

FORM: seed:0c2604abfce889c0 · grounded candidate 3 · libreta cuadriculada con bolígrafo azul.
THESIS: el dashboard es la página del mes de una libreta de cuadros, con el gasto por día dibujado
sobre la propia cuadrícula; apuntar vive en el botón central de la barra y abre la hoja del
teclado. Rechaza el mosaico de tarjetas iguales con cifra protagonista.
OWN-WORLD: papel blanco frío con cuadrícula de 5 mm azul gris; tinta azul de bolígrafo para todo
lo que el usuario apuntó; grafito para lo que aún no ha pasado (pendientes); naranja de
subrayador solo para lo que pide acción. Geist para interfaz, Geist Mono tabular para importes.
STORY: abre, teclea importe, toca categoría, «Apuntar»; ve la línea entrar entintada en la hoja.
FIRST VIEWPORT: mes (gastado de presupuestado, lo que queda al día), gráfico de días sobre la
cuadrícula, ingresos/gastos/invertido, pendientes a lápiz; barra inferior con «Apuntar» central.
SIGNATURE: pendientes a lápiz (grafito, discontinuo) que se entintan al confirmar; borrar tacha la
línea con deshacer en vez de hacerla desaparecer.
RISK: puede leerse como skeuomórfico si la cuadrícula se ve demasiado; se queda en módulo y fondo
tenue, nunca papel con textura.

Raises: tamaño de tipo en tres pasos (de la guía de horarios); identidad fija por categoría
(del catálogo de personajes); una zona domina la pantalla (del mapa); tachar en vez de
desaparecer (de la cartera de billetes); rampa de grafito como únicos tonos (del registro de
exposición).

Variante B (pedida por el usuario): conserva modo oscuro y Syne / DM Sans / DM Mono. Mundo:
sobres de presupuesto; las categorías son sobres con lo que queda en cada uno, tocar un sobre
abre el importe.
