# Estándares de tests

**Criterio de entrada:** cada test nombra en una frase el defecto o la regla que evita. Si no se
puede nombrar, el test no se escribe; si ya existe, se poda. Un test es una especificación de
comportamiento observable, no una descripción de la implementación.

Este documento manda sobre cualquier otra regla de test del repositorio. `docs/testing.md` y
`docs/playwright.md` explican la estrategia, los comandos y el porqué; `CODING_STANDARDS.md` resume
las reglas y remite aquí. Si una narrativa contradice este fichero, es deriva y se corrige la
narrativa.

## Escribir

1. **Ningún test es fiable hasta que lo has visto en rojo.** Revierte el fix si es un bug, o muta
   la condición que protege si es una regla nueva, y confirma que falla por la razón correcta. Una
   mutación inventada para que el test falle no cuenta. Deja en la PR la tabla
   _mutación → tests que fallan_ de los tests nuevos o reescritos; un test sin fila no se entrega.
2. **La capa más baja que represente la regla con fidelidad.** Unit, component, integration o E2E
   según `docs/testing.md`; no subas de capa por comodidad ni bajes saltándote la persistencia.
3. **Un test falla por una sola razón observable.** Nómbralo por el comportamiento, no por el
   helper ni por la fase interna. Nada de aserciones sobre flags de fase, closures, orden
   accidental de helpers, métodos privados o la forma de un snapshot.
4. **Datos y nombres deterministas.** Sin depender del orden global de la suite; sin `Date.now()` o
   zona horaria sin fijar (`vi.setSystemTime`, `page.clock.setFixedTime`); sin ids aleatorios sin
   sembrar. Aísla y limpia el almacenamiento (IndexedDB, SQLite, `localStorage`) por test y por
   usuario.
5. **Mockea el límite externo, no la unidad que validas.** `fetch`, proveedores de mercado, reloj,
   criptografía, correo y `cloudflare:workers` se controlan en el borde. Los repositorios, SQLite
   real, IndexedDB real y los stores bajo prueba se usan de verdad cuando la garantía es de
   persistencia. No mockees `src/domain`, `src/services`, `src/stores`, `src/db` ni el sujeto bajo
   prueba para que el test pase. `clearMocks`/`restoreMocks` ya están activos: no los desactives.
6. **Una regresión corregida incluye el test que la reproduce**, nombrado por el defecto. Se
   conserva.
7. **Ajusta la implementación, no el test.** Una aserción solo se debilita si cambia el
   comportamiento esperado, y la PR lo explica. No añadas `skip`, `fixme`, timeouts ni reintentos
   para tapar una carrera.
8. **Lo temporal se valida en la PR, no en la suite.** Un backfill, una reparación o un script de un
   solo uso se comprueba con una ejecución anotada, no con un test permanente. Una migración
   versionada sí es permanente: añade su caso de integración y no la borres al cerrar la PR.

## Unit, component e integration

9. **Unit:** Node puro, dominio, servicios, stores y utilidades. Sin DOM ni IndexedDB si la regla se
   puede representar sin ellos. Si el caso necesita DOM, va a component. En Astro, las rutas,
   endpoints y middleware se prueban en integration; las islas Vue en component; el shell y el
   markup estático se cubren por E2E, no por unit. Los tipos se comprueban con `pnpm check`, no con
   tests de runtime.
10. **Component:** monta el componente real, pásale props y comprueba lo que el usuario ve o emite.
    Localiza por rol, etiqueta, texto o `data-*`, nunca por clases. No uses `wrapper.vm`, métodos
    internos ni estado privado, y no uses `shallowMount` por defecto: cuanto más se stubbea, menos
    se parece a producción. En happy-dom, `select.value` deja de seguir a `v-model` al cambiar las
    opciones: comprueba el evento o el store, no `select.value`.
11. **Integration:** SQLite real con `migrations-v2/` aplicadas para repositorios, restricciones y
    aislamiento; `fake-indexeddb` real para cola y caché, reiniciando el runtime para demostrar
    recuperación. Un round trip recorre ida y vuelta por la interface pública, no por la fila que
    el test acaba de escribir. Cada test abre su SQLite en memoria y la cierra; si otra conexión
    tiene que ver los commits, usa un fichero temporal propio y no compartas la base.
