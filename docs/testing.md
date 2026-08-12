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

El informe de coverage incluye componentes, composables, dominio, librerías, servicios y stores. Los
umbrales representan el mínimo actual y deben subir con código nuevo; no se deben excluir módulos
solo para mejorar el porcentaje. El HTML se escribe en `coverage/`.

## Criterios para tests nuevos

1. Prueba la regla en la capa más baja que pueda representarla de forma fiable.
2. Un test debe fallar por una sola razón observable.
3. Usa datos y nombres deterministas; no dependas del orden global de la suite.
4. Mockea límites externos, no la unidad que intentas validar.
5. Una regresión corregida incluye el test que la reproduce.
6. No aumentes timeouts o workers para ocultar una carrera; corrige el aislamiento.
