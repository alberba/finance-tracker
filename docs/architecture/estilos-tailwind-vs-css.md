# Estilos: Tailwind vs CSS vs híbrido

Nota de arquitectura para decidir cómo se estiliza la app a partir de ahora. Fecha de la
investigación: 2026-09-26, rama `mejorar-pagina-inversi-n` (HEAD `4bbe883`). Cada afirmación va
marcada como **[medido]** (comando reproducible en este repo), **[fuente]** (documentación primaria,
con URL en §7) o **[inferencia]** (razonamiento propio, sin dato que lo respalde directamente).

## 1. Resumen ejecutivo

**Recomendación: un híbrido definido.** Utilidades Tailwind en las plantillas como opción por
defecto, **componentes Vue como unidad de reutilización** (primitivas en `src/components/ui/`),
tokens en `@theme` y `<style scoped>` solo para lo que las utilidades expresan mal. `legacy.css` se
congela (no admite bloques nuevos) y se vacía por zonas. El CSS global queda para tokens, reset y
tipografía base. Los datos que más pesan:

1. **[medido]** Hoy `legacy.css` entra en el cascade **sin capa**, y por eso gana a _cualquier_
   utilidad Tailwind, sea cual sea su especificidad. `font-display` no hace nada en ningún `h3`/`h4`,
   y en `MarketQuotesPanel` el `text-xl` del título sale a 11,52 px en mayúsculas por culpa de
   `.card h3`. Esto se arregla primero, lo decidamos como lo decidamos.
2. **[medido]** Para un agente, localizar y cambiar el estilo de una fila cuesta unos 1,4k tokens y 2
   llamadas si el estilo está co-ubicado (Tailwind o scoped), frente a unos 5k tokens y 5-6 llamadas
   con `legacy.css`. Si el agente lee el fichero entero, son 30,8k tokens.
3. **[medido]** En 17 tablas hay 6 sistemas de estilo distintos. El problema de fondo no es
   «Tailwind o CSS». Es que faltan primitivas compartidas.

## 2. Contexto del repo (medido)

| Dato                                | Valor                                                                                                                    | Cómo                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| `src/styles/legacy.css`             | 4.291 líneas, 99.377 bytes, **30.776 tokens**                                                                            | `wc`, tiktoken `o200k_base` (§6)   |
| `src/styles/global.css`             | 167 líneas, 1.453 tokens; `@import 'tailwindcss'` + preflight en `layer(base)` + `@import './legacy.css'` **sin capa**   | lectura                            |
| Tailwind instalado                  | v4.3.3 (`@tailwindcss/vite`)                                                                                             | cabecera del CSS construido        |
| Componentes Vue                     | 59; 12 con `<style scoped>`; 0 con `<style module>`; 0 usos de `@apply`/`@reference`                                     | `find`, `grep`                     |
| Componentes con utilidades Tailwind | ~30 (heurística por clases `flex/grid/p-/text-…`)                                                                        | `grep`                             |
| `src/components/ui/`                | solo `AppSection.vue`                                                                                                    | `ls`                               |
| Reglas en `legacy.css`              | 657 reglas; 235 llevan un `#id` (202 con `#investment`, 21 con `#settings`)                                              | script Python sobre selectores     |
| Clases de `legacy.css`              | 289; **14 sin ninguna aparición literal** en `src/` (~168 líneas de reglas candidatas a código muerto)                   | script, §6                         |
| Variante `dark:`                    | **no configurada** (no hay `@custom-variant`); 0 usos de `dark:`                                                         | `grep`                             |
| Tokens en `@theme`                  | fuentes, animación y 8 colores. **No** están `--line`, `--bg-panel`, `--bg-card`, radios ni sombras                      | lectura de `global.css`            |
| Commits que tocan `legacy.css`      | 21, de ellos **17 (81%)** tocan también un `.vue`/`.astro`                                                               | `git log` + `git show --name-only` |
| Tests visuales                      | `tests/e2e/layout-visual.spec.ts`: 8 secciones × 2 viewports = 16 PNG, solo Linux, solo tema claro y pestaña por defecto | lectura                            |

Líneas de `legacy.css` por sección (cabeceras `/* ══ … */`) y clases de cada sección que aparecen en
`src/`:

