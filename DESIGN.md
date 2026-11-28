# finanzas. — Style Reference

> neón de garaje: taller a oscuras, una lámpara naranja sobre el banco

**Theme:** dark por defecto, con cuatro temas seleccionables (oscuro suave, oscuro fuerte, claro hueso y claro melocotón), que se eligen en Configuración › Preferencias.

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
| Gris tenue         | `#969186`             | `--color-faint`                                     | Lo menos importante: pies de nota, línea de plan discontinua                                              |
| Lámpara            | `#E8703F`             | `--color-accent`                                    | Acción principal, sección activa, línea de gráfico, foco, punto de la marca. El único color con intención |
| Sobre lámpara      | `#1B1A18`             | `--color-on-accent`                                 | Texto sobre `--color-accent`                                                                              |
| Lámpara como texto | `#E8703F`             | `--color-accent-text`                               | El acento cuando es texto (enlace, nav activo); en los temas claros se oscurece para contrastar           |
| Verde salvia       | `#86CFA5`             | `--color-gain`                                      | Ganancias y deltas positivos: en texto, o al 12 % como fondo de la pastilla de delta del inicio           |
| Rosa arcilla       | `#E99383`             | `--color-loss`                                      | Pérdidas, deltas negativos, acciones destructivas                                                         |
| Lila               | `#ABA0E6`             | `--color-lilac`                                     | Serie secundaria de gráficos y reparto (inversión)                                                        |
| Lila 2             | `#867BCB`             | `--color-lilac2`                                    | Segundo tono de la serie lila                                                                             |
| Lila 3             | `#625AA0`             | `--color-lilac3`                                    | Tercer tono de la serie lila                                                                              |
| Melocotón          | `#E8B79C`             | `--color-peach`                                     | Serie cálida secundaria, tono suave del acento en repartos                                                |
| Barra neutra       | `#6F6A62`             | `--color-neutral-bar`                               | Relleno de barras de progreso y mini-barras: el dato sin juicio                                           |
| Nav activo         | `#2C2B28` / `#E8703F` | `--color-nav-active-bg` / `--color-nav-active-text` | Fondo y texto del item de nav de la sección actual                                                        |
| Selección          | `#E6E1D7` / `#1B1A18` | `--color-sel-bg` / `--color-sel-text`               | Chip o segmento elegido: se invierte                                                                      |

## Temas

El usuario elige el tema en Configuración › Preferencias o en la puesta en marcha y se aplica al momento. Se guarda en el usuario (`user_settings.theme`), así que sus otros dispositivos lo siguen al cargar sus datos; el dispositivo guarda además una copia (`localStorage`, clave `neon-theme`) que el script previo al primer pintado aplica sin parpadeo. `oscuro-suave` es el por defecto y `claro-melocoton` el que se aplica si el sistema pide modo claro y no hay elección. Todos comparten tipografía, formas y movimiento: solo cambian los tokens de color, la opacidad del área y la sombra. Los temas claros usan `--color-accent-text` para todo acento que sea texto, porque el naranja de relleno no alcanza 4.5:1 sobre fondo claro.

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
| `--color-faint`           | `#969186`                     | `#8F8A80`                      | `#716C63`                         | `#7D675C`                          |
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

Todo texto de la tabla alcanza 4.5:1 (AA) sobre el lienzo, la barra lateral, el panel y el panel hundido de su tema; `tests/unit/styles-guards.test.ts` lo comprueba. Por eso `--color-faint` es un paso más claro (oscuros) o más oscuro (claros) que en las primeras versiones del canvas.

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
| título de tarjeta  | Manrope   | 800      | 22px en escritorio (móvil: 18px)         | 1.2         | —              | `--text-card-title`   |
| etiqueta           | Manrope   | 800      | 12px, mayúsculas                         | 1.45        | 0.08em         | `--text-label`        |
| cuerpo             | Manrope   | 400      | 16px                                     | 1.45        | —              | `--text-body`         |
| texto de fila      | Manrope   | 700      | 16px (15px en listas densas)             | 1.45        | —              | `--text-row`          |
| nota               | Manrope   | 400      | 14px                                     | 1.45        | —              | `--text-note`         |
| meta               | Manrope   | 400      | 13px                                     | 1.45        | —              | `--text-meta`         |
| delta              | Manrope   | 800      | 14px                                     | 1.45        | —              | `--text-delta`        |
| nav móvil          | Manrope   | 700–800  | 12px                                     | —           | —              | `--text-tab`          |
| cifra de fila      | Unbounded | 600      | 16px (15–17px)                           | 1.2         | normal         | `--text-figure-row`   |
| cifra de bloque    | Unbounded | 600      | 20–22px                                  | 1.2         | -0.02em        | `--text-figure-block` |
| cifra principal    | Unbounded | 600      | `clamp(34px, 3.4cqi, 44px)`              | 1           | -0.04em        | `--text-figure-lg`    |
| cifra protagonista | Unbounded | 700      | 56px (móvil 52px)                        | 1.05        | -0.035em       | `--text-figure-hero`  |
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
| hoja inferior (arriba)                      | 28px  |
| icono circular, avatar, punto               | 50%   |

### Layout

- **Page max-width:** 1640px
- **Desktop zoom:** los tamaños están pensados para el ancho completo (barra lateral y página de 1640px, unos 1920px). Por debajo, el diseño entero se aleja como el zoom del navegador (`zoom: --ui-zoom` en la raíz, ≈ ancho / 1920): 0.72 desde 981px, 0.78 desde 1440px, 0.85 desde 1600px, 0.92 desde 1760px y 1 desde 1920px; el móvil queda a 1. Como el zoom también encoge las unidades de ventana, una caja de alto completo usa `--ui-dvh` en vez de `100dvh`.
- **Sidebar:** 236px, `padding: 28px 16px`, `gap: 32px`
- **Main padding:** `clamp(18px, 2.6cqi, 36px) clamp(16px, 2.6cqi, 40px) 40px`
- **Column gap:** 20px
- **Card padding:** 32px (tarjeta estrecha 16px 12px)
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

### Botón circular de acción

**Role:** acción rápida de una sola palabra en una vista de detalle (Comprar, Vender)

Círculo (`border-radius: 50%`) solo con icono, sin texto: 64px en móvil, bajo la cifra de la vista, y 44px en escritorio, junto a la cabecera de la lista. Los iconos son los de la fila de movimientos (flecha abajo compra, flecha arriba vende). Lleva `aria-label` con la palabra («Comprar»). La acción principal de la vista va con fondo `--color-accent` e icono `--color-on-accent`; la otra, con fondo `--color-panel2` e icono `--color-text`. Sigue valiendo una acción principal por vista.

### FAB

**Role:** «Apuntar» en móvil

