# Estrategia de testing

Este proyecto usa una pirámide de pruebas deliberada: la mayor parte de la lógica se valida con
Vitest, los contratos de Vue con Vue Test Utils y solo los recorridos que necesitan un navegador
real llegan a Playwright. El objetivo es que el bucle local habitual tarde segundos y que CI aporte
la cobertura completa sin ejecutar trabajo duplicado.

## Capas

| Capa          | Ubicación                         | Entorno            | Uso                                                    |
| ------------- | --------------------------------- | ------------------ | ------------------------------------------------------ |
| Unitarias     | `tests/unit/`                     | Node               | Dominio, servicios, stores y utilidades puras          |
| Componentes   | `tests/component/`                | happy-dom          | Props, eventos y estados visibles de componentes Vue   |
| Integración   | `tests/integration/`              | Node + SQLite real | Repositorios, migraciones, restricciones y aislamiento |
| E2E funcional | `tests/e2e/`                      | Chromium           | Recorridos críticos entre UI, API y persistencia       |
| Visual        | `tests/e2e/layout-visual.spec.ts` | Chromium móvil     | Layout, accesibilidad táctil y snapshots               |
| Sync v2       | specs dedicadas en `tests/e2e/`   | Chromium           | Offline, conflictos y aislamiento multiusuario         |

No añadas un E2E para una regla que pueda probarse de forma fiable en una capa inferior. Los E2E
deben describir comportamiento de usuario, usar roles o el Page Object y evitar esperas temporales
arbitrarias.

## Comandos locales

### Bucle rápido

```bash
pnpm test                    # todas las capas de Vitest, una ejecución
pnpm test:watch              # Vitest en watch
pnpm test:unit               # solo unitarias
pnpm test:component          # solo componentes Vue
pnpm test:integration        # solo SQLite/integración
pnpm test:e2e:smoke          # recorridos críticos etiquetados @smoke
```

`pnpm test` es el comando por defecto para desarrollar. No genera coverage ni arranca un navegador.

### Gates completos

```bash
pnpm test:coverage           # coverage conjunto y umbrales
pnpm test:e2e                # funcional, sin snapshots visuales
pnpm test:e2e:visual         # layout y regresión visual
pnpm test:e2e:sync-v2        # flujo con PUBLIC_SYNC_V2=true
pnpm test:all                # todos los anteriores, secuenciales
```

Las suites completas de Playwright construyen la aplicación y la sirven con Wrangler para probar el
artefacto Cloudflare real. Los comandos smoke, headed y UI usan Astro dev para arrancar antes:

```bash
pnpm test:e2e:headed
pnpm test:e2e:ui
```

Para probar una URL ya arrancada, evita que Playwright gestione otro servidor:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4321 pnpm test:e2e:smoke
```

## Coverage

El informe cubre componentes, composables, dominio, librerías cliente y servidor, servicios y stores.
Los umbrales en `vitest.config.ts` fijan el mínimo real actual y deben subir con código nuevo; no se
deben excluir módulos solo para mejorar el porcentaje. El HTML se escribe en `coverage/`.

## Playwright estable

- Cada prueba recibe un namespace único; no comparte estado con otras pruebas.
- La navegación espera `html[data-finance-ready="true"]`, que señala hidratación y bindings completos.
- La configuración limita el paralelismo local a dos workers, corta pronto tras fallos y conserva
  trace/vídeo únicamente en el primer retry.
- `@smoke` identifica un recorrido crítico por dominio. `@visual` vive en una suite separada.
- Desktop cubre los flujos funcionales. Pixel 5 cubre navegación móvil, layout y snapshots una sola
  vez; no se duplican los mismos tests en dispositivos equivalentes.
- No uses `waitForTimeout`. Espera una respuesta, URL, locator o señal explícita de la aplicación.

Si una prueba falla, abre `playwright-report/index.html`. En CI se combinan los cuatro shards, visual
y sync-v2 en un único artifact `playwright-report`. Las trazas se abren con:

```bash
pnpm exec playwright show-trace test-results/ruta-a-trace.zip
```

## CI

El workflow `.github/workflows/playwright.yml` tiene estas ramas paralelas:

1. Calidad: lint, Astro check, coverage Vitest, migraciones D1 y build.
2. E2E funcional: cuatro shards independientes.
3. Regresión visual.
4. Sync v2, como gate bloqueante.
5. Informe: reúne los blob reports aunque una suite falle.

Las ejecuciones anteriores de la misma rama se cancelan, pnpm usa la caché oficial de setup-node y
los artifacts se retienen 14 días. Un cambio de snapshots debe revisarse visualmente y actualizarse
de forma explícita con `pnpm test:e2e:visual --update-snapshots`.

## Criterios para tests nuevos

1. Prueba primero la regla en la capa más baja posible.
2. Un test debe fallar por una sola razón observable.
3. Datos y nombres deben ser deterministas; no dependas del orden global de la suite.
4. Mockea límites externos, no la unidad que intentas validar.
5. Una regresión corregida incluye el test que la reproduce.
6. No aumentes retries, timeouts o workers para ocultar una carrera; corrige la señal de readiness o
   el aislamiento.