12. **La interface pública es la costura.** Los tests de aceptación, recuperación y errores pasan
    por la misma interface que los callers; no por fases, closures o flags internos. Si el test
    necesita espiar un helper privado, la costura está mal elegida.

## E2E

13. **Antes de escribir varios E2E, propón la lista** (caso, tag, roles y defecto que evita) y espera
    validación, salvo que el ticket ya enumere los casos. Lo que queda sin cubrir se anota en la PR;
    no se rellena con casos por rellenar.
14. **Los selectores de estructura o repetidos viven en el Page Object** (`tests/e2e/pages/`). El
    spec llama a métodos con nombre de negocio y, para una aserción puntual, usa un locator
    user-facing (rol, etiqueta, texto o `data-*`) acotado al Page Object; nunca clases CSS. Un
    selector que aparece en dos specs se mueve al Page Object.
15. **El test falla si le faltan datos.** Un `test.skip()` condicional por datos da un verde falso:
    el fixture crea lo que necesita o el test falla. Un skip de capacidad (por ejemplo, una API que
    solo existe en Chromium) se declara a nivel de fichero con su motivo. Cada escenario autenticado
    importa `test` de `tests/e2e/fixtures.ts`, crea su usuario aislado e inicializa su espacio por la
    API.
16. **Espera señales de la app, no tiempo.** `page.waitForTimeout` está prohibido y el lint lo
    bloquea; usa locators,
    aserciones web-first, la respuesta de la operación concreta o
    `html[data-finance-ready="true"]`. Para recargar, `tracker.reload()`; el lint rechaza
    `page.reload()` en los specs.
17. **`@smoke` es autosuficiente** y cubre recorridos críticos. Los escenarios que necesitan volumen
    no son smoke: corren en Browser regression o en `pnpm test:all`, no en el gate de PR. `@visual`
    corre como gate independiente y `@snapshot` fija identidad y tiempo antes del primer render.
18. **Un contrato no se repite por viewport o tema.** Añade una combinación solo si hay una
    diferencia de comportamiento o de layout concreta. Los snapshots Linux se actualizan a mano tras
    revisar el diff: un cambio de texto, pestaña o fecha es real; el antialiasing es ruido. Una vista
    visual comprueba geometría y píxeles en el mismo escenario cuando usa el mismo estado; conserva
    escenarios separados para estados o recorridos independientes y no compartas usuarios mutables
    para ahorrar preparación.
19. **Sin carreras tapadas.** No subas timeouts o workers ni añadas reintentos para estabilizar;
    corrige el aislamiento. En CI, un caso que solo pasa al reintentarlo falla el gate
    (`failOnFlakyTests`). La cuarentena es solo el procedimiento de #233, con sus diez ejecuciones.
    El presupuesto de la suite completa es de seis minutos de reloj (`pnpm test:all`); los cambios de
    infraestructura registran tres ejecuciones consecutivas locales y de Browser regression con
    duración y resultado. No se reduce cobertura ni se relajan umbrales visuales para conseguirlo;
    toda fusión o eliminación identifica la cobertura que queda.

## Revisar y podar

20. **Señales de un test que sobra:** comprueba llamadas a mocks en vez de estado o resultado;
    mockea servicios propios; su única aserción es `toBeTruthy`, `toBeDefined` o `not.toBeNull`;
    prueba un getter o formateador sin lógica; repite lo que ya garantiza el framework o la config
    (Zod, middleware de auth, alias de Vite, tokens de Tailwind); repite el riesgo de otro test; su
    arrange no crea lo que dice su nombre; repite geometría o contrato por viewport sin diferencia;
    su único assert es un snapshot grande sin diff revisado.
21. **Borrar un test de poco valor es una mejora.** Si un refactor sin cambio de comportamiento lo
    rompe, reescríbelo contra la vía pública o bórralo; no lo acoples a la implementación.
22. **Los umbrales de coverage representan el mínimo actual y suben con código nuevo.** No se
    excluyen módulos para mejorar el porcentaje.