Círculo de 64px con fondo `--color-accent` y el icono «+» de 28px en `--color-on-accent` (`stroke-width: 2.25`), sin texto; su nombre accesible es «Apuntar». Va a la derecha de la cápsula de la barra inferior, a su misma altura y separado 8px, con su misma sombra. Pulsado, `scale(0.94)`. La hoja de alta crece desde él (ver **Alta desde «Apuntar» en móvil**).

Está en todas las secciones. Una pantalla que acopla su propia barra de acción abajo («Aplicar», «Guardar» en Presupuesto) la sustituye: el FAB se oculta mientras esa barra está en pantalla.

### Item de nav lateral

**Role:** navegación entre secciones en escritorio

`min-height: 46px; padding: 0 14px; gap: 12px; border-radius: 14px`, Manrope 15px, peso 600 en reposo y 700 activo, icono de 20px. Activo: fondo `--color-nav-active-bg`, texto `--color-nav-active-text`, `aria-current="page"`.

### Barra inferior móvil

**Role:** navegación de secciones en móvil

Cápsula flotante de 64px de alto, a 12px de los lados y 16px del borde inferior, con fondo `--color-panel`, borde `--color-line`, radio completo y sombra `0 10px 24px oklch(0% 0 none / 0.35)`. Lleva las cuatro entradas (tres secciones y «Más») como iconos de 22px dentro de una píldora de 52×40px, repartidos a partes iguales; el nombre de cada sección va solo para lectores de pantalla. En reposo, icono `--color-muted`; el activo va en `--color-text` con `aria-current="page"` y su píldora se pinta con `color-mix(in oklch, var(--color-accent) 24%, transparent)`. Esa píldora es una sola marca que se desliza al ítem activo al cambiar de sección (`translate` en 420ms, `cubic-bezier(0.32, 0.72, 0, 1)`), mientras el icono pasa a `--color-text`; sin ítem activo (Mis reportes) se desvanece, y sin movimiento cambia de sitio en el acto. Los ítems se pulsan con `scale(0.97)`. La cápsula deja a su derecha el hueco del FAB; cuando el FAB se oculta, ocupa todo el ancho.

### Barra superior móvil

**Role:** marca y acciones; cede el sitio a la cifra al desplazar

Alto de 64px, `padding: 0 8px 0 20px`, fondo `--color-bg`. Marca `finanzas.` a la izquierda y, a la derecha, botones circulares de 48px sin fondo: confirmar pendientes (con un contador de 18px en `--color-accent` cuando hay pendientes) y buscar. Pasados 120px de scroll, la barra pasa a `--color-panel`, la marca sube 6px y se desvanece, y en su lugar entra «Te quedan» con la cifra en Unbounded 600; vuelve al subir. Ambos cambios son de `opacity` y `transform` en 200ms con `--ease-out`.

Una sección puede poner su título en el sitio de la marca (Patrimonio: «Patrimonio» en Unbounded 700, 30px, `tracking -0.03em`, en su portada): la marca se oculta mientras esté y el contenido no lo repite, aunque conserva el encabezado para lectores de pantalla y foco.

La barra de estado, la de gestos y el marco del dispositivo que dibujan los artboards son del lienzo, no del producto: no se construyen.

### Aviso con deshacer

**Role:** confirmar lo hecho y ofrecer revertirlo

Caja de 52px de alto como mínimo, radio 14px, fondo `--color-text` y texto `--color-bg` (invertido), a 16px de los bordes laterales y a 96px del inferior (16px por encima de la barra), con `box-shadow: 0 12px 30px -10px oklch(0% 0 none / 0.6)`. Texto de 15px, peso 700; a la derecha, «Deshacer» como botón de texto de 44px de alto mínimo, peso 800, en `color-mix(in oklch, var(--color-accent), black 30%)`. Dura 4s. Entra desde 16px por debajo con `opacity` y `transform` en 260ms y sale por el mismo sitio 8px más abajo.

### Tarjeta

**Role:** contenedor de cada bloque de contenido

Fondo `--color-panel`, `1px solid --color-line`, `border-radius: 22px`, `padding: 32px` (tarjeta estrecha, por container query, `16px 12px`), `gap: 14px`, sin sombra. Título arriba (`--text-card-title`, 22px, en escritorio; título de bloque de 18px en móvil), contenido debajo.

### Popover

**Role:** lista corta flotante («Por confirmar», selector de rango)

Fondo `--color-panel`, `1px solid --color-line`, `border-radius: 20px`, `padding: 16px`, `box-shadow: var(--shadow-float)`, `width: min(340px, calc(100cqi - 24px))`. Entra con `anim-pop`.

### Popover junto a una fila

**Role:** detalle de una fila de una lista en escritorio: una categoría de «Por categoría» en Presupuesto y una cuenta de «Lo que tienes» en Patrimonio

Mismo fondo, borde, radio y sombra que el **Popover**, `width: min(400px, 100% - 24px)`, `padding: 20px 22px 16px`. Arriba, el nombre (Manrope 800 18px), con su grupo encima en 13px muted si lo tiene, y el botón de cerrar redondo de 36px. Debajo, el mismo contenido que la hoja del móvil. Se coloca pasado el borde final de la tarjeta de la fila, 14px fuera, y 20px por encima de la fila, con una flecha de 12px que apunta al centro de la fila. Si no cabe después, va antes de la tarjeta con la flecha al otro lado. En una página estrecha se queda pegado al borde final, encima de la lista. Nunca se sale de la sección por abajo, y si la fila está cerca del borde de la ventana, la página se desplaza para enseñarlo entero. No lleva velo: la lista sigue a la vista y se puede usar. Otra fila lo lleva hasta ella con un deslizamiento de 200ms, sin volver a entrar. La misma fila, Escape, el botón de cerrar o pulsar fuera lo cierran, y el foco vuelve a la fila. Entra con `anim-pop-side`. Su gráfica no se anima al abrir. En móvil, el mismo detalle va en una hoja inferior (**Panel de detalle**).

### Selector de periodo

**Role:** tramo que dibujan las gráficas del inicio (Patrimonio, Inversiones)

Va dentro del título: «Dashboard · último año ▾». Tras el título, un punto medio `--color-muted` y el periodo en `--color-accent-text`, Manrope 800 26px como el título, subrayado de 2px en `--color-ctrl-line` (en `currentColor` al pasar el ratón o con el panel abierto) y un chevron que gira al abrir. No es un `<select>`: abre un panel propio (**Popover**, `role="dialog"`, `width: min(24rem, 100vw - 32px)`, alineado al inicio del título). Arriba, los atajos «Último mes / Últimos 3 meses / Últimos 6 meses / Último año», cada uno con su tramo a la derecha en `--color-muted` («may – nov 2026»); el elegido lleva fondo `--color-panel2` y un punto `--color-accent`. Debajo, tras un filete, el campo «Desde» admite un mes y un año (MM/AAAA) o un año (AAAA, desde enero). «Aplicar» actualiza los gráficos hasta el último mes del año contable que muestra el Dashboard. En rangos que cruzan años, las fechas de los gráficos incluyen el año y el eje muestra menos etiquetas. Al abrir, el foco va al atajo elegido o al campo «Desde» si el rango es personalizado. Aplicar o Escape cierran y devuelven el foco al título, y pulsar fuera cierra el panel. Por defecto, «Último año». Los puntos son mensuales y el atajo «Último año» empieza en enero del año contable.