| Sección                           | Líneas | Clases usadas | Sección                  |    Líneas | Clases usadas |
| --------------------------------- | -----: | ------------: | ------------------------ | --------: | ------------: |
| TOKENS light + dark               |    124 |             — | TX DIALOG                |       240 |         15/15 |
| RESET + TYPOGRAPHY                |     49 |             — | TABLES                   |       129 |         14/14 |
| APP SHELL                         |    204 |         20/20 | SETTINGS · LIBRO MAYOR   |       320 |         20/20 |
| SIDEBAR                           |    540 |         32/32 | ACTION BUTTONS           |        88 |          9/10 |
| PANELS                            |    113 |           6/6 | REPORTS                  |       338 |     **15/21** |
| CARD GRIDS / CHARTS / LIST        |    124 |           8/8 | RESPONSIVE (transversal) |       278 |         39/46 |
| DIALOG (compartido)               |     65 |           8/8 | DEMO MODE BANNER         |        54 |           3/3 |
| TX LAYOUT/SUMMARY/QUERY           |    124 |         19/20 | **INVERSIÓN · CUADERNO** | **1.194** |         96/97 |
| Resto (badges, toast, tags, etc.) |   ~300 |    casi todas |                          |           |               |

**Build de producción** [medido] (`SENTRY_AUTH_TOKEN= pnpm build`, tamaños con `wc -c`, `gzip -9`,
`brotli`):

| Asset                                              |     Crudo |     gzip |   brotli |
| -------------------------------------------------- | --------: | -------: | -------: |
| `FinanceTrackerShell.*.css` (en todas las páginas) | 119.051 B | 21.193 B | 18.292 B |
| `TransactionsSection.*.css` (scoped)               |  19.531 B |  3.090 B |  2.641 B |
| `SettingsSection.*.css` (scoped)                   |   9.520 B |  2.015 B |  1.654 B |

Desglose del CSS del shell por bloque de primer nivel (script sobre el minificado): reglas sin capa
65.353 B y `@media`/otros de primer nivel 22.003 B (entre las dos, **~87 KB, ~73%, sale casi todo de
`legacy.css`**), `@layer utilities` 23.762 B, `@layer base` 3.930 B, `@layer components` 2.490 B,
`@layer theme` 1.510 B.

### Incidentes de esta semana (reportados en el encargo, no reproducidos uno a uno)

Una regla global de `th` puso en mayúsculas las cabeceras de fila de una tabla nueva (hoy la corrige
`#investment .inv-ledger tbody th` con `text-transform: none`). `.chart-canvas-wrap` añadió un fondo
gris que nadie pidió. `.list-item`/`.delete-btn` tuvieron que acotarse bajo `#settings`. 139 líneas
muertas de Inversión siguieron ahí hasta la auditoría manual (commit `4bbe883`, −139). Y entró un
bloque de 1.194 líneas en `legacy.css` (commit `c93df9d`). Lo he comprobado en el navegador:
`.chart-canvas-wrap` fuera de contexto sale con `background: rgb(243,245,250)` y 220 px de alto.

## 3. Variables

### 3.1 Coste para agentes de IA (variable principal)

**Método.** Tomo tres componentes reales y simulo la tarea «cambiar el padding de las filas de la
tabla» y «añadir hover a la fila». Cuento los tokens que el agente tiene que _leer_ (ficheros, rangos,
salidas de `grep`) y _escribir_ (el `old_string` y el `new_string` de la edición), además del número de
llamadas a herramientas. Tokenizador: `o200k_base` (§6).

**Tokens de lectura por pieza [medido]:**

| Pieza                                                                     |                                Tokens |
| ------------------------------------------------------------------------- | ------------------------------------: |
| `MarketQuotesPanel.vue` (Tailwind) entero                                 |               1.416 (plantilla 1.018) |
| `StockEventsSymbolTable.vue` (scoped) entero                              | 1.381 (plantilla 601 + `<style>` 500) |
| `InvestmentMovementsTab.vue` (legacy) entero                              |               3.000 (plantilla 2.034) |
| `grep -rn inv-ledger src/styles` (21 coincidencias en 2 zonas)            |                                   384 |
| `legacy.css` 3692-3748 (reglas de `.inv-ledger`)                          |                                   410 |
| `legacy.css` 4200-4291 (`@media` que vuelve a pisar el padding a ≤640 px) |                                   678 |
| `grep` de selectores genéricos `th/td/tr/table` en `src/styles`           |                                   498 |
| Bloque INVERSIÓN completo                                                 |                                 8.544 |
| `legacy.css` completo                                                     |                                30.776 |

**Simulación de la tarea «padding de filas»:**

| Paso      | Tailwind (`MarketQuotesPanel`)                | Scoped (`StockEventsSymbolTable`) | Global (`InvestmentMovementsTab` + `legacy.css`)                   |
| --------- | --------------------------------------------- | --------------------------------- | ------------------------------------------------------------------ |
| 1         | Leer el `.vue` (1.416)                        | Leer el `.vue` (1.381)            | Leer el `.vue` para ver la clase `inv-ledger` (3.000)              |
| 2         | Editar (18 tok, `replace_all` de `py-3 pr-4`) | Editar la regla (~30 tok)         | `grep inv-ledger` (384) → 21 coincidencias, 2 zonas                |
| 3         | —                                             | —                                 | Leer la zona de reglas (410)                                       |
| 4         | —                                             | —                                 | Leer el `@media` (678): a ≤640 px otra regla pisa `padding-inline` |
| 5         | —                                             | —                                 | (prudente) `grep` de reglas genéricas `td`/`th` (498)              |
| 6         | —                                             | —                                 | Editar (30 tok)                                                    |
| **Total** | **~1,4k tok, 2 llamadas**                     | **~1,4k tok, 2 llamadas**         | **~5,0k tok, 5-6 llamadas** (o 33,8k si lee `legacy.css` entero)   |

