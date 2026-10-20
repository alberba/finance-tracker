# finanzas. — Style Reference

> neón de garaje: taller a oscuras, una lámpara naranja sobre el banco

**Theme:** dark por defecto · cuatro temas seleccionables: oscuro suave (por defecto en oscuro), oscuro fuerte, claro hueso y claro melocotón (por defecto en claro)

Fuente: canvas «Dashboard · nueva dirección» (páginas 3 App, 4 Páginas · oscuro, 6–8 alternativas; Objetivos excluido). Las medidas salen del markup de los artboards; los roles y recomendaciones son interpretación. Los ejemplos HTML son reconstrucciones. Las decisiones de la página **10 · Sistema · decisiones** del canvas están todas resueltas.

finanzas. se lee como un taller a oscuras: un fondo carbón cálido (#1B1A18) que nunca llega a negro, paneles un tono más claros separados por filetes de 1px, y un único naranja (#E8703F) que hace de lámpara: marca la acción principal, la sección activa y la línea del gráfico. Las cifras son las protagonistas y van en Unbounded, una display ancha y geométrica con tracking negativo que hace que un saldo pese como un titular; todo lo demás va en Manrope, compacta y legible. Las formas son blandas (pastillas de 999px, tarjetas de 22px) pero el tono es de informe financiero: colores de ganancia y pérdida apagados, barras neutras, nada que parezca un juego. El movimiento es corto y con freno: los bloques suben 14px al entrar, escalonados 70ms, y las hojas llegan desde abajo.

## Tokens — Colores

Valores del tema por defecto (oscuro suave). Los otros tres temas redefinen los mismos tokens: ver **Temas**.

| Name               | Value                 | Token                                               | Role                                                                                                      |
| ------------------ | --------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Carbón             | `#1B1A18`             | `--color-bg`                                        | Lienzo de la página y del área principal                                                                  |
| Carbón hondo       | `#171614`             | `--color-side`                                      | Fondo de la barra lateral, un paso más oscuro que el lienzo                                               |
| Filete lateral     | `#2B2926`             | `--color-side-line`                                 | Borde derecho de la barra lateral                                                                         |
| Panel              | `#232220`             | `--color-panel`                                     | Superficie de tarjetas, popovers, hojas y paneles laterales                                               |
| Panel 2            | `#2C2B28`             | `--color-panel2`                                    | Superficie hundida: pistas de segmentado, tickers, item de nav activo, tiles rellenos                     |
| Filete             | `#33312E`             | `--color-line`                                      | Borde de tarjeta, separador de fila, pista de barra de progreso                                           |
| Rejilla            | `#3A3834`             | `--color-grid`                                      | Líneas de rejilla de gráficos                                                                             |
| Filete de control  | `#47443F`             | `--color-ctrl-line`                                 | Borde de chips, búsqueda y campos                                                                         |
| Hueso              | `#E6E1D7`             | `--color-text`                                      | Texto principal                                                                                           |
| Hueso suave        | `#C4BEB3`             | `--color-soft`                                      | Lede, texto de chip en reposo, texto de la barra lateral                                                  |
| Gris piedra        | `#9B958A`             | `--color-muted`                                     | Etiquetas, metadatos, notas, ejes                                                                         |
| Gris tenue         | `#8A857C`             | `--color-faint`                                     | Lo menos importante: pies de nota, línea de plan discontinua                                              |
| Lámpara            | `#E8703F`             | `--color-accent`                                    | Acción principal, sección activa, línea de gráfico, foco, punto de la marca. El único color con intención |
| Sobre lámpara      | `#1B1A18`             | `--color-on-accent`                                 | Texto sobre `--color-accent`                                                                              |
| Lámpara como texto | `#E8703F`             | `--color-accent-text`                               | El acento cuando es texto (enlace, nav activo); en los temas claros se oscurece para contrastar           |
| Verde salvia       | `#86CFA5`             | `--color-gain`                                      | Ganancias y deltas positivos, solo en texto                                                               |
| Rosa arcilla       | `#E99383`             | `--color-loss`                                      | Pérdidas, deltas negativos, acciones destructivas                                                         |
| Lila               | `#ABA0E6`             | `--color-lilac`                                     | Serie secundaria de gráficos y reparto (inversión)                                                        |
| Lila 2             | `#867BCB`             | `--color-lilac2`                                    | Segundo tono de la serie lila                                                                             |
| Lila 3             | `#625AA0`             | `--color-lilac3`                                    | Tercer tono de la serie lila                                                                              |
| Melocotón          | `#E8B79C`             | `--color-peach`                                     | Serie cálida secundaria, tono suave del acento en repartos                                                |
| Barra neutra       | `#6F6A62`             | `--color-neutral-bar`                               | Relleno de barras de progreso y mini-barras: el dato sin juicio                                           |
| Nav activo         | `#2C2B28` / `#E8703F` | `--color-nav-active-bg` / `--color-nav-active-text` | Fondo y texto del item de nav de la sección actual                                                        |
| Selección          | `#E6E1D7` / `#1B1A18` | `--color-sel-bg` / `--color-sel-text`               | Chip o segmento elegido: se invierte                                                                      |

## Temas

El usuario elige el tema; `oscuro-suave` es el por defecto y `claro-melocoton` el que se aplica si el sistema pide modo claro. Todos comparten tipografía, formas y movimiento: solo cambian los tokens de color, la opacidad del área y la sombra. Los temas claros usan `--color-accent-text` para todo acento que sea texto, porque el naranja de relleno no alcanza 4.5:1 sobre fondo claro.

| Token                     | Oscuro suave                  | Oscuro fuerte                  | Claro hueso                       | Claro melocotón                    |
| ------------------------- | ----------------------------- | ------------------------------ | --------------------------------- | ---------------------------------- |
| `--color-bg`              | `#1B1A18`                     | `#121110`                      | `#F1EEE8`                         | `#F7EBE2`                          |
| `--color-side`            | `#171614`                     | `#0B0A09`                      | `#F1EEE8`                         | `#F7EBE2`                          |
| `--color-side-line`       | `#2B2926`                     | `#2A2825`                      | `#E2DDD3`                         | `#EBD8CB`                          |
| `--color-panel`           | `#232220`                     | `#1C1B19`                      | `#FFFFFF`                         | `#FFFDFB`                          |
| `--color-panel2`          | `#2C2B28`                     | `#262421`                      | `#F5F2EC`                         | `#FBF1EA`                          |
| `--color-line`            | `#33312E`                     | `#2C2A26`                      | `#ECE7DF`                         | `#F1E2D7`                          |
| `--color-grid`            | `#3A3834`                     | `#2F2D29`                      | `#E6E1D8`                         | `#EDDDD1`                          |
| `--color-ctrl-line`       | `#47443F`                     | `#3A3833`                      | `#D6D0C5`                         | `#E3CDBF`                          |
| `--color-text`            | `#E6E1D7`                     | `#F2EEE6`                      | `#1C1B19`                         | `#2A1A12`                          |
| `--color-soft`            | `#C4BEB3`                     | `#CFCAC0`                      | `#3F3C37`                         | `#4D3A30`                          |
| `--color-muted`           | `#9B958A`                     | `#A39E94`                      | `#6B665D`                         | `#7A6458`                          |
| `--color-faint`           | `#8A857C`                     | `#8C877E`                      | `#736E65`                         | `#7F6A5F`                          |
| `--color-accent`          | `#E8703F`                     | `#FF5A1F`                      | `#E8703F`                         | `#F0652B`                          |
| `--color-on-accent`       | `#1B1A18`                     | `#121110`                      | `#1C1B19`                         | `#2A1A12`                          |
| `--color-accent-text`     | `#E8703F`                     | `#FF5A1F`                      | `#A8431A`                         | `#A8401A`                          |
| `--color-gain`            | `#86CFA5`                     | `#6EDC9F`                      | `#1F7A4C`                         | `#1E7A4E`                          |
| `--color-loss`            | `#E99383`                     | `#FF8875`                      | `#B8392A`                         | `#B8392A`                          |
| `--color-lilac`           | `#ABA0E6`                     | `#B7A3FF`                      | `#6A5BC4`                         | `#6A5BC4`                          |
| `--color-lilac2`          | `#867BCB`                     | `#8C76F0`                      | `#9C91DC`                         | `#A196E0`                          |
| `--color-lilac3`          | `#625AA0`                     | `#5E4BB8`                      | `#4C3F99`                         | `#4C3F99`                          |
| `--color-peach`           | `#E8B79C`                     | `#FFB896`                      | `#F2BC9C`                         | `#F7BC98`                          |
| `--color-neutral-bar`     | `#6F6A62`                     | `#8C877E`                      | `#C9C3B8`                         | `#D9C4B6`                          |
| `--color-nav-active-bg`   | `#2C2B28`                     | `#FF5A1F`                      | `#FBE1D3`                         | `#F0652B`                          |
| `--color-nav-active-text` | `#E8703F`                     | `#121110`                      | `#8E3510`                         | `#2A1A12`                          |
| `--color-sel-bg`          | `#E6E1D7`                     | `#F2EEE6`                      | `#FBE1D3`                         | `#FFE0CE`                          |
| `--color-sel-text`        | `#1B1A18`                     | `#121110`                      | `#8E3510`                         | `#8E3510`                          |
| `--color-sel-border`      | `#E6E1D7`                     | `#F2EEE6`                      | `#F2C2A8`                         | `#F7C3A6`                          |
| `--area-opacity`          | `0.12`                        | `0.14`                         | `0.16`                            | `0.18`                             |
| `--shadow-float`          | `0 24px 60px rgba(0,0,0,0.5)` | `0 24px 60px rgba(0,0,0,0.55)` | `0 20px 50px rgba(60,40,20,0.14)` | `0 22px 50px rgba(140,70,30,0.16)` |

Oscuro fuerte es la variante de alto contraste: el nav activo y la caja de alta rápida se rellenan de naranja con texto carbón.

## Tokens — Tipografía

### Unbounded — display ancha para títulos de página y todas las cifras. Geométrica, de caja ancha, con tracking negativo creciente con el tamaño (-0.02em en cifras de bloque, -0.03em en títulos, -0.035/-0.04em en cifras grandes). Pesos 600 para cifras, 700 para títulos, botón primario y cifra protagonista, 800 solo para la marca. · `--font-display`

- **Substitute:** Lexend
- **Weights:** 600, 700, 800
- **Sizes:** 14px, 15px, 16px, 17px, 18px, 20px, 22px, 24px, 30px, 32px, 38px, 40px, 44px, 56px
- **Line height:** 1.00, 1.05, 1.10, 1.15, 1.20
- **Letter spacing:** -0.04em a 34–44px, -0.035em en la cifra protagonista, -0.03em en títulos y marca, -0.02em en cifras de bloque, normal en cifras de fila y botones
- **OpenType features:** `"tnum"` (`font-variant-numeric: tabular-nums`)
- **Role:** display ancha para títulos de página y todas las cifras.

### Manrope — sans de texto para todo lo que no es título de página ni cifra: lede, etiquetas, títulos de bloque, nav, chips, campos, botones de texto. Trabaja en pesos altos: 700 para texto de fila, 800 para títulos de bloque, etiquetas en mayúsculas, chips y deltas; 400 solo en párrafos. · `--font-sans`

- **Substitute:** Plus Jakarta Sans
- **Weights:** 400, 600, 700, 800
- **Sizes:** 11px, 12px, 13px, 14px, 15px, 16px, 18px
- **Line height:** 1.30, 1.45
- **Letter spacing:** 0.08em en etiquetas en mayúsculas, normal en el resto
- **Role:** texto, etiquetas y controles.

### Mono del sistema — solo para tickers de inversión (`VWCE`, `IWDA`). · `--font-mono`

- **Stack:** `ui-monospace, 'SF Mono', Menlo, monospace`
- **Weights:** 700
- **Sizes:** 13px
- **Letter spacing:** 0.04em

### Type Scale

| Role               | Family    | Weight   | Size                                     | Line Height | Letter Spacing | Token                 |
| ------------------ | --------- | -------- | ---------------------------------------- | ----------- | -------------- | --------------------- |
| marca              | Unbounded | 800      | 24px (móvil 20px)                        | —           | -0.03em        | `--text-brand`        |
| h1                 | Unbounded | 700      | `clamp(30px, 3.2cqi, 44px)` (móvil 30px) | 1.1         | -0.03em        | `--text-h1`           |
| h1-detalle         | Unbounded | 700      | 22px                                     | 1.15        | -0.03em        | `--text-h1-detail`    |
| lede               | Manrope   | 400      | 16px (móvil 15px)                        | 1.45        | —              | `--text-lede`         |
| título de bloque   | Manrope   | 800      | 18px                                     | 1.45        | —              | `--text-block-title`  |
| etiqueta           | Manrope   | 800      | 12px, mayúsculas                         | 1.45        | 0.08em         | `--text-label`        |
| cuerpo             | Manrope   | 400      | 16px                                     | 1.45        | —              | `--text-body`         |
| texto de fila      | Manrope   | 700      | 16px (15px en listas densas)             | 1.45        | —              | `--text-row`          |
| nota               | Manrope   | 400      | 14px                                     | 1.45        | —              | `--text-note`         |
| meta               | Manrope   | 400      | 13px                                     | 1.45        | —              | `--text-meta`         |
| delta              | Manrope   | 800      | 14px                                     | 1.45        | —              | `--text-delta`        |
| nav móvil          | Manrope   | 800      | 11px                                     | —           | —              | `--text-tab`          |
| cifra de fila      | Unbounded | 600      | 16px (15–17px)                           | 1.2         | normal         | `--text-figure-row`   |
| cifra de bloque    | Unbounded | 600      | 20–22px                                  | 1.2         | -0.02em        | `--text-figure-block` |
| cifra principal    | Unbounded | 600      | `clamp(34px, 3.4cqi, 44px)`              | 1           | -0.04em        | `--text-figure-lg`    |
| cifra protagonista | Unbounded | 700      | 56px (móvil 38px)                        | 1.05        | -0.035em       | `--text-figure-hero`  |
| céntimos           | (hereda)  | (hereda) | 0.42em                                   | —           | -0.02em        | `--text-cents`        |

## Tokens — Espaciado y formas

**Base unit:** 2px (los gaps de bloque usan 2, 3, 4, 6, 8, 10, 12, 14, 16, 20, 24; no es una rejilla de 8)

**Density:** comfortable; botones y campos a 44px o más, chips y segmentos compactos a 36–38px

### Spacing Scale

| Name | Value | Token        |
| ---- | ----- | ------------ |
| 2    | 2px   | `--space-2`  |
| 4    | 4px   | `--space-4`  |
| 6    | 6px   | `--space-6`  |
| 8    | 8px   | `--space-8`  |
| 10   | 10px  | `--space-10` |
| 12   | 12px  | `--space-12` |
| 14   | 14px  | `--space-14` |
| 16   | 16px  | `--space-16` |
| 20   | 20px  | `--space-20` |
| 24   | 24px  | `--space-24` |
| 32   | 32px  | `--space-32` |
| 40   | 40px  | `--space-40` |

### Border Radius

| Element                                     | Value |
| ------------------------------------------- | ----- |
| botones, chips, segmentados, barras, badges | 999px |
| tarjetas                                    | 22px  |
| popovers y flotantes                        | 20px  |
| tile relleno                                | 18px  |
| campos, item de nav, tile de categoría      | 14px  |
| caja de icono, ticker, badge de mes         | 8px   |
| hoja inferior (arriba)                      | 24px  |
| icono circular, avatar, punto               | 50%   |

### Layout

- **Page max-width:** 1640px
- **Sidebar:** 236px, `padding: 28px 16px`, `gap: 32px`
- **Main padding:** `clamp(18px, 2.6cqi, 36px) clamp(16px, 2.6cqi, 40px) 40px`
- **Column gap:** 20px
- **Card padding:** 22px 24px (móvil 16px 12px)
- **Element gap:** 12px
- **Row height:** 64px
- **Control height:** 44px

## Components

### Botón primario

**Role:** la acción principal de la pantalla

Fondo `--color-accent`, texto `--color-on-accent`, Unbounded 700 a 14px, `border-radius: 999px`, `min-height: 44px`, `padding: 0 22px`, sin borde. Uno por vista; en la hoja de alta ocupa todo el ancho.

### Botón secundario

**Role:** acciones que acompañan a la principal (Editar, Descartar, Cancelar, Limpiar filtros)

Texto subrayado, sin fondo ni borde: Manrope 800 a 14px, `color: --color-text`, `text-decoration: underline; text-underline-offset: 4px`, `min-height: 44px; padding: 0 16px; border-radius: 999px` (el radio solo se ve en el anillo de foco). Junto al primario, el secundario no compite: se lee como enlace.

### Botón de icono

**Role:** acción sin etiqueta (cerrar, atrás, más)

Círculo de 44px (`border-radius: 50%`), `1px solid --color-ctrl-line` o fondo `--color-panel2`, icono de 20px. Lleva `aria-label`.

### FAB

**Role:** «Apuntar» en móvil

Círculo de 58px, fondo `--color-accent`, `box-shadow: 0 0 0 5px var(--color-bg)` para recortarlo sobre la barra inferior.

### Item de nav lateral

**Role:** navegación entre secciones en escritorio

`min-height: 46px; padding: 0 14px; gap: 12px; border-radius: 14px`, Manrope 15px, peso 600 en reposo y 700 activo, icono de 20px. Activo: fondo `--color-nav-active-bg`, texto `--color-nav-active-text`, `aria-current="page"`.

### Barra inferior móvil

**Role:** navegación de secciones en móvil

`padding: 8px 8px 14px`, fondo `--color-bg`; cada ítem `min-height: 52px; gap: 3px`, icono encima y etiqueta Manrope 800 a 11px. El activo se pinta en `--color-accent-text`.

### Tarjeta

**Role:** contenedor de cada bloque de contenido

Fondo `--color-panel`, `1px solid --color-line`, `border-radius: 22px`, `padding: 22px 24px` (móvil `16px 12px`), `gap: 14px`, sin sombra. Título de bloque arriba, contenido debajo.

### Popover

**Role:** lista corta flotante («Por confirmar», selector de rango)

Fondo `--color-panel`, `1px solid --color-line`, `border-radius: 20px`, `padding: 16px`, `box-shadow: var(--shadow-float)`, `width: min(340px, calc(100cqi - 24px))`. Entra con `anim-pop`.

### Hoja / panel de alta

**Role:** alta y edición de un movimiento

Escritorio: panel lateral de 380px. Móvil: hoja inferior con radio superior de 24px, agarre de 44×5px en `--color-line`, velo `oklch(0% none none / 0.42)`. Entra con `anim-sheet`. El importe va en Unbounded 700 a 32px sobre un subrayado de `2px solid --color-ctrl-line`; el resto de campos son cajas.

### Panel de detalle

**Role:** detalle o edición de un elemento de la sección (categoría del presupuesto, objetivo, plan del año)

Escritorio: panel lateral a toda altura pegado a la derecha, `width: min(460px, 100%)`, fondo `--color-panel`, `border-inline-start: 1px solid --color-line`, `box-shadow: var(--shadow-float)`. Es más ancho que el alta porque lleva historial y gráficos. Todos los paneles de detalle miden lo mismo, sea cual sea la sección. Móvil: hoja inferior como la del alta, con `max-height: 88%`. Entra con `anim-sheet`.

### Chip de filtro

**Role:** filtros y opciones excluyentes en fila

`min-height: 38px; padding: 0 14px; border: 1px solid --color-ctrl-line; border-radius: 999px`, Manrope 800 a 13px, texto `--color-soft`. Seleccionado: fondo y borde `--color-sel-bg`, texto `--color-sel-text`.

### Segmentado

**Role:** 2–4 opciones excluyentes (Gastos / Ingresos / Inversión, 3M / 6M / 1A)

Pista `display: flex; padding: 3px; gap: 3px; background: --color-panel2; border-radius: 999px`. Segmento `min-height: 36px; padding: 0 8px; border-radius: 999px`, Manrope 800 a 14px; activo con fondo `--color-sel-bg` y texto `--color-sel-text`.

### Delta

**Role:** variación junto a una cifra

Texto sin fondo: Manrope 800 a 14px en `--color-gain` o `--color-loss`, con signo explícito (`+18,4 %`, `−2,1 %`). Va en la misma línea que la cifra, separado 12px.

### Etiqueta

**Role:** encabezado de grupo y de columna, kicker sobre un título

Manrope 800 a 12px, `text-transform: uppercase; letter-spacing: 0.08em`, `color: --color-muted`. Las fechas sobre el H1 («Jueves, 9 de octubre») usan el mismo estilo.

### Ticker

**Role:** símbolo de un activo de inversión

Mono 700 a 13px, `letter-spacing: 0.04em`, `padding: 2px 8px`, `border-radius: 8px`, fondo `--color-panel2`.

### Fila de libro mayor

**Role:** cada elemento de una lista de datos (movimientos, cuentas, posiciones)

`min-height: 64px; padding: 10px 0; gap: 12px`, `border-top: 1px solid --color-line`. Izquierda: icono de categoría en círculo de 40px, texto de fila (Manrope 700 16px) y meta (13px muted, una línea con elipsis). Derecha: cifra de fila Unbounded 600, alineada a la derecha y `tabular-nums`. Seleccionada: `box-shadow: inset 3px 0 0 --color-accent`. Recién apuntada: `anim-fresh`.

### Campo

**Role:** entrada de texto en formularios

Caja `min-height: 46px; padding: 0 14px; border: 1px solid --color-ctrl-line; border-radius: 14px; background: --color-panel`, Manrope 700 a 16px; etiqueta encima en 13px 700 muted, separada 6px. La búsqueda es una pastilla de 46px (`padding: 0 18px; border-radius: 999px`) con icono a la izquierda. El importe de la hoja de alta es la única excepción: subrayado, ver **Hoja**.

### Barra de progreso

**Role:** consumo frente a un límite, peso en una cartera

Pista `height: 6px; border-radius: 999px; background: --color-line`; relleno `--color-neutral-bar`. Solo pasa a `--color-loss` cuando se sale del límite.

### Gráfico de evolución

**Role:** serie temporal (patrimonio, cartera)

Línea `stroke: --color-accent; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round` con `vector-effect: non-scaling-stroke`. Área con degradado vertical del acento: `stop-opacity` 0.42 arriba, 0.14 al 55 %, 0 abajo. Rejilla horizontal en `--color-grid` a 1px. La línea de plan o límite es `1px dashed --color-faint`. Ejes en Manrope 12px `--color-muted`.

### Estado vacío

**Role:** bloque sin datos

`border: 1px dashed --color-line; border-radius: 22px; padding: 22px 24px`, una nota en 14px muted y, si aplica, un botón secundario.

## Do's and Don'ts

### Do

- Usa `--color-bg` como lienzo y `--color-panel` para tarjetas: la profundidad sale del paso de un tono, con un filete de 1px en `--color-line`
- Reserva `--color-accent` para una acción principal por vista, la sección activa, la línea del gráfico y el foco; cuando el acento es texto, usa `--color-accent-text`
- Pon toda cifra en Unbounded con `tabular-nums`, formateada con `format.ts`: miles con punto, coma decimal, `−` tipográfico y espacio antes de `€` y `%`
- Aplica tracking negativo a Unbounded en proporción al tamaño (normal en cifras de fila, -0.02em en cifras de bloque, -0.03em en títulos, -0.035/-0.04em en cifras grandes); Manrope va a tracking normal salvo en etiquetas
- Mantén las formas en dos familias: pastilla (999px) para controles y radio 22px para contenedores
- Pinta ganancias y pérdidas con `--color-gain` / `--color-loss` solo en texto; las barras de dato van en `--color-neutral-bar`
- Da a botones y campos al menos 44px de alto
- Anima con `anim-rise` escalonado (70ms por bloque) al entrar y respeta `prefers-reduced-motion`
- Escribe títulos en tipo frase («Gasto por categoría»); las mayúsculas son solo para etiquetas de 12px con tracking de 0.08em

### Don't

- No uses negro puro ni blanco puro como texto o lienzo oscuro: el lienzo es carbón cálido y el texto es hueso
- No añadas sombra a las tarjetas; la sombra es solo para lo que flota (popover, hoja)
- No uses el naranja como fondo de bloque ni para decorar: un segundo uso compite con la acción principal
- No pongas cifras en Manrope ni títulos de bloque en Unbounded: Unbounded es para H1 y números
- No metas la variación en una pastilla: el delta es texto de color junto a la cifra
- No uses rayas de días, barras de progreso de colores ni marcadores llamativos: el tono es de informe financiero
- No uses degradados de fondo; el único degradado del sistema es el área bajo la línea del gráfico

## Surfaces

Valores del tema por defecto; los demás temas mantienen los mismos niveles.

| Level | Name          | Value     | Purpose                                                       |
| ----- | ------------- | --------- | ------------------------------------------------------------- |
| -1    | Barra lateral | `#171614` | Navegación, un paso por debajo del lienzo                     |
| 0     | Lienzo        | `#1B1A18` | Fondo de la página                                            |
| 1     | Panel         | `#232220` | Tarjetas, popovers, hojas                                     |
| 2     | Panel hundido | `#2C2B28` | Pistas, tickers, tiles rellenos, nav activo                   |
| 3     | Selección     | `#E6E1D7` | Chip o segmento elegido: se invierte a hueso con texto carbón |

## Elevation

- **Popover / hoja:** `var(--shadow-float)` (oscuro suave: `0 24px 60px rgba(0, 0, 0, 0.5)`)
- **Hoja inferior (móvil):** `0 -20px 60px -20px rgb(0 0 0 / 0.6)`
- **FAB sobre la barra:** `0 0 0 5px var(--color-bg)` (anillo de recorte, no sombra)
- **Fila seleccionada:** `inset 3px 0 0 var(--color-accent)`

## Iconografía

Iconos de línea propios, sin relleno: `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="2"` en todos los tamaños, `stroke-linecap="round"`, `stroke-linejoin="round"`, siempre `aria-hidden="true"` salvo que el icono sea el único contenido del botón. Tamaño por defecto 20px; chevrones a 14–18px; iconos de cabecera a 22–26px. Los iconos de categoría (Súper, Comer fuera, Transporte…) van dentro de un círculo de 40–44px en `--color-panel2`. No hay ilustraciones, fotos ni emoji.

## Layout

Escritorio: fila con la barra lateral fija de 236px (marca `finanzas.` con el punto en naranja, secciones arriba, Datos y Configuración abajo) y el área principal fluida con `max-width: 1640px` centrado. Cada sección abre con la etiqueta de fecha, H1 en Unbounded y una línea de lede; debajo, una rejilla de dos columnas (contenido principal y aside de resumen) con `gap: 20px`. La raíz es `container-type: inline-size` y los tamaños fluidos usan `cqi`; no hay breakpoints por ancho: la vista la decide el dispositivo (`escritorio` / `movil`). Móvil: cabecera con título, contenido en una columna, barra inferior con FAB central y hojas inferiores para alta y detalle.

## Números

- Dinero: `−1.234,56 €` (U+2212, punto de miles, coma decimal, espacio y €, dos decimales siempre).
- Porcentaje: `+18,4 %`, siempre con signo y un decimal.
- En cifras grandes los céntimos bajan a 0.42em en `--color-muted`.
- Columnas de importes alineadas a la derecha con `tabular-nums`.

## Agent Prompt Guide

### Quick Color Reference

- text: #E6E1D7 (secundario #C4BEB3, etiquetas #9B958A)
- background: #1B1A18
- card surface: #232220 (hundido #2C2B28)
- border: #33312E (controles #47443F)
- primary action: #E8703F con texto #1B1A18
- gain / loss: #86CFA5 / #E99383
- temas claros: ver **Temas**; el acento como texto pasa a #A8431A (hueso) o #A8401A (melocotón)

### Example Component Prompts

1. **Cabecera de sección**: sobre #1B1A18, etiqueta «JUEVES, 9 DE OCTUBRE» en Manrope 800 12px, mayúsculas, letter-spacing 0.08em, #9B958A; debajo H1 «Movimientos» en Unbounded 700 `clamp(30px, 3.2cqi, 44px)`, line-height 1.1, letter-spacing -0.03em, #E6E1D7; lede «Lo que entra, lo que sale y lo que inviertes, mes a mes.» en Manrope 16px #C4BEB3.
2. **Tarjeta de bloque**: fondo #232220, borde 1px #33312E, radio 22px, padding 22px 24px, gap 14px. Título «Gasto por categoría» en Manrope 800 18px. Filas con barra de 6px (pista #33312E, relleno #6F6A62) e importe en Unbounded 600 16px alineado a la derecha.
3. **Cifra protagonista**: «148.320» en Unbounded 700 56px, line-height 1.05, letter-spacing -0.035em, #E6E1D7, con «,57 €» a 0.42em en #9B958A; en la misma línea, a 12px, el delta «+18,4 %» en Manrope 800 14px #86CFA5, sin fondo.
4. **Barra de acciones**: botón primario «Guardar» (fondo #E8703F, texto #1B1A18, Unbounded 700 14px, min-height 44px, padding 0 22px, radio 999px) y a su lado «Cancelar» como texto subrayado (Manrope 800 14px #E6E1D7, underline con offset 4px, sin fondo ni borde, mismo alto).
5. **Fila de movimiento**: min-height 64px, padding 10px 0, borde superior 1px #33312E; círculo de 40px #2C2B28 con icono de 20px trazo 2; «Mercadona» en Manrope 700 16px y «Súper · hoy» en 13px #9B958A; a la derecha «−64,32 €» en Unbounded 600 16px tabular.

## Motion

| Nombre       | De                                         | Duración | Curva                            | Uso                                                |
| ------------ | ------------------------------------------ | -------- | -------------------------------- | -------------------------------------------------- |
| `anim-rise`  | `opacity: 0; translateY(14px)`             | 520ms    | `cubic-bezier(0.22, 1, 0.36, 1)` | Entrada de bloques, `delay: calc(var(--i) * 70ms)` |
| `anim-sheet` | `opacity: 0; translateY(48px)`             | 380ms    | `cubic-bezier(0.32, 0.72, 0, 1)` | Hojas y paneles                                    |
| `anim-pop`   | `opacity: 0; scale(0.96) translateY(-6px)` | 220ms    | `cubic-bezier(0.22, 1, 0.36, 1)` | Popovers, origen arriba a la derecha               |
| `anim-fade`  | `opacity: 0`                               | 260ms    | `ease-out`                       | Velos                                              |
| `anim-fresh` | `background-color: var(--flash)`           | 1800ms   | `ease-out`                       | Fila recién apuntada                               |
| `.press`     | `scale(0.96)` al pulsar                    | 140ms    | `ease-out`                       | Todo control pulsable                              |

Todo dentro de `@media (prefers-reduced-motion: no-preference)`. Foco: `outline: 2px solid var(--color-accent)` en `:focus-visible`. Hover solo en `@media (hover: hover) and (pointer: fine)`.

## Quick Start

### CSS Custom Properties

```css
:root,
[data-theme='oscuro-suave'] {
  /* Colors */
  --color-bg: #1b1a18;
  --color-side: #171614;
  --color-side-line: #2b2926;
  --color-panel: #232220;
  --color-panel2: #2c2b28;
  --color-line: #33312e;
  --color-grid: #3a3834;
  --color-ctrl-line: #47443f;
  --color-text: #e6e1d7;
  --color-soft: #c4beb3;
  --color-muted: #9b958a;
  --color-faint: #8a857c;
  --color-accent: #e8703f;
  --color-on-accent: #1b1a18;
  --color-accent-text: #e8703f;
  --color-gain: #86cfa5;
  --color-loss: #e99383;
  --color-lilac: #aba0e6;
  --color-lilac2: #867bcb;
  --color-lilac3: #625aa0;
  --color-peach: #e8b79c;
  --color-neutral-bar: #6f6a62;
  --color-nav-active-bg: #2c2b28;
  --color-nav-active-text: #e8703f;
  --color-sel-bg: #e6e1d7;
  --color-sel-text: #1b1a18;
  --color-sel-border: #e6e1d7;
  --area-opacity: 0.12;
  --shadow-float: 0 24px 60px rgba(0, 0, 0, 0.5);
  color-scheme: dark;
}

[data-theme='oscuro-fuerte'] {
  --color-bg: #121110;
  --color-side: #0b0a09;
  --color-side-line: #2a2825;
  --color-panel: #1c1b19;
  --color-panel2: #262421;
  --color-line: #2c2a26;
  --color-grid: #2f2d29;
  --color-ctrl-line: #3a3833;
  --color-text: #f2eee6;
  --color-soft: #cfcac0;
  --color-muted: #a39e94;
  --color-faint: #8c877e;
  --color-accent: #ff5a1f;
  --color-on-accent: #121110;
  --color-accent-text: #ff5a1f;
  --color-gain: #6edc9f;
  --color-loss: #ff8875;
  --color-lilac: #b7a3ff;
  --color-lilac2: #8c76f0;
  --color-lilac3: #5e4bb8;
  --color-peach: #ffb896;
  --color-neutral-bar: #8c877e;
  --color-nav-active-bg: #ff5a1f;
  --color-nav-active-text: #121110;
  --color-sel-bg: #f2eee6;
  --color-sel-text: #121110;
  --color-sel-border: #f2eee6;
  --area-opacity: 0.14;
  --shadow-float: 0 24px 60px rgba(0, 0, 0, 0.55);
  color-scheme: dark;
}

[data-theme='claro-hueso'] {
  --color-bg: #f1eee8;
  --color-side: #f1eee8;
  --color-side-line: #e2ddd3;
  --color-panel: #ffffff;
  --color-panel2: #f5f2ec;
  --color-line: #ece7df;
  --color-grid: #e6e1d8;
  --color-ctrl-line: #d6d0c5;
  --color-text: #1c1b19;
  --color-soft: #3f3c37;
  --color-muted: #6b665d;
  --color-faint: #736e65;
  --color-accent: #e8703f;
  --color-on-accent: #1c1b19;
  --color-accent-text: #a8431a;
  --color-gain: #1f7a4c;
  --color-loss: #b8392a;
  --color-lilac: #6a5bc4;
  --color-lilac2: #9c91dc;
  --color-lilac3: #4c3f99;
  --color-peach: #f2bc9c;
  --color-neutral-bar: #c9c3b8;
  --color-nav-active-bg: #fbe1d3;
  --color-nav-active-text: #8e3510;
  --color-sel-bg: #fbe1d3;
  --color-sel-text: #8e3510;
  --color-sel-border: #f2c2a8;
  --area-opacity: 0.16;
  --shadow-float: 0 20px 50px rgba(60, 40, 20, 0.14);
  color-scheme: light;
}

[data-theme='claro-melocoton'] {
  --color-bg: #f7ebe2;
  --color-side: #f7ebe2;
  --color-side-line: #ebd8cb;
  --color-panel: #fffdfb;
  --color-panel2: #fbf1ea;
  --color-line: #f1e2d7;
  --color-grid: #edddd1;
  --color-ctrl-line: #e3cdbf;
  --color-text: #2a1a12;
  --color-soft: #4d3a30;
  --color-muted: #7a6458;
  --color-faint: #7f6a5f;
  --color-accent: #f0652b;
  --color-on-accent: #2a1a12;
  --color-accent-text: #a8401a;
  --color-gain: #1e7a4e;
  --color-loss: #b8392a;
  --color-lilac: #6a5bc4;
  --color-lilac2: #a196e0;
  --color-lilac3: #4c3f99;
  --color-peach: #f7bc98;
  --color-neutral-bar: #d9c4b6;
  --color-nav-active-bg: #f0652b;
  --color-nav-active-text: #2a1a12;
  --color-sel-bg: #ffe0ce;
  --color-sel-text: #8e3510;
  --color-sel-border: #f7c3a6;
  --area-opacity: 0.18;
  --shadow-float: 0 22px 50px rgba(140, 70, 30, 0.16);
  color-scheme: light;
}

:root {
  /* Typography — Font Families */
  --font-display: 'Unbounded', ui-sans-serif, system-ui, sans-serif;
  --font-sans: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  --font-mono: ui-monospace, 'SF Mono', Menlo, monospace;

  /* Typography — Scale */
  --text-brand: 24px;
  --tracking-brand: -0.03em;
  --text-h1: clamp(30px, 3.2cqi, 44px);
  --leading-h1: 1.1;
  --tracking-h1: -0.03em;
  --text-h1-detail: 22px;
  --text-lede: 16px;
  --text-block-title: 18px;
  --text-label: 12px;
  --tracking-label: 0.08em;
  --text-body: 16px;
  --leading-body: 1.45;
  --text-row: 16px;
  --text-note: 14px;
  --text-meta: 13px;
  --text-delta: 14px;
  --text-tab: 11px;
  --text-figure-row: 16px;
  --text-figure-block: 22px;
  --tracking-figure-block: -0.02em;
  --text-figure-lg: clamp(34px, 3.4cqi, 44px);
  --tracking-figure-lg: -0.04em;
  --text-figure-hero: 56px;
  --leading-figure-hero: 1.05;
  --tracking-figure-hero: -0.035em;
  --text-cents: 0.42em;

  /* Typography — Weights */
  --font-weight-regular: 400;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
  --font-weight-extrabold: 800;

  /* Spacing */
  --space-2: 2px;
  --space-4: 4px;
  --space-6: 6px;
  --space-8: 8px;
  --space-10: 10px;
  --space-12: 12px;
  --space-14: 14px;
  --space-16: 16px;
  --space-20: 20px;
  --space-24: 24px;
  --space-32: 32px;
  --space-40: 40px;

  /* Layout */
  --page-max-width: 1640px;
  --sidebar-width: 236px;
  --column-gap: 20px;
  --card-padding: 22px 24px;
  --card-padding-mobile: 16px 12px;
  --row-height: 64px;
  --control-height: 44px;
  --chip-height: 38px;
  --segment-height: 36px;

  /* Border Radius */
  --radius-ticker: 8px;
  --radius-field: 14px;
  --radius-tile: 18px;
  --radius-popover: 20px;
  --radius-card: 22px;
  --radius-sheet: 24px;
  --radius-pill: 999px;

  /* Elevation */
  --shadow-sheet: 0 -20px 60px -20px rgb(0 0 0 / 0.6);

  /* Icons */
  --icon-stroke: 2;

  /* Motion */
  --ease-out-expo: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-sheet: cubic-bezier(0.32, 0.72, 0, 1);
  --duration-rise: 520ms;
  --duration-sheet: 380ms;
  --duration-pop: 220ms;
  --stagger: 70ms;
}
```

### Tailwind v4

Los valores de `@theme` son los del tema por defecto. Las utilidades de Tailwind v4 leen `var(--color-*)`, así que los bloques `[data-theme="…"]` de arriba las cambian en tiempo de ejecución sin tocar este bloque.

```css
@theme {
  /* Colors */
  --color-bg: #1b1a18;
  --color-side: #171614;
  --color-side-line: #2b2926;
  --color-panel: #232220;
  --color-panel2: #2c2b28;
  --color-line: #33312e;
  --color-grid: #3a3834;
  --color-ctrl-line: #47443f;
  --color-text: #e6e1d7;
  --color-soft: #c4beb3;
  --color-muted: #9b958a;
  --color-faint: #8a857c;
  --color-accent: #e8703f;
  --color-on-accent: #1b1a18;
  --color-accent-text: #e8703f;
  --color-gain: #86cfa5;
  --color-loss: #e99383;
  --color-lilac: #aba0e6;
  --color-lilac2: #867bcb;
  --color-lilac3: #625aa0;
  --color-peach: #e8b79c;
  --color-neutral-bar: #6f6a62;
  --color-sel-bg: #e6e1d7;
  --color-sel-text: #1b1a18;

  /* Typography */
  --font-display: 'Unbounded', ui-sans-serif, system-ui, sans-serif;
  --font-sans: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  --font-mono: ui-monospace, 'SF Mono', Menlo, monospace;

  /* Typography — Scale */
  --text-h1: clamp(30px, 3.2cqi, 44px);
  --text-h1--line-height: 1.1;
  --text-h1--letter-spacing: -0.03em;
  --text-lede: 16px;
  --text-block-title: 18px;
  --text-label: 12px;
  --text-label--letter-spacing: 0.08em;
  --text-row: 16px;
  --text-note: 14px;
  --text-meta: 13px;
  --text-delta: 14px;
  --text-tab: 11px;
  --text-figure-row: 16px;
  --text-figure-block: 22px;
  --text-figure-block--letter-spacing: -0.02em;
  --text-figure-lg: clamp(34px, 3.4cqi, 44px);
  --text-figure-lg--letter-spacing: -0.04em;
  --text-figure-hero: 56px;
  --text-figure-hero--line-height: 1.05;
  --text-figure-hero--letter-spacing: -0.035em;

  /* Spacing */
  --spacing: 2px;

  /* Border Radius */
  --radius-ticker: 8px;
  --radius-field: 14px;
  --radius-tile: 18px;
  --radius-popover: 20px;
  --radius-card: 22px;
  --radius-sheet: 24px;
  --radius-pill: 999px;

  /* Shadows */
  --shadow-float: 0 24px 60px rgba(0, 0, 0, 0.5);
  --shadow-sheet: 0 -20px 60px -20px rgb(0 0 0 / 0.6);
}
```