23. **Una PR con tests escritos por IA indica qué queda sin cubrir y por qué.** Antes de entregarse,
    un agente sin el contexto de quien los escribió clasifica cada test nuevo como esencial,
    prescindible o borrar; se borran los dos últimos. Más de 3 tests nuevos exigen proponer antes la
    lista (test y defecto que evita), salvo que el ticket ya la enumere.

## Ejecución

- `pnpm test` es el comando por defecto (las tres capas). Durante el trabajo, acota por fichero o
  proyecto (`pnpm exec vitest run --project unit <ruta>`); no esperes al final para el bucle rojo.
- Antes de la PR: `pnpm gate` (dependencias, lint, tipos y suite) y `pnpm test:e2e:smoke` en
  secuencia para cambios de código, configuración o contenido ejecutable.
- E2E: `pnpm test:e2e:install` una vez; `pnpm test:e2e --project=chromium` para funcional;
  `pnpm test:e2e:sync-v2` para offline y sincronización; `pnpm test:e2e:visual` para píxeles.
- Worktrees: `pnpm setup:worktree` antes de probar. `pnpm test:e2e` arranca su propio servidor en un
  puerto derivado de la ruta del worktree; no lances suites pesadas contra el mismo servidor.
- Coverage: `pnpm test:coverage` (manual; no está en `pnpm gate` ni en CI). Los umbrales de
  `vitest.config.ts` se suben, nunca se bajan; no se excluyen módulos para mejorar el porcentaje.

## Cómo lo aplican los agentes

- `AGENTS.md` obliga a leer este documento antes de escribir, modificar o borrar un test.
- La skill `tdd` lo lee antes de empezar el ciclo rojo-verde; la skill `code-review` lo añade a las
  fuentes del eje Standards.
- Un agente que vaya a añadir más de 3 tests propone antes la lista (test y defecto que evita), salvo
  que el ticket ya la enumere. Una PR con tests de IA indica lo que queda sin cubrir y pasa la
  revisión independiente de la regla 23.

## Checklist de PR de tests

- [ ] Cada test nuevo o reescrito tiene su fila en la tabla _mutación → tests que fallan_.
- [ ] Está en la capa correcta y prueba la interface pública, no la implementación.
- [ ] Datos, ids, reloj y almacenamiento son deterministas y aislados.
- [ ] No hay `skip`/`fixme`/timeouts/reintentos nuevos para tapar una carrera.
- [ ] Los E2E usan Page Objects, esperan señales y no repiten contratos por viewport.
- [ ] Los tests nuevos de IA están clasificados (esencial/prescindible/borrar) y se han podado los
      dos últimos grupos.
- [ ] Si hubo código nuevo, los umbrales de coverage han subido.
- [ ] `pnpm gate` y, si toca navegador, las specs E2E afectadas están en verde.

## Fuentes

- Repo: `docs/testing.md`, `docs/playwright.md`, `CODING_STANDARDS.md`, `CONTRIBUTING.md` y los ADR
  citados en ellos.
- Vitest: <https://vitest.dev/guide/learn/testing-in-practice>,
  <https://vitest.dev/guide/mocking>, <https://vitest.dev/guide/parallelism>,
  <https://vitest.dev/guide/learn/writing-tests-with-ai>.
- Playwright: <https://playwright.dev/docs/best-practices>,
  <https://playwright.dev/docs/test-assertions>, <https://playwright.dev/docs/locators>,
  <https://playwright.dev/docs/browser-contexts>, <https://playwright.dev/docs/pom>,
  <https://playwright.dev/docs/test-fixtures>, <https://playwright.dev/docs/test-timeouts>.
- Vue: <https://vuejs.org/guide/scaling-up/testing>,
  <https://test-utils.vuejs.org/guide/advanced/stubs-shallow-mount>.
- Astro: <https://docs.astro.build/en/guides/testing/>.
- Prioridad de locators y Testing Trophy: <https://testing-library.com/docs/queries/about/#priority>,
  <https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications> (opinión, no regla del
  repositorio).
- Idea de partida (otro repositorio, otro lenguaje): `ISITECHSL/lucia`,
  rama `tests/acelerar-setup-pytest`, `TESTING_STANDARDS.md`.