**Tokens de escritura [medido]** (suma `old`+`new` de la llamada Edit): padding con Tailwind 18
tok, con CSS 30 tok. Hover con Tailwind (`hover:bg-primary/5` en el `<tr>`) 27 tok; con CSS (regla
nueva) 52 tok. Escribir sale barato en los dos casos. La diferencia está en **leer y localizar**, no
en escribir. **[inferencia]** Con Tailwind, cuando el mismo estilo se repite en N elementos que no
salen de un bucle, la escritura crece con N (aquí, 5 `<td>` con dos variantes de clase), y con una
regla CSS no. El remedio que da Tailwind son los componentes y los bucles (§3.2).

**Lo que las cifras no recogen: la trampa del cascade mixto [medido].** En `MarketQuotesPanel` el
agente cree que ya lo ha visto todo tras leer el `.vue`, pero `class="card"` arrastra
`.card h3 { font-size: .72rem; text-transform: uppercase }` desde `legacy.css`. Lo comprobé con
Chromium headless (Playwright) cargando el CSS de producción:

| Elemento de prueba                                        | `font-size`           | `text-transform` | `font-family`         |
| --------------------------------------------------------- | --------------------- | ---------------- | --------------------- |
| `<article class="card"><h3 class="font-display text-xl">` | **11.52px** (no 20px) | **uppercase**    | **DM Sans** (no Syne) |
| `<h3 class="font-display text-xl">` fuera de `.card`      | 20px                  | none             | **DM Sans** (no Syne) |

Pasa porque las utilidades viven en `@layer utilities` y `legacy.css` está sin capa, y **las
declaraciones normales sin capa ganan siempre a las que van en una capa** [fuente: MDN `@layer`]. Hay
3 cabeceras (`DashboardPanel.vue:29`, `PendingMovementsPanel.vue:117`, `MarketQuotesPanel.vue:53`) con
`font-display` que el navegador ignora sin avisar, porque `h3, h4 { font-family: 'DM Sans' }` las
pisa. Para un agente esto es lo peor que puede pasar: el cambio se ve bien en el diff y no hace nada
en pantalla. **Mientras `legacy.css` siga sin capa, el híbrido actual no es realmente co-ubicado.**

**Otras trampas para agentes [medido + fuente]:**

- `dark:` en este repo seguiría a `prefers-color-scheme` (el comportamiento por defecto de Tailwind)
  y no a `:root[data-theme='dark']`. Un agente que escriba `dark:bg-…` obtiene un tema que sigue al
  sistema operativo y no al interruptor de la app. Se corrige con
  `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));` [fuente: Tailwind Dark mode].
- Tailwind lee las fuentes como texto plano y no genera clases montadas por concatenación
  (`text-${x}-600`) [fuente: Detecting classes]. Es un fallo clásico al escribir código generado.
- Como `--line`, `--bg-panel`, `--bg-card`, radios y sombras no están en `@theme`, obligan a escribir
  valores arbitrarios (`border-[var(--line)]`, 6 usos), que son más largos y validan peor.
- Las clases utilitarias cobran también en tareas que no tocan estilo: en `MarketQuotesPanel` los
  atributos `class` suman 252 de 1.416 tokens (18%); en `InvestmentMovementsTab`, 144 de 3.000 (5%).
  Con Tailwind, cada lectura de una plantilla es algo más cara.

**Fuentes primarias sobre LLM y Tailwind** (solo lo que he podido verificar):

- Figma2Code (ICLR 2026, arXiv 2604.13648, apéndice): _«Compared with arbitrary CSS, Tailwind
  offers a standardized set of utility classes that reduce the output space while retaining
  sufficient expressiveness…»_. Eligen Tailwind como formato de salida por consistencia y
  reproducibilidad entre modelos. Es una elección de diseño del benchmark, no una medición de
  calidad Tailwind contra CSS.
- shadcn/ui (principio «AI-Ready»): código abierto y una interfaz de composición común «predictable
  for teams and AI models alike». Apoya los **componentes como unidad**, no Tailwind en sí.
- Tailwind («Styling with utility classes»): «adding or removing a utility class to an element only
  ever affects that element». Es una afirmación del propio fabricante sobre el radio de impacto.
- Anthropic, cookbook «Prompting for frontend aesthetics»: «Use Tailwind CSS for your CSS variables»
  y «Use CSS variables for consistency». Es una preferencia de prompt, no un estudio.