### Hoja / panel de alta

**Role:** alta y edición de un movimiento

**Alta desde «Apuntar».** Mini modal de hasta 372px con velo ligero, alineado al borde del botón. Se abre debajo cuando hay espacio y encima cuando el botón está cerca del borde inferior. Nace desde la posición y el tamaño del botón en 280ms y vuelve hacia él al cerrar en 200ms. Con movimiento reducido la apertura y el cierre son inmediatos. El importe recibe el foco al abrir y el botón lo recupera al cerrar. El foco del importe se señala con su etiqueta y el cursor en color de acento. En el selector de tipo, el foco de teclado subraya el texto. El indicador del tipo se desliza en 220ms con `ease-in-out` y cambia al instante con movimiento reducido. El tipo se elige en cuatro celdas con iconos, seguido del importe. Cuenta y Categoría se muestran como botones separados, con icono, nombre y radio de campo en las cuatro esquinas. En Ahorro, origen y destino tienen un botón propio. El desplegable de categorías tiene un buscador fijo, hasta tres accesos a las categorías usadas más recientemente en ese tipo de movimiento y una lista alfabética. Cada opción muestra su icono y la seleccionada lleva un check. «Fecha y mes contable» muestra la fecha y despliega ambos campos. Categoría, cuenta y mes contable abren paneles de opciones del diseño neón. Fecha abre un calendario del mismo diseño y admite escribir DD/MM/AAAA. Los paneles se cierran al elegir, pulsar fuera o pulsar Escape. «Cancelar» y «Guardar movimiento» van en la misma fila.

**Alta desde «Apuntar» en móvil.** En un ancho menor que el marco de escritorio, un alta nueva (no la edición ni la inversión) se abre como hoja inferior con teclado propio, sin el teclado del sistema. Arriba, el tipo en pastillas. Debajo, el importe grande con su signo y los miles agrupados, en color de pérdida para Gasto y de ganancia para Ingreso; baja de tamaño según su longitud para caber siempre en el ancho de la hoja (hasta 56px). Después, los datos en bloques `--color-panel2` de radio 16px y al menos 54px de alto, cada uno con icono en un cuadro `--color-panel`, nombre en 12px y valor en 15px 800 que pasa a otra línea en vez de cortarse: Categoría a todo el ancho; Cuenta y Fecha (o Cuenta origen y Cuenta destino en Ahorro) mitad y mitad; y la Nota, que se escribe en su propio bloque (al lado de la Fecha en Ahorro). El mes contable se elige en el panel de la fecha, y el bloque lo muestra («Hoy · Abril») cuando no coincide con la fecha. Luego va un teclado de 3 × 4 con los dígitos, la coma decimal y «Borrar». El importe admite hasta dos decimales y siete cifras enteras. El teclado físico también escribe. Al pie, un botón de ancho completo nombra lo que guarda («Guardar gasto», «Guardar ingreso»…). La hoja se cierra con Escape, pulsando el velo o arrastrando el asa.

Toda hoja de alta o edición en móvil crece desde el botón que la abre (el FAB, Comprar, Vender…): empieza recortada a ese botón, con su forma y su color, y se abre a la hoja completa en 460ms (`cubic-bezier(0.2, 0, 0, 1)`), con el color pasando a `--color-panel` en el primer 40 % y el contenido apareciendo desde el 30 %. Al cerrarla con Escape, el velo o un botón, vuelve a encogerse en ese botón en 300ms; arrastrada, sale por abajo. Sin movimiento no se anima.

**Editar y confirmar un pendiente.** Panel lateral de 380px en escritorio y hoja inferior arrastrable en móvil. La hoja tiene radio superior de 28px, agarre de 36×4px y un velo con opacidad 0,55. Se cierra al arrastrar más del 30 % de su alto o con un tirón de más de 0,11 px/ms. Escape, el velo y el botón de cierre también la cierran.

**Edición de un movimiento.** En móvil el detalle de un movimiento no se despliega en la lista: abre esta misma hoja como formulario (selector Compra/Venta, fecha, títulos, precio, comisión, cuenta y nota) con el total recalculado en la cabecera. Los campos van en dos columnas, con el `gap` justo, y los botones Eliminar, Cancelar y Guardar en una sola fila; Guardar es el primario. La fecha se escribe `DD/MM/AAAA`, con ese mismo texto como ayuda y `inputmode="numeric"`. Se cierra con el botón, tocando el velo o con Escape.

**Hoja arrastrable.** La hoja que lleva una lista (Inversión) se arrastra por el borde superior: hacia arriba oculta el gráfico y los chips y deja la lista a toda altura, hacia abajo vuelve; tocar el agarre también alterna. La lista hace scroll dentro de la hoja.

### Panel de detalle

**Role:** detalle o edición de un elemento de la sección (objetivo, plan del año; en móvil, también la categoría del presupuesto y la cuenta de Patrimonio)

Escritorio: panel lateral a toda altura pegado a la derecha, `width: min(460px, 100%)`, fondo `--color-panel`, `border-inline-start: 1px solid --color-line`, `box-shadow: var(--shadow-float)`. Es más ancho que el alta porque lleva historial y gráficos. Todos los paneles de detalle miden lo mismo, sea cual sea la sección. Móvil: hoja inferior como la del alta, con `max-height: 88%`. En escritorio entra con `anim-panel` (desde el borde derecho, y su contenido detrás); en móvil, con `anim-sheet`.

### Puesta en marcha

**Role:** configurar la app la primera vez: moneda y tema, cuentas, fijos, inversiones y categorías

Diálogo modal a pantalla completa (`--color-bg`, sin velo), una pantalla por paso. Escritorio: a la izquierda una columna de 400px en `--color-side` con la marca, la etiqueta «Puesta en marcha» y la lista de pasos (filas de 52px, radio 14px; el actual en `--color-panel2` con su número en un círculo de 30px con borde `--color-accent`, los hechos con un check en `--color-gain`, los opcionales con «Opcional» en `--color-faint`) y, abajo, «Ahora no» con la nota de que lo creado se guarda. El contenido va en una columna de 820px centrada, a 120px del borde superior: etiqueta «Paso n de 6», H1 y lede; debajo, un pie con filete superior: «Atrás» a la izquierda y el primario a la derecha («Siguiente»; «Saltar» en un paso opcional vacío; «Entendido» en «Listo»). Móvil: barra superior con atrás, «Paso n de 6» y «Ahora no», una barra de progreso de seis tramos de 4px (hechos en `--color-soft`, el actual en `--color-accent`) y el primario a todo el ancho abajo. Lo que se crea en un paso se lista en una tarjeta de filas de 68px; los formularios largos (una regla recurrente, una conexión) abren su panel de detalle encima. Cada paso entra con `anim-rise` y el foco va a su H1. Cerrado antes de terminar, deja encima de la sección una línea con «Retomar puesta en marcha».

