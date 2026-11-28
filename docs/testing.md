# Estrategia de Vitest

Vitest concentra las comprobaciones rápidas del proyecto en tres capas. El objetivo es que el bucle
local habitual tarde segundos y que cada regla se pruebe en el entorno más pequeño que la representa
con fidelidad.

## Capas

| Capa        | Ubicación            | Entorno            | Uso                                                    |
| ----------- | -------------------- | ------------------ | ------------------------------------------------------ |
| Unitarias   | `tests/unit/`        | Node               | Dominio, servicios, stores y utilidades puras          |
| Componentes | `tests/component/`   | happy-dom          | Props, eventos y estados visibles de componentes Vue   |
| Integración | `tests/integration/` | Node + SQLite real | Repositorios, migraciones, restricciones y aislamiento |

## Comandos locales

```bash
pnpm test                    # las tres capas, una ejecución
pnpm test:watch              # las tres capas en watch
pnpm test:unit               # solo unitarias
pnpm test:unit:watch         # unitarias en watch
pnpm test:component          # solo componentes Vue
pnpm test:component:watch    # componentes en watch
pnpm test:integration        # solo SQLite e integración
```

`pnpm test` es el comando por defecto para desarrollar y el que corre el CI. No arranca un navegador.

## Configuración

`vitest.config.ts` registra los proyectos unit, component e integration. Cada proyecto conserva su
propio entorno y patrones de inclusión:

- `vitest.unit.config.ts`: Node para lógica sin DOM.
- `vitest.component.config.ts`: Vue Test Utils y happy-dom.
- `vitest.integration.config.ts`: procesos aislados para SQLite real.

Los casos de la CLI de reparación necesitan un archivo para comprobar persistencia. Lo crean
serializando el fixture SQLite ya migrado en memoria: repetir cada sentencia de migración como
una transacción de disco hacía que la preparación agotase el timeout bajo carga. La CLI sigue
abriendo el archivo real y los casos de simulación y ejecución comprueban sus datos al reabrirlo.

No hay umbral de cobertura: un test existe porque protege una regla, no para tocar líneas.
`pnpm check` ejecuta además `vue-tsc` sobre los SFC.

## Criterios para tests nuevos

La regla única y las de recorridos E2E están en [CODING_STANDARDS](../CODING_STANDARDS.md#tests):
un test sobrevive a un rediseño o refactor, y la estética se revisa a mano.

Un test vale si, al romper la regla que protege, falla con un mensaje que explica qué se rompió, y
si no falla cuando solo cambia la implementación. Sobra cuando:

- solo ejecuta código para tocar líneas: sin aserción, o con una que no puede fallar (`toBeDefined`
  sobre algo que siempre existe, un mock que se comprueba a sí mismo);
- repite lo que ya prueba otro test en la misma capa, o en una más baja con la misma fiabilidad;
- afirma la implementación (llamadas internas, orden de llamadas a mocks propios, clases CSS,
  estructura del DOM, getters privados) en vez de una salida o un efecto observable;
- calcula el valor esperado con la misma lógica que el código, o lo copia de una ejecución;
- prueba el framework o una librería (que Vue renderiza, que Zod valida un tipo, que Pinia guarda);
- en E2E, comprueba una cifra o una regla que un unit ya cubre, en vez de un recorrido del usuario.

1. Prueba la regla en la capa más baja que pueda representarla de forma fiable.
2. Un test debe fallar por una sola razón observable.
3. Usa datos y nombres deterministas; no dependas del orden global de la suite.
4. Mockea límites externos, no la unidad que intentas validar.
5. Una regresión corregida incluye el test que la reproduce.
6. No aumentes timeouts o workers para ocultar una carrera; corrige el aislamiento.
7. En happy-dom, `select.value` deja de seguir a `v-model` cuando las opciones cambian después de
   montar. Comprueba lo que se guarda (el evento emitido o el store), no `select.value`.
8. En los round-trip, `trip.reload()` crea un Pinia nuevo: vuelve a obtener los stores después de
   recargar, porque las referencias anteriores apuntan al Pinia viejo.

## Cuarentena de tests inestables (#233)

[Issue #233](https://github.com/alberba/finance-tracker/issues/233) permite poner en cuarentena los
casos afectados mientras se investiga su sincronización. Un caso en cuarentena usa `test.fixme`,
conserva sus aserciones y no aumenta timeouts ni cambia workers. Ahora no hay ninguno.

Los escenarios autenticados usan identidad y estado aislados preparados por el runtime de
pruebas. Para ejecutar la suite completa y mantener su presupuesto, consulta
[Playwright](playwright.md#mantener-el-presupuesto).

Para levantar una cuarentena, retira el marcador, corrige la espera de finalización o el
aislamiento en la capa que corresponda y verifica diez ejecuciones consecutivas de `pnpm test`
y `pnpm test:e2e` con el caso activo, como exige #233. Una ejecución aislada en verde no basta
para demostrar estabilidad bajo carga.
