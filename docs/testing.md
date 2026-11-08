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
pnpm test:coverage           # informe conjunto y umbrales
```

`pnpm test` es el comando por defecto para desarrollar. No genera coverage ni arranca un navegador.

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

El informe de coverage incluye componentes, composables, dominio, librerías, servicios y stores. Los
umbrales representan el mínimo actual y deben subir con código nuevo; no se deben excluir módulos
solo para mejorar el porcentaje. El HTML se escribe en `coverage/`.

## Criterios para tests nuevos

La regla única y las de recorridos E2E están en [CODING_STANDARDS](../CODING_STANDARDS.md#tests):
un test sobrevive a un rediseño o refactor, y la estética se revisa a mano.

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
casos afectados mientras se investiga su sincronización. Se conservan las aserciones y no se
aumentan timeouts ni se cambian workers:

- `finance-tracker.spec.ts`: solo el caso «home no muestra bloque legacy de filtros en movimientos»
  usa `test.fixme`. Falló buscando `#transactions` tras un `page.goto('/')` que no espera la señal
  `data-finance-ready`. Astro dev registró además un error de hidratación de Vue:
  `Cannot define property sectionEl, object is not extensible`. No se ha demostrado que ese error
  explique los fallos históricos de la issue.

Los escenarios autenticados usan identidad y estado aislados preparados por el runtime de
pruebas. Para ejecutar la suite completa y mantener su presupuesto, consulta
[Playwright](playwright.md#mantener-el-presupuesto).

Para levantar la cuarentena, retirar los marcadores, corregir la espera de finalización o el
aislamiento en la capa que corresponda y verificar diez ejecuciones consecutivas de `pnpm test`
y `pnpm test:e2e` con los casos afectados activos, como exige #233. Una ejecución aislada en verde
no basta para demostrar estabilidad bajo carga.