### Recorrido guiado

**Role:** enseñar dónde está cada cosa, distinto en escritorio (10 pasos) y en móvil (5)

Burbujas ancladas al control real, sin cambiar de sección: el recorrido empieza en el Dashboard. El resto de la página queda bajo un velo `oklch(0% none none / 0.62)` con el control recortado (6px de holgura, el radio del propio control), sin borde. La burbuja tiene el fondo, el borde, el radio y la sombra del **Popover**, `width: min(360px, 100% - 24px)` y `padding: 20px 22px 16px`. Arriba, «n de N» en etiqueta (Manrope 800 12px, mayúsculas, muted) y, a la derecha, el botón redondo de 36px en `--color-panel2` que salta el recorrido. Debajo, el título (Manrope 800 18px) y una o dos frases en 15px soft. Al pie, «Atrás» como botón secundario a la izquierda y «Siguiente» («Terminar» en el último) como primario. Va 14px fuera del control, con una flecha de 14px hacia su centro: al lado en la barra lateral, debajo en la barra superior y encima en la barra inferior y los botones flotantes; si no cabe, cambia de lado y nunca se sale de la ventana (12px de margen). Entre pasos, el recorte y la burbuja se deslizan en 260ms (`cubic-bezier(0.22, 1, 0.36, 1)`); sin movimiento, saltan. El foco va a cada burbuja y no sale de ella; Escape salta el recorrido y las flechas avanzan y retroceden. Un paso cuyo control no está en pantalla se salta.

### Chip de filtro

**Role:** filtros y opciones excluyentes en fila

`min-height: 38px; padding: 0 14px; border: 1px solid --color-ctrl-line; border-radius: 999px`, Manrope 800 a 13px, texto `--color-soft`. Seleccionado: fondo y borde `--color-sel-bg`, texto `--color-sel-text`.

### Segmentado

**Role:** 2–4 opciones excluyentes (Gastos / Ingresos / Inversión, 3M / 6M / 1A)

Pista `display: flex; padding: 3px; gap: 3px; background: --color-panel2; border-radius: 999px`. Segmento `min-height: 36px; padding: 0 8px; border-radius: 999px`, Manrope 800 a 14px; activo con fondo `--color-sel-bg` y texto `--color-sel-text`.

### Delta

**Role:** variación junto a una cifra

Texto sin fondo: Manrope 800 a 14px en `--color-gain` o `--color-loss`, con signo explícito (`+18,4 %`, `−2,1 %`). Va en la misma línea que la cifra, separado 12px. En los widgets del inicio (Patrimonio, Inversiones) el delta va en una pastilla tintada, para que se lea como un estado de un vistazo: radio 999px, `padding: 2px 8px`, texto del color del tono y fondo del mismo color al 12 % (`bg-gain/12`, `bg-loss/12`; el neutro, `--color-text` al 8 %). La única excepción es la cifra protagonista del móvil, centrada en su diapositiva: ahí el delta va debajo, centrado, porque a 52px no caben los dos en una línea.

### Etiqueta

**Role:** encabezado de grupo y de columna, kicker sobre un título

Manrope 800 a 12px, `text-transform: uppercase; letter-spacing: 0.08em`, `color: --color-muted`. Las fechas sobre el H1 («Jueves, 9 de octubre») usan el mismo estilo.

### Ticker

**Role:** símbolo de un activo de inversión

Mono 700 a 13px, `letter-spacing: 0.04em`, `padding: 2px 8px`, `border-radius: 8px`, fondo `--color-panel2`.

### Fila de libro mayor

**Role:** cada elemento de una lista de datos (movimientos, cuentas, posiciones)

`min-height: 64px; padding: 10px 0; gap: 12px`, `border-top: 1px solid --color-line`. Izquierda: icono de categoría en círculo de 40px, texto de fila (Manrope 700 16px) y meta (13px muted, una línea con elipsis). Derecha: cifra de fila Unbounded 600, alineada a la derecha y `tabular-nums`. Seleccionada: `box-shadow: inset 3px 0 0 --color-accent`. Recién apuntada: `anim-fresh`.

**Variante de tres líneas** (movimientos de inversión): flecha de compra o venta a la izquierda, grande y centrada en vertical, sustituye al círculo de categoría; en el centro, la operación con la fecha y la comisión debajo, todas pegadas al borde izquierdo; a la derecha, el importe en cifra de fila con «títulos × precio» debajo en 12px muted. Mantiene el `min-height: 64px` y crece con las tres líneas.

### Campo

**Role:** entrada de texto en formularios

Caja `min-height: 46px; padding: 0 14px; border: 1px solid --color-ctrl-line; border-radius: 14px; background: --color-panel`, Manrope 700 a 16px; etiqueta encima en 13px 700 muted, separada 6px. La búsqueda es una pastilla de 46px (`padding: 0 18px; border-radius: 999px`) con icono a la izquierda. El importe de «Apuntar» se escribe en un recuadro con fondo carbón. En la revisión de pendientes se distingue con un subrayado.

### Barra de progreso

**Role:** consumo frente a un límite, peso en una cartera

Pista `height: 6px; border-radius: 999px; background: --color-line`; relleno `--color-neutral-bar`. Solo pasa a `--color-loss` cuando se sale del límite.

### Gráfico de evolución

**Role:** serie temporal (patrimonio, cartera)

Línea `stroke-width: 2; stroke-linecap: round; stroke-linejoin: round` con `vector-effect: non-scaling-stroke`, en `--color-accent-bright`, el naranja de la lámpara subido de tono (`oklch(from var(--color-accent) calc(l + 0.07) calc(c * 1.2) h)` en oscuro suave, `+0.06` y `× 1.15` en oscuro fuerte; en los claros solo gana croma, `× 1.2`, para no perder contraste sobre el blanco). El punto de hoy y el del recorrido van en el mismo tono; la serie lila de Inversiones sigue en `--color-lilac`. Área con degradado vertical del color de la serie: `stop-opacity` `--area-opacity` × 1.5 arriba, × 0.5 al 60 %, 0 abajo (ligera, para que la línea mande). Rejilla horizontal en `--color-ctrl-line`, filete continuo de 1px (marcado, para leer el valor de cada marca) que solo cruza el área del gráfico y se corta donde acaba la línea; el importe de cada marca va en una columna lateral (`--chart-gutter`), a la derecha por defecto y a la izquierda con `axis="start"` (Patrimonio e Inversiones en el inicio de escritorio), centrado sobre el filete, con cifras tabulares, y ninguna línea pasa por debajo ni a través de las cifras. La línea de plan o límite es `1px dashed --color-faint`. Ejes en Manrope 12px `--color-muted`.