- Tailwind Labs (PR #2388 de tailwindcss.com, 2026-01-07): el tráfico de su documentación cayó ~40%
  desde 2023 «despite Tailwind being more popular than ever», y lo atribuyen a la IA. Indica que los
  LLM usan Tailwind de forma masiva; no dice nada de la calidad.
- **Descartado:** un resumen de búsqueda atribuía a WebUIBench (arXiv 2506.07818) una subida del 47%
  al 92% en éxito de compilación usando Tailwind. No lo encontré en el texto extraído del PDF y no lo
  uso.
- No he encontrado ningún estudio controlado que compare la tasa de error de LLM editando Tailwind
  frente a CSS en un proyecto ya existente.

**Razonamiento [inferencia].** A un agente le cuesta sobre todo _encontrar_ todo lo que gobierna un
elemento y _demostrar_ que su cambio no afecta a nada más. Cuando el estilo está co-ubicado, las dos
cosas se resuelven en un solo fichero. Con CSS global hay que buscar con `grep`, recorrer las
`@media`, tener en cuenta los `#id` que suben la especificidad y la regla genérica que nadie
recuerda. Además, los nombres de Tailwind son vocabulario que el modelo ya conoce de otros proyectos,
mientras que `inv-cell-stack` exige leer este repo.

**Veredicto:** Tailwind ★★★★ (y ★★★★★ cuando `legacy.css` esté en capa y `@theme` completo) · CSS
global ★ · CSS scoped/modules ★★★★ (co-ubicado, pero escribe selectores y nombres) · Híbrido definido
★★★★★ si las reglas son explícitas, ★★ si es el híbrido sin reglas que hay hoy.

### 3.2 Mantenibilidad

**Hechos.**

- Código muerto: Tailwind solo emite las clases que encuentra en las fuentes [fuente: Detecting
  classes], así que una utilidad que nadie usa desaparece del build. En CSS global una regla muerta
  sigue en el bundle hasta que alguien la ve. [medido] Hoy hay 14 clases y ~168 líneas candidatas
  (`budget-block*`, `reports-guide-*`, `reports-layout`, `tx-layout`, `resend-btn`, `inv-legend`, …);
  `form-grid` y `tag-wrap` solo salen en el test visual. Con `<style scoped>` el código muerto se
  queda dentro del componente y **muere con él**, pero dentro del componente sigue sin detectarse.
- Duplicación [medido]: 17 `<table>` con 6 sistemas de estilo (`.table-wrap` en `@layer components`,
  `.inv-ledger`, `.tx-summary-table`, `.stockevents-table` scoped, utilidades en `MarketQuotesPanel`,
  `DashboardRecentTransactionsPanel` y `BudgetBlock`, y tablas sin clase que heredan `.table-wrap`).
  Hay 31 `text-transform: uppercase` entre `src/styles` y los componentes.
- Postura de Tailwind sobre la reutilización [fuente: Styling with utility classes, «Managing
  duplication»]: bucles, edición multicursor y, para reutilizar entre ficheros, **componentes**. CSS
  propio en `@layer components` solo cuando «a template partial feels heavy-handed». `@apply` está
  documentado sin censura para CSS propio o de terceros [fuente: Functions and directives], pero la
  página de compatibilidad **recomienda evitar los bloques `<style>` en Vue/Svelte/Astro**, porque se
  procesan por separado (builds más lentos, hay que usar `@reference`) y, si se usan, prefiere
  `var(--color-…)` a `@apply` [fuente: Compatibility, «Vue, Svelte, and Astro»].
- Nombres: CSS pide inventar un nombre por nodo (`inv-toolbar__group`, `inv-cell-stack`); Tailwind
  no [fuente: Tailwind, «You get things done faster»].

**Razonamiento.** Las cadenas de clases largas se leen peor (aquí la media es de 7,6 tokens por
atributo en `MarketQuotesPanel`), pero se arreglan extrayendo componentes, que es justo lo que falta
en `ui/`. Refactorizar es más seguro con estilos co-ubicados: si borras el componente, borras su
estilo.

**Veredicto:** Tailwind ★★★★ · Global ★ · Scoped/modules ★★★ · Híbrido ★★★★.

### 3.3 Cascade y colisiones

**Hechos.**

- `<style scoped>` de Vue añade un atributo `data-v-xxxx` a cada selector y elemento. El nodo raíz de
  un hijo recibe los estilos del padre y los suyos propios. Para bajar a los hijos se usa `:deep()`, y
  en componentes recursivos los selectores descendientes siguen filtrándose [fuente: Vue SFC CSS
  Features]. **Scoped protege hacia fuera, no hacia dentro:** las reglas globales de `legacy.css`
  siguen alcanzando a los componentes scoped.
- `<style module>` genera clases con hash y se usa con `$style`/`useCssModule()` [fuente: Vue]. Aísla
  más, pero Tailwind lo desaconseja por el coste de build y por necesitar `@reference` [fuente:
  Compatibility].
- `@layer`: las declaraciones normales sin capa ganan a las que tienen capa; con `!important` es al
  revés. Baseline _widely available_ desde marzo de 2022 [fuente: MDN `@layer`].
- `@scope`: raíz y límite («donut»), proximidad, especificidad cero en selectores sueltos, **no aísla
  la herencia**. Baseline _newly available_ 2026 [fuente: MDN `@scope`].
- Astro aplica scope a `<style>` con `data-astro-cid-*`; `is:global` y `:global()` para escapar
  [fuente: Astro Styling].
- [medido] Hoy el aislamiento se consigue con `#investment`/`#settings` como prefijo (235 reglas con
  id). La especificidad (1,x,y) resultante hace imposible sobrescribir desde fuera sin recurrir a
  otro id o a `!important`, y `css/no-important` ya es error en el lint.

**Veredicto:** Tailwind ★★★★★ (una clase afecta a un solo elemento, siempre que no haya CSS sin capa
por encima) · Global ★ · Scoped ★★★★ · Modules ★★★★★ · Híbrido ★★★★ con `legacy.css` en capa.

### 3.4 Consistencia del sistema de diseño y temas

**Hechos.** `@theme` define tokens que generan utilidades [fuente: Tailwind Theme/Directives]. El
repo ya lo hace para colores y fuentes, delegando en `var(--primary)` y compañía, así que el tema
oscuro cambia valores de variables en `:root[data-theme='dark']` y no clases [medido]. Con ese
enfoque, **la mayoría de retoques de tema oscuro no necesitan código por componente en ninguna de
las opciones** [inferencia]. Para los casos puntuales, Tailwind ofrece la variante personalizada
`[data-theme=dark]` [fuente: Dark mode]; en CSS, `:root[data-theme='dark'] .x {}` (10 reglas así hoy
[medido]).

**Razonamiento.** Tailwind obliga a usar la escala: un valor fuera de ella se nota porque exige
`[…]`. En CSS nada impide escribir `padding: 0.55rem 0.65rem` (ejemplo real de
`StockEventsSymbolTable`). El lint CSS (`tailwind-csstree`, `css/recommended`) solo mira ficheros
`**/*.css` y **no los `<style>` de Vue** [medido: `eslint.config.ts`], así que el CSS scoped queda
fuera del control de tokens.

**Veredicto:** Tailwind ★★★★★ (con `@theme` completo) · Global ★★★ · Scoped ★★ · Híbrido ★★★★.

### 3.5 Rendimiento

**Hechos.** El CSS del shell pesa 119 KB en crudo y 18,3 KB con brotli, y se sirve en todas las
rutas [medido]. Alrededor del 73% es `legacy.css`, que incluye reglas de pantallas que no se están
viendo (Inversión, Reports, etc.). Las utilidades ocupan 23,8 KB y se reutilizan entre pantallas.
Tailwind v4: builds completos 3,78× más rápidos, incrementales sin CSS nuevo 182× (en µs), detección
automática de fuentes que respeta `.gitignore`, construido sobre `@layer`, `@property` y
`color-mix()` [fuente: blog v4.0]. Astro inlinea el CSS de menos de 4 kB y enlaza el resto [fuente:
Astro Styling].

**Razonamiento.** Con utilidades, el CSS crece con el número de _clases distintas_ y no con el de
pantallas [fuente: Tailwind, «Your CSS stops growing»]. Pasar a scoped reparte el CSS entre los
chunks de cada isla (ya pasa con `TransactionsSection.css` y `SettingsSection.css`). En cualquier
caso, 18 KB comprimidos es poco para una SPA de uso personal, así que **el rendimiento no decide
aquí** [inferencia].

**Veredicto:** Tailwind ★★★★ · Global ★★ · Scoped ★★★★ · Híbrido ★★★★. Peso bajo en la decisión.

### 3.6 CSS moderno

**Hechos** [fuente MDN + medido en `@eslint/css` 1.4.0, `dist/data/baseline-data.js`]: nesting
(_widely_, 2023), `@layer` (_widely_, 2022), `@container` (_widely_, feb-2023), `:has()` (_widely_,
dic-2023), `@scope` (_newly_, 2026). La regla `css/use-baseline` es `error` en `css/recommended` con
`available: "widely"` por defecto, así que **`@scope` fallaría el lint en un `.css` de este repo**.
Tailwind v4 soporta Chrome 111, Safari 16.4 y Firefox 128 [fuente: Compatibility]. Trae container
queries (`@container`, `@sm:`), `starting:` y aplana el nesting con Lightning CSS [fuente: blog v4.0].

**Razonamiento.** El CSS moderno recorta mucho la distancia: nesting y `@layer` permiten escribir un
`legacy.css` ordenado, y `@scope` resolvería colisiones sin ids. Pero ninguna de estas herramientas
co-ubica el estilo con el marcado ni detecta código muerto, que son los dos problemas medidos aquí.

**Veredicto:** favorece a cualquier opción que no sea CSS global sin capa. Hoy `@scope` queda
descartado por el lint.

### 3.7 DX, curva de aprendizaje, accesibilidad, ecosistema

- DX: el repo ya tiene el tooling de Tailwind 4 (plugin Vite, `tailwind-csstree` en ESLint). La
  mitad de los componentes ya usa utilidades [medido].
- Accesibilidad: ninguna fuente primaria afirma que una opción sea más accesible que otra. Es neutral
  [inferencia]. Tailwind trae utilidades como `sr-only`, `focus-visible:` o `motion-reduce:`, y el
  repo ya usa `sr-only`.
- Longevidad: Tailwind Labs despidió al 75% de ingeniería en enero de 2026 [fuente: PR #2388].
  Después se anunciaron patrocinios (Vercel, Google AI Studio, etc.; fuente secundaria: devclass).
  [medido] Siguen saliendo versiones: 4.2.1 (2026-02-23) → 4.3.3 (2026-07-16) (`npm view tailwindcss
time`). Riesgo **moderado**: si Tailwind se detuviera, el CSS generado ya es CSS estándar
  (variables, capas) y las clases pueden congelarse [inferencia]. El CSS estándar no tiene riesgo de
  proveedor.

**Veredicto:** Tailwind ★★★★ (riesgo de proveedor moderado) · CSS ★★★★★ en longevidad.

### 3.8 Coste de migración en este repo

Ver la tabla de secciones en §2. [medido] Casi todas las clases siguen en uso: la migración es
trabajo real, no una limpieza. [inferencia] Orden de magnitud:

| Zona                                        | Líneas | Riesgo | Nota                                                                                                                                                         |
| ------------------------------------------- | -----: | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tokens + reset + tipografía                 |    173 | bajo   | Se quedan como CSS global (van a `global.css` con `@layer base`). No se migran a utilidades                                                                  |
| INVERSIÓN · CUADERNO                        |  1.194 | medio  | Todo cuelga de `#investment`, así que se borra de una vez al terminar. Recién hecho, con contexto fresco. Hay 4 pestañas y el test visual solo ve la primera |
| SETTINGS · LIBRO MAYOR                      |    320 | medio  | Diseño reciente y cuidado (ver memoria «libro mayor»)                                                                                                        |
| TX (layout, summary, query, dialog, tables) |   ~620 | alto   | `TransactionsTable.vue` tiene 580 líneas y mucha interacción                                                                                                 |
| APP SHELL + SIDEBAR                         |    744 | alto   | Lo renderiza Astro (`AppSidebar.astro`, …) y admite `<style>` con scope de Astro o utilidades                                                                |
| REPORTS                                     |    338 | bajo   | 6 de 21 clases sin uso                                                                                                                                       |
| RESPONSIVE                                  |    278 | —      | Transversal; se reparte entre las zonas                                                                                                                      |

**Mitigación.** Los 16 snapshots visuales solo cubren la vista por defecto de cada sección en tema
claro. **No cubren** el tema oscuro, los diálogos ni las pestañas secundarias. `CODING_STANDARDS.md`
pide cobertura visual antes de reescribir en masa, así que cada fase empieza ampliando snapshots de
su zona.

### 3.9 Patrones en Vue: scoped + Tailwind, CSS Modules y componentes como unidad

- **Scoped + Tailwind:** válido. Tailwind pide `var(--…)` dentro de `<style>` en vez de `@apply`
  (que obliga a `@reference`) [fuente: Compatibility, Directives]. Tiene sentido para `@keyframes`,
  selectores estructurales (`:first-child`, `:has()`), internals de terceros o de canvas y `v-bind()`
  en CSS [fuente: Vue].
- **CSS Modules:** el aislamiento más fuerte, pero no aporta nada que scoped no dé ya aquí, y Tailwind
  lo desaconseja. Descartado [inferencia + fuente].
- **Componentes como unidad:** es lo que recomiendan tanto Tailwind como shadcn, y la carencia medida
  más clara del repo (`ui/` casi vacío, 6 sistemas de tabla). `DataTable`, `Button`, `Field`, `Card`,
  `Dialog`, `Pill` y `KpiFact` absorberían gran parte de los estilos repetidos [inferencia].

## 4. Tabla comparativa

| Variable (peso)                        | Tailwind puro                                          | CSS global                   | CSS scoped / modules                | Híbrido definido                     |
| -------------------------------------- | ------------------------------------------------------ | ---------------------------- | ----------------------------------- | ------------------------------------ |
| Coste de agente: leer/localizar (alto) | ✅ ~1,4k tok, 2 llamadas                               | ❌ ~5k-34k tok, 5-6 llamadas | ✅ ~1,4k tok, 2 llamadas            | ✅ igual que Tailwind, si hay reglas |
| Coste de agente: escribir (bajo)       | ⚠️ crece con N elementos sin bucle                     | ✅ una regla                 | ✅ una regla                        | ✅                                   |
| Radio de impacto / error (alto)        | ✅ por elemento, ⚠️ trampas `dark:` y clases dinámicas | ❌ incidentes medidos        | ✅ hacia fuera, ⚠️ recibe lo global | ✅ si `legacy.css` va en capa        |
| Código muerto (medio)                  | ✅ no se emite                                         | ❌ 14 clases / ~168 líneas   | ⚠️ localizado, no detectado         | ✅                                   |
| Consistencia de tokens (medio)         | ✅ escala forzada                                      | ⚠️                           | ❌ el lint no mira `<style>` Vue    | ✅                                   |
| Legibilidad de plantillas (medio)      | ⚠️ cadenas largas (18% de tokens)                      | ✅                           | ✅                                  | ⚠️ se mitiga con componentes         |
| Rendimiento (bajo)                     | ✅                                                     | ⚠️ 87 KB en todas las rutas  | ✅ por chunk                        | ✅                                   |
| Longevidad / proveedor (bajo)          | ⚠️ moderado                                            | ✅                           | ✅                                  | ⚠️ moderado                          |
| Coste de migración (medio)             | ❌ el más alto (todo, incluidos los casos raros)       | ✅ ninguno                   | ⚠️ alto                             | ⚠️ alto, pero por fases              |

## 5. Recomendación y plan por fases

**Opción elegida: híbrido definido.** Reglas propuestas para `CODING_STANDARDS.md` (a acordar):

1. Utilidades Tailwind en la plantilla por defecto. Solo tokens de `@theme`; los valores arbitrarios
   solo si no hay token.
2. Un estilo que se repite entre ficheros va en un **componente** en `src/components/ui/`, no en una
   clase global ni en `@apply`.
3. `<style scoped>` solo para keyframes, selectores estructurales, terceros/canvas y `v-bind()`; con
   `var(--…)`, sin `@apply`.
4. CSS global solo para tokens, reset, tipografía base y shell. **`legacy.css` no admite bloques
   nuevos.**
5. El tema oscuro va por tokens; `dark:` solo con la variante personalizada.

**Fase 0 (cimientos, bajo coste, alto impacto):**

- Meter `legacy.css` en una capa: declarar el orden explícito (por ejemplo
  `@layer theme, base, legacy, components, utilities;`) e importar con
  `@import './legacy.css' layer(legacy);`. **Riesgo:** las reglas de `legacy.css` que hoy ganan a
  `@layer components` (`.primary-btn`, `.table-wrap th`, …) pasarían a perder. Hay que revisar con los
  16 snapshots y a mano en tema oscuro. Arregla sin más los `font-display` y `text-xl` muertos, y eso
  **cambiará la apariencia** de esas 3 cabeceras (decidir si se quiere).
- `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));`
- Completar `@theme`: `--color-line`, `--color-line-strong`, `--color-bg-*`, `--radius-*`,
  `--shadow-*`.
- Borrar las ~168 líneas candidatas a muertas, confirmando antes el uso dinámico y la aparición en
  el test visual.

**Fase 1 (primitivas):** `DataTable` (cabecera, celdas, `is-right`, fila de grupo, hover), `Button`
(sustituye a `primary/secondary/danger-btn`), `Field`/`Select`, `Card`, `Pill`/`Tag`, `Dialog`. Test de
componente para cada una.

**Fase 2 (por zona, siguiendo «migrar por zona tocada»):** antes de cada zona, añadir snapshots de
sus pestañas, diálogos y tema oscuro. Orden sugerido: Inversión (1.194 líneas bajo `#investment`, se
borra de una vez) → Settings (320) → Reports (338, parte muerta) → Transacciones (~620) → Shell y
Sidebar (744, en Astro). El bloque correspondiente de RESPONSIVE se reparte en cada zona.

**Fase 3:** lo que quede de `legacy.css` pasa a `global.css` (tokens, reset, tipografía) y se borra el
fichero.

**Alternativas, por si se descarta el híbrido:**

- _Todo CSS (scoped):_ Fase 0 igual (capa + `@theme` sigue sirviendo como fuente de variables), y
  cada zona se mueve de `legacy.css` al `<style scoped>` de su componente. Habría que extender el lint
  CSS a los bloques de Vue (hoy solo mira `**/*.css`). Pierdes detección de código muerto y la escala
  forzada.
- _Todo Tailwind:_ las mismas fases, pero también los keyframes, la tipografía base y los casos
  estructurales pasan a `@utility`/`@layer base`. Más coste por un beneficio marginal.
- _Seguir con CSS global ordenado (nesting + `@layer` por zona):_ es lo más barato, pero no resuelve la
  co-ubicación ni el código muerto, y `@scope` está bloqueado por el lint.

**Riesgos globales:** regresiones visuales fuera de la zona cubierta (tema oscuro, diálogos); el
riesgo de proveedor de Tailwind; plantillas más largas si no se extraen primitivas; y que durante la
transición convivan dos sistemas (se mitiga con la capa y con la regla de no crecer `legacy.css`).

## 6. Metodología y limitaciones

- **Tokens:** `tiktoken` `o200k_base` (tokenizador de OpenAI) instalado en un venv del scratchpad. El
  tokenizador de Claude no es público sin API y sus cifras absolutas serán distintas. **Lo que vale
  son los ratios.** Caracteres por token observados: 3,0-3,5 en CSS y 3,8-4,8 en plantillas Vue (una
  regla de chars/4 subestima el CSS).
- **Simulación de descubrimiento:** es un recorrido «prudente» diseñado a mano (leer el componente →
  `grep` de la clase → leer las zonas → revisar genéricos). Un agente real puede hacer más o menos
  pasos. No es una medición de agentes ejecutándose.
- **Código muerto:** búsqueda literal de cada clase en `src/` (`.vue/.astro/.ts/.js/.css/.html`). Las
  clases montadas dinámicamente darían falsos positivos, así que son **candidatas**.
- **Desglose del bundle:** reparto por bloques de primer nivel del CSS minificado. Atribuir «sin capa +
  `@media`» a `legacy.css` es una aproximación.
- **Prueba de cascade:** HTML mínimo con el CSS de producción en Chromium headless (Playwright). Las
  clases que no aparecen en las fuentes (p. ej. `normal-case`) no están en el build y no se pueden
  probar así.
- **Incidentes:** vienen del encargo; solo comprobé `.chart-canvas-wrap` y el caso `.card h3`.
- **Inferencias** marcadas como tales: sobre todo las estimaciones de migración y el razonamiento
  sobre la precisión de los agentes. No existe (que yo haya encontrado) un estudio controlado de tasa
  de error de LLM con Tailwind frente a CSS.
- Comandos principales: `wc -l/-c`, `awk` por cabeceras `/* ══`, `SENTRY_AUTH_TOKEN= pnpm build`,
  `gzip -9c | wc -c`, `brotli -c | wc -c`, `git log --format=%H -- src/styles/legacy.css`, scripts
  Python (regex sobre selectores) y un script de Playwright con `getComputedStyle`.

## 7. Fuentes

- Tailwind: Styling with utility classes, https://tailwindcss.com/docs/styling-with-utility-classes
- Tailwind: Functions and directives (`@apply`, `@reference`, `@custom-variant`, `@theme`), https://tailwindcss.com/docs/functions-and-directives
- Tailwind: Compatibility (navegadores, CSS Modules, «Vue, Svelte, and Astro»), https://tailwindcss.com/docs/compatibility
- Tailwind: Dark mode, https://tailwindcss.com/docs/dark-mode
- Tailwind: Detecting classes in source files, https://tailwindcss.com/docs/detecting-classes-in-source-files
- Tailwind: Adding custom styles, https://tailwindcss.com/docs/adding-custom-styles
- Tailwind: blog v4.0 (2025-01-22), https://tailwindcss.com/blog/tailwindcss-v4
- Tailwind Labs, PR #2388 (comentario de Adam Wathan, 2026-01-07), https://github.com/tailwindlabs/tailwindcss.com/pull/2388
- devclass (secundaria, patrocinios posteriores), https://devclass.com/2026/01/08/tailwind-labs-lays-off-75-percent-of-its-engineers-thanks-to-brutal-impact-of-ai/
- Vue: SFC CSS Features, https://vuejs.org/api/sfc-css-features.html
- Astro: Styling, https://docs.astro.build/en/guides/styling/
- MDN `@layer`, https://developer.mozilla.org/en-US/docs/Web/CSS/@layer
- MDN `@scope`, https://developer.mozilla.org/en-US/docs/Web/CSS/@scope
- MDN `:has()`, https://developer.mozilla.org/en-US/docs/Web/CSS/:has
- MDN `@container`, https://developer.mozilla.org/en-US/docs/Web/CSS/@container
- MDN CSS nesting, https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_nesting
- shadcn/ui: Introduction (principios), https://ui.shadcn.com/docs
- Anthropic: Prompting for frontend aesthetics, https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics
- Figma2Code (ICLR 2026), https://arxiv.org/abs/2604.13648
- WebUIBench (consultado y descartado como fuente de la cifra), https://arxiv.org/abs/2506.07818