**Recorrido.** El gráfico se recorre con el ratón o el dedo. En reposo muestra el valor de hoy, sin línea vertical y sin fecha en el eje. Al recorrerlo aparece la fecha sobre el eje x, justo bajo el punto, y oculta las marcas cercanas para no solaparse; al salir se borra el punto y vuelve el valor de hoy.

**Cambio de periodo.** En el inicio, cambiar el periodo no redibuja los gráficos de Patrimonio e Inversiones: los reencuadra. Los dos marcos acaban hoy, a la derecha, así que cada punto viaja en 700ms con `--ease-out` desde donde estaba al sitio que le toca; los meses que solo tiene uno de los marcos entran o salen por la izquierda, y la escala vertical se ajusta a la vez. Las marcas del eje, las líneas de la rejilla y el punto de hoy viajan con la línea, y las que entran o salen se desvanecen en el camino; mientras dura, el gráfico recorta sus lados. La variación del periodo cambia con `anim-swap`. Sin movimiento (`prefers-reduced-motion`), el cambio es directo.

**Recorrido en el inicio de escritorio.** Los gráficos de Patrimonio e Inversiones del inicio se recorren con el ratón, el dedo (`touch-action: pan-y`, el scroll vertical sigue funcionando) o las flechas izquierda y derecha, Inicio, Fin y Escape con el foco en el gráfico. Un punto y un filete vertical de 1px (`--color-ctrl-line`) marcan el valor más cercano; la fecha sale en una píldora sobre el eje (`--color-panel2`, filete, texto `--color-text` en peso 800) justo bajo el punto, inclinada hacia dentro cerca de los bordes, y oculta las marcas vecinas. El importe no se dibuja sobre el gráfico: la cifra de la tarjeta pasa a ser el valor del punto y vuelve a la de hoy al salir; el punto de hoy se oculta mientras se recorre. En Patrimonio las dos variaciones siguen al punto: la del mes pasa a la de ese mes frente al anterior («en julio») y la del periodo a la del punto frente al inicio del rango («desde enero»); una fila sin dato en ese punto conserva su hueco para que la cifra no salte, y la columna de la cifra tiene ancho fijo para que el gráfico no se mueva bajo el puntero. Lo que acompaña a la cifra, es de hoy y no se puede recalcular por punto (la ganancia total de Inversiones) baja a `opacity: 0.4` mientras se recorre. Una variación de cero va en tono neutro. El área de recorrido es un `role="slider"` (`aria-valuenow` es el punto, `aria-valuetext` su fecha, su importe y, en Patrimonio, sus dos variaciones), así que no hay región `aria-live` aparte. La columna lateral para los importes de la rejilla (la derecha, o la izquierda con `axis="start"`) es una sola medida, `--chart-gutter` (3.5rem como mínimo, más ancha si el importe más largo de la rejilla lo pide, para que el punto de hoy no tape su texto con el eje a la derecha), que comparten la línea, el punto y el eje, y las marcas del eje se colocan cada una bajo su punto.

**Móvil.** Va de borde a borde, de 266px de alto, con el degradado bajo una línea gruesa, sin rejilla ni cifras al lado y con solo años o meses en el eje.

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
- No añadas sombra a las tarjetas; la sombra es solo para lo que flota (popover, hoja, FAB, aviso)
- No uses el naranja como fondo de bloque ni para decorar: un segundo uso compite con la acción principal
- No pongas cifras en Manrope ni títulos de bloque en Unbounded: Unbounded es para H1 y números
- Fuera de los widgets del inicio, no metas la variación en una pastilla: el delta es texto de color junto a la cifra
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
- **Hoja inferior (móvil):** `0 -20px 60px oklch(0% 0 none / 0.5)`
- **FAB y barra inferior móvil:** `0 10px 24px oklch(0% 0 none / 0.35)`
- **Aviso con deshacer:** `0 12px 30px -10px oklch(0% 0 none / 0.6)`
- **Fila seleccionada:** `inset 3px 0 0 var(--color-accent)`

## Iconografía

Iconos de línea propios, sin relleno: `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="2"` en todos los tamaños, `stroke-linecap="round"`, `stroke-linejoin="round"`, siempre `aria-hidden="true"` salvo que el icono sea el único contenido del botón. Tamaño por defecto 20px; chevrones a 14–18px; iconos de cabecera a 22–26px. Los iconos de categoría (Súper, Comer fuera, Transporte…) van dentro de un círculo de 40–44px en `--color-panel2`. No hay ilustraciones, fotos ni emoji.

## Layout

Escritorio (desde 981px, `--breakpoint-frame`): fila con la barra lateral fija de 236px (marca `finanzas.` con el punto en naranja, secciones arriba, Datos y Configuración abajo; al pie, el menú de usuario) y el área principal fluida con `max-width: 1640px` centrado. Cada sección abre con la etiqueta de fecha, H1 en Unbounded y una línea de lede; debajo, una rejilla de dos columnas (contenido principal y aside de resumen) con `gap: 20px`. La raíz es `container-type: inline-size` y los tamaños fluidos usan `cqi`. El marco (barra lateral o barras superior e inferior) cambia por ancho de ventana con **una sola media query**; el contenido no usa media queries, sino container queries sobre su propio contenedor; y el tamaño táctil de 44px va por `@media (pointer: coarse)` (`pointer-coarse:` en Tailwind), no por ancho. Nada se decide por user-agent ni por detección de dispositivo. Móvil: barra superior, contenido en una columna, barra inferior flotante en cápsula y, a su derecha, el FAB «Apuntar» (ver **Barra inferior móvil** y **FAB**). El alta usa una hoja inferior con teclado propio (ver **Alta desde «Apuntar» en móvil**). El detalle y «Por confirmar» usan hojas inferiores.

**Inicio en escritorio.** Los widgets se colocan en una rejilla de seis columnas de casillas cuadradas (la altura de fila es el ancho de columna: `--cell: calc((100cqw - 5 × 1.25rem) / 6)`, hueco de 1.25rem) y tantas filas como hagan falta. Cada widget ocupa un número entero de casillas (ancho × alto) y tiene un mínimo propio, el que necesita su contenido en el escritorio más estrecho (contenedor de 56rem, casillas de unos 134px). Nunca se solapan ni salen de las seis columnas; lo que queda debajo sube hasta que algo lo frena (sin filas vacías encima de un widget; los huecos a los lados valen). Por defecto, los widgets tienen dos casillas de alto, también al añadirlos desde el catálogo. Arriba van Patrimonio (4 × 2) y «Te quedan» (2 × 2). En medio van Movimientos (2 × 2) e Inversiones (4 × 2); y abajo, «Por confirmar», Gasto por categoría y Objetivos (2 × 2 cada uno). Con menos de 56rem de contenedor no hay casillas: los widgets se apilan de arriba abajo en el orden de lectura de la distribución (por filas, de izquierda a derecha), con la altura de su contenido. Un widget llena su caja: los gráficos se estiran y las listas (Movimientos, Gasto por categoría, Objetivos, Por confirmar) muestran las filas que caben, nunca media fila ni scroll interno; las que no caben salen del orden de lectura y del foco. En una pantalla más ancha las casillas crecen y las listas ganan filas para llenar el hueco, hasta el tope de datos de cada una; en una más estrecha pierden las últimas. Si en «Por confirmar» queda alguna fuera, aparece «Ver los N pendientes». Al confirmar uno, sus botones dan paso a «Confirmado» con una marca en `--color-gain` (`anim-swap`) durante 450ms, y luego la fila se pliega; el foco pasa al título de la tarjeta. Sin movimiento, se confirma y sale en el acto. «Te quedan» enseña siempre sus tres filas (ingresos, gastos e inversión) en una línea; la nota del ritmo de gasto se muestra solo si hay sitio. «Por confirmar» ya no queda a la vista sin desplazar en escritorio: en móvil sigue en la barra superior. Las filas de Movimientos, Gasto por categoría y Objetivos son botones de fila completa: `--color-panel2` al pasar el ratón, radio 14px que sobresale 12px a cada lado, y al pulsar bajan a `scale(0.985)` (160ms ease-out, solo sin `prefers-reduced-motion`). Un movimiento abre Movimientos con su detalle; una categoría lleva a Presupuesto y un objetivo a Objetivos.

**Cabecera del inicio en escritorio.** Una sola línea: a la izquierda, el título con el **Selector de periodo** dentro y el lápiz de edición (el título es «Dashboard», sin mes ni año, en Manrope 800 26px con `tracking-tight`: Unbounded, de letra muy ancha, se lee estirado a ese tamaño); a la derecha, la búsqueda y «Apuntar». Sin etiqueta de fecha ni lede (el móvil los conserva). El periodo manda sobre las gráficas de Patrimonio e Inversiones, que ya no llevan segmentado propio. En Patrimonio, bajo la cifra, van dos pastillas: el cambio del mes en importe y porcentaje («este mes») y el cambio desde el inicio del periodo solo en porcentaje, con su etiqueta («en 3 meses», «en 6 meses», «en lo que va de año», «desde mayo»); con «Último mes» la segunda no aparece, porque repetiría la primera.

**Patrimonio en móvil.** Arriba, «Tienes» y el patrimonio neto (Unbounded 700 a 28px, con los céntimos a la mitad en `--color-muted`), y a su derecha el botón de acento «Cerrar {mes}» («Revisar {mes}» si ya está cerrado). Debajo, un segmentado en `--color-panel2` filtra por grupo (Todo, Efectivo, Inversión, Pasivos). Cada grupo con cuentas lleva su título y su total en una línea, y debajo sus cuentas en una rejilla de dos columnas con huecos de 6px. Cada celda es un botón `--color-panel` de radio 16px y al menos 86px de alto, con el nombre (13px 700 `--color-soft`), la cifra en euros enteros (Unbounded 600 a 18px) y lo que se movió desde el mes anterior; ese cambio solo toma `--color-gain` o `--color-loss` cuando es grande (50 € o más y al menos el 5 % de lo que había) y si no va en `--color-muted`. Al pie, «Balance por meses». La gráfica de evolución y el reparto quedan para el escritorio.

**Patrimonio en el inicio de escritorio.** La tarjeta se reparte en dos columnas: a la izquierda, la cifra y las dos pastillas; a la derecha, la evolución, que ocupa el resto. La columna de la izquierda va a ras del título de la tarjeta (sin padding izquierdo), se apoya abajo, a la altura del pie del área de trazado (`padding-bottom: 24px`, la fila de meses), y deja 32px a su derecha antes del hueco de 28px hasta el gráfico. La cifra es de `clamp(38px, 3.9cqi, 50px)`, un poco mayor que `--text-figure-lg`; las pastillas van una por línea, a 12px entre sí y a 16px de la cifra. El importe de cada marca de la rejilla va en una columna a la izquierda del gráfico, alineado a la derecha, y el punto de hoy queda en el borde derecho. Con la tarjeta estrecha (contenedor menor de 36rem) el gráfico baja debajo de la cifra y recupera el ancho completo.

**Inversiones en el inicio de escritorio.** La misma estructura que Patrimonio: columna izquierda a ras del título y apoyada abajo, con la cifra en el mismo `clamp`, y la evolución (lila) a la derecha con el eje a la izquierda. La tarjeta dice cuánto vale la cartera y, para que la pérdida o la ganancia no choque con una línea que sube con cada aportación, da su base: bajo la cifra, la pastilla de la ganancia con «sobre lo aportado» y, debajo, lo aportado en `--color-soft` peso 800 con «aportados». Las dos son de hoy y bajan a `opacity: 0.4` mientras se recorre el gráfico. Al pie de la columna, el reparto de la cartera en una barra de 6px, sin leyenda: cada tramo es enfocable y, al pasar el ratón o con el foco, nombra su posición y su peso en una píldora sobre la barra, invertida para que se despegue del texto de debajo (`--color-sel-bg` con texto `--color-sel-text`, sombra `--shadow-float`, Manrope 800 13px, el peso al 65 %), inclinada hacia dentro en los extremos; los demás tramos bajan a `opacity: 0.35` (160ms) para que se vea de cuál habla. Los tramos usan tonos que se distinguen de un vistazo (lila, melocotón, violeta oscuro, arena) y «Otros» siempre el gris neutro. La nota de las cotizaciones va junto al título, en 13px, `--color-soft` si van retrasadas. El primer punto del gráfico (el inicio del año) no lleva marca en el eje; al recorrerlo, la píldora dice «Inicio».

**Gráfica a la izquierda.** Patrimonio e Inversiones llevan por defecto la gráfica antes de las cifras; en la edición del inicio se puede pasar a la derecha, por widget. Las columnas se invierten y el eje de importes sigue a las cifras: va a la derecha de la gráfica, en el lado que da a ellas (con la gráfica a la derecha, a su izquierda). El título de la tarjeta se queda a la izquierda. La gráfica va a ras del borde izquierdo y empieza bajo la fila del título (no sube a ella, que la taparía); la columna de las cifras pasa a la derecha, apoyada abajo igual, con los 32px de aire a su izquierda. Con la tarjeta estrecha no cambia nada: la gráfica va siempre debajo.

**Edición del inicio.** Un botón de lápiz (círculo de 44px con filete `--color-ctrl-line`) a la derecha del título, solo con casillas (contenedor ≥ 56rem), entra y sale del modo edición; activo, es un círculo `--color-sel-bg` con una marca de «hecho» (`aria-pressed`, etiqueta «Editar distribución» / «Terminar de editar el inicio»). Mientras se edita: la rejilla dibuja las casillas con un filete discontinuo `--color-line` y una fila vacía más abajo para arrastrar; cada widget queda inerte bajo una capa con borde discontinuo `--color-ctrl-line` que se arrastra para moverlo (cursor `grab`, naranja mientras se arrastra), con una `×` arriba a la derecha que lo quita (y, a su izquierda, en los widgets con gráfica —Patrimonio, Inversiones—, un círculo igual con dos flechas que se cruzan que pasa la gráfica al otro lado de las cifras: «Gráfica a la derecha» / «a la izquierda», según donde esté, guardado en la distribución) y un tirador en la esquina inferior derecha que cambia su tamaño; la capa es enfocable y con las flechas se mueve el widget (hasta que algo cambie) y con Mayús y flechas se redimensiona, cada pulsación se guarda. Al arrastrar, los demás se apartan en vivo, la página se desplaza cerca de los bordes de la ventana y Escape descarta el gesto; al soltar, todo sube. Una barra (`--color-panel2`) bajo la cabecera explica el gesto y trae «Widgets» (si el panel está cerrado) y «Restablecer», que pide confirmar. Un cajón flotante a la derecha (`--color-panel`, 20rem, sobre el contenido, sin empujar la rejilla) ofrece los widgets que no están en el inicio, cada uno con un dibujo de su forma, su tamaño en casillas y «Añadir» (primer hueco libre, tamaño inicial) o se arrastra a la rejilla; debajo, un bloque discontinuo con «Próximamente». Cada cambio se anuncia en una región `aria-live` («Objetivos: columna 2, fila 1, 2 por 3 casillas»), y al quitar un widget el foco pasa a su entrada del cajón. Sin widgets, el inicio muestra un estado vacío con «Editar distribución».

**Cabecera de detalle.** Al abrir un elemento de una sección (un activo), la barra superior queda solo con la flecha y el símbolo («‹ VWCE»), en móvil y en escritorio; la flecha vuelve a la sección. No lleva título de sección ni controles a la derecha, ni dentro de la pantalla se repite la fila de volver, símbolo y nombre.

**Detalle de un activo en escritorio.** Bajo la cabecera de detalle, dos columnas de tarjetas (`--color-panel`, filete `--color-line`, radio de tarjeta). En la principal, con un símbolo enlazado, «Cotización» con el ticker al lado: el precio en grande con su cambio en el periodo («+0,87 % en la semana», «−0,08 % hoy»), la hora del dato (o «Valor liquidativo del 27 nov 2026» para un fondo), la etiqueta de su estado a la derecha, los periodos 1D · 1S · 1M · 6M · 1A · 5A en una píldora `--color-panel2` (`aria-pressed`; un fondo no tiene 1D) y el gráfico de evolución en acento, que al recorrerlo cambia el precio, el cambio y la fecha por los del punto. Sin símbolo, «Precio y tus operaciones» (el precio leído en grande, su fecha y la diferencia con tu media; la gráfica, un punto por operación que acaba en la última, sin precio de hoy) y debajo «Movimientos», con «Comprar» (píldora de acento) y «Vender» (píldora `--color-panel2`) en su cabecera. En la lateral, fija al desplazar (`position: sticky`), la ficha de la posición: el nombre como título, «Vale hoy» en grande con el resultado y su porcentaje debajo, y la lista de cifras con «Marcar todas como declaradas» al final. Ninguna cifra se repite entre las dos columnas. Cada movimiento es una fila de una línea cuando su lista mide ≥ 36rem (icono en círculo `--color-panel2`, «Compra · 16 nov · Sin comisión», un punto de acento si no está declarado, títulos × precio y el total); más estrecha, el día y la comisión bajan a una segunda línea y los títulos van bajo el total. En el móvil, la cotización ocupa el sitio de la gráfica de arriba, bajo el nombre: el precio a 38px, los periodos a todo el ancho y el gráfico se recorre manteniendo el dedo.

## Números

- Dinero: `−1.234,56 €` (U+2212, punto de miles, coma decimal, espacio y €, dos decimales siempre).
- Porcentaje: `+18,4 %`, siempre con signo y un decimal.
- En cifras grandes los céntimos bajan a 0.42em en `--color-muted` (0.4em en la cifra protagonista del móvil, que lleva tracking -0.045em).
- Columnas de importes alineadas a la derecha con `tabular-nums`.
- Fecha en formularios: `DD/MM/AAAA` (`06/10/2026`).

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
2. **Tarjeta de bloque**: fondo #232220, borde 1px #33312E, radio 22px, padding 32px, gap 14px. Título «Gasto por categoría» en Manrope 800 22px (18px en móvil). Filas con barra de 6px (pista #33312E, relleno #6F6A62) e importe en Unbounded 600 16px alineado a la derecha.
3. **Cifra protagonista**: «148.320» en Unbounded 700 56px, line-height 1.05, letter-spacing -0.035em, #E6E1D7, con «,57 €» a 0.42em en #9B958A; en la misma línea, a 12px, el delta «+18,4 %» en Manrope 800 14px #86CFA5, sin fondo.
4. **Barra de acciones**: botón primario «Guardar» (fondo #E8703F, texto #1B1A18, Unbounded 700 14px, min-height 44px, padding 0 22px, radio 999px) y a su lado «Cancelar» como texto subrayado (Manrope 800 14px #E6E1D7, underline con offset 4px, sin fondo ni borde, mismo alto).
5. **Fila de movimiento**: min-height 64px, padding 10px 0, borde superior 1px #33312E; círculo de 40px #2C2B28 con icono de 20px trazo 2; «Mercadona» en Manrope 700 16px y «Súper · hoy» en 13px #9B958A; a la derecha «−64,32 €» en Unbounded 600 16px tabular.

## Motion

| Nombre              | De                                                     | Duración                                       | Curva                                                                   | Uso                                                                                                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anim-rise`         | `opacity: 0; translateY(14px)`                         | 520ms                                          | `cubic-bezier(0.22, 1, 0.36, 1)`                                        | Entrada de bloques, `delay: calc(var(--i) * 70ms)`                                                                                                                                                                                                                      |
| `anim-sheet`        | `opacity: 0; translateY(48px)`                         | 380ms                                          | `cubic-bezier(0.32, 0.72, 0, 1)`                                        | Hojas inferiores del móvil                                                                                                                                                                                                                                              |
| `anim-panel`        | `translateX(100%)`, entero y sin fundido               | 400ms; sale en 240ms                           | `cubic-bezier(0.32, 0.72, 0, 1)`; sale con `cubic-bezier(0.4, 0, 1, 1)` | Paneles laterales de escritorio (detalle, «Por confirmar»): entran desde su borde y salen por él. El contenido del panel de detalle (cabecera, cada bloque, pie) llega detrás: `opacity: 0; translateX(16px)`, 320ms con `--ease-out`, desde 120ms y 45ms entre bloques |
| `anim-pop`          | `opacity: 0; scale(0.96) translateY(-6px)`             | 220ms                                          | `cubic-bezier(0.22, 1, 0.36, 1)`                                        | Popovers, origen arriba a la derecha                                                                                                                                                                                                                                    |
| `anim-pop-side`     | `opacity: 0; translateX(-12px) scale(0.92)`            | 260ms                                          | `cubic-bezier(0.22, 1, 0.36, 1)`                                        | Popover junto a una fila: sale de su flecha (el origen de la transformación), hacia el lado contrario a la fila; si va antes de la tarjeta, `translateX(12px)`                                                                                                          |
| `anim-fade`         | `opacity: 0`                                           | 260ms                                          | `ease-out`                                                              | Velos                                                                                                                                                                                                                                                                   |
| `anim-draw`         | `clip-path: inset(-10% 100% -10% -10%)`                | 1500ms, 120ms de retardo                       | `--ease-out`                                                            | Gráfico de evolución al montarse: la línea y su área se dibujan de izquierda a derecha                                                                                                                                                                                  |
| `anim-dot`          | `opacity: 0; scale(0.4)`                               | 320ms, 1000ms de retardo                       | `cubic-bezier(0.22, 1, 0.36, 1)`                                        | Punto de hoy, que se enciende cuando la línea llega                                                                                                                                                                                                                     |
| `anim-fresh`        | `background-color: var(--flash)`                       | 1800ms                                         | `ease-out`                                                              | Fila recién apuntada                                                                                                                                                                                                                                                    |
| `anim-wipe`         | `clip-path: inset(0 100% 0 0 round 999px)`             | 1100ms                                         | `--ease-out`                                                            | Barras de progreso que se dibujan hasta su valor; las de una lista, 140ms después de su fila                                                                                                                                                                            |
| `anim-grow`         | `scale: 1 0`, desde la base                            | 700ms, 300ms + 90ms por fila + 45ms por mes    | `--ease-out`                                                            | Columnas de los seis meses en «Te quedan»                                                                                                                                                                                                                               |
| `anim-stretch`      | `scale: 0 1`, desde el inicio                          | 1100ms, 220ms de retardo                       | `--ease-out`                                                            | Barras de reparto (ingresos de «Te quedan», cartera de Inversiones): crecen enteras, cada tramo en su proporción                                                                                                                                                        |
| `anim-row`          | `opacity: 0; translate: 0 6px`                         | 420ms, 260ms + 35ms por fila (hasta la novena) | `cubic-bezier(0.22, 1, 0.36, 1)`                                        | Filas de una lista al entrar (inicio y libro mayor)                                                                                                                                                                                                                     |
| `anim-swap`         | `opacity: 0; translate: 0 3px; blur(2px)`              | 260ms                                          | `cubic-bezier(0.22, 1, 0.36, 1)`                                        | Cifra que cambia en su sitio: la variación del periodo al cambiarlo, «Confirmado»                                                                                                                                                                                       |
| Alta / baja de fila | alto, relleno y filete desde 0 (o hasta 0) y `opacity` | 320ms al abrir, 240ms al plegar                | `--ease-out`                                                            | Una fila que se añade abre su hueco y una que sale se pliega; con más de tres a la vez (un filtro, otro mes), la lista cambia sin movimiento                                                                                                                            |
| Reencuadre          | cada punto de su sitio en el marco viejo al del nuevo  | 700ms                                          | `--ease-out`                                                            | Cambio de periodo en los gráficos del inicio (ver **Gráfico de evolución**)                                                                                                                                                                                             |
| Deslizar widget     | `translate` desde su casilla anterior                  | 280ms                                          | `--ease-out`                                                            | Los widgets que cambian de casilla al mover, redimensionar o quitar otro; el que cambia de tamaño no se desliza                                                                                                                                                         |
| `.press`            | `scale(0.96)` al pulsar                                | 140ms                                          | `ease-out`                                                              | Todo control pulsable                                                                                                                                                                                                                                                   |

**Móvil nativo.** Curvas `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` y `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`. Pulsar: `scale(0.97)` en 160ms con `--ease-out`. Entrada de bloques: 420ms con 50ms de escalonado, solo la primera vez que se abre la pantalla. Hoja: entra con `anim-sheet` y sale en 200ms; velo: 240ms al entrar, 200ms al salir. FAB: `clip-path` y `transform` en 260ms. Aviso: `opacity` 180ms y `transform` 260ms. Las salidas son más rápidas que las entradas.

Todo dentro de `@media (prefers-reduced-motion: no-preference)`. Foco: `outline: 2px solid var(--color-accent)` en `:focus-visible`; los campos de texto (`input`, `select`, `textarea`) no llevan anillo: su borde pasa a `--color-text` (regla global en `neon.css`). Barras de desplazamiento: finas, sin carril, el pulgar en `--color-ctrl-line` y en `--color-muted` con el puntero sobre la caja que desplaza (regla global en `neon.css`; ocultarlas con `[scrollbar-width:none]` en tiras horizontales). Hover solo en `@media (hover: hover) and (pointer: fine)`.

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
  --color-faint: #969186;
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
  --color-faint: #8f8a80;
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
  --color-faint: #716c63;
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
  --color-faint: #7d675c;
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
  --text-card-title: 22px;
  --text-label: 12px;
  --tracking-label: 0.08em;
  --text-body: 16px;
  --leading-body: 1.45;
  --text-row: 16px;
  --text-note: 14px;
  --text-meta: 13px;
  --text-delta: 14px;
  --text-tab: 12px;
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
  --card-padding: 32px;
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
  --radius-sheet: 28px;
  --radius-pill: 999px;

  /* Elevation */
  --shadow-sheet: 0 -20px 60px oklch(0% 0 none / 0.5);

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
  --color-faint: #969186;
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
  --text-card-title: 22px;
  --text-label: 12px;
  --text-label--letter-spacing: 0.08em;
  --text-row: 16px;
  --text-note: 14px;
  --text-meta: 13px;
  --text-delta: 14px;
  --text-tab: 12px;
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
  --radius-sheet: 28px;
  --radius-pill: 999px;

  /* Shadows */
  --shadow-float: 0 24px 60px rgba(0, 0, 0, 0.5);
  --shadow-sheet: 0 -20px 60px oklch(0% 0 none / 0.5);
}
```

La distribución del inicio se guarda como `dashboardLayout` en los ajustes del usuario mediante sync v2, incluidos los cambios sin conexión. Solo se guarda al terminar un gesto o una acción; las previsualizaciones no se persisten. `null` usa la distribución por defecto y una lista vacía conserva el inicio sin widgets. Restablecer vuelve a `null`. La copia JSON incluye la distribución. En la demo, los cambios viven en memoria.
