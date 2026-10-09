# Interfaz única de sincronización para los stores

No vamos a sustituir las llamadas `void syncX(...)` de los stores por un único punto de
entrada que registre y ordene los cambios de una acción.

## Por qué está fuera de alcance

La propuesta era un módulo más profundo: una sola interfaz que ordene por dependencias
(categoría → movimiento → pendiente), comparta un mapa de ids por cambio y encole en serie.
Es una idea razonable, pero:

- **No hay un fallo que la justifique.** El fallo real (#283) era una carrera de ids de
  categoría al confirmar un pendiente de inversión. #285 lo corrigió encadenando las
  sincronizaciones dependientes y lo cubrió con un test determinista
  (`tests/unit/recurring-confirm-category-sync.test.ts`). El mismo arreglo cubrió
  `refreshPending` y `removeRule`.
- **Las demás acciones compuestas no comparten dependencias.** Las que lanzan varias
  sincronizaciones (`addMovement`, `saveEditedMovement`, `saveContribution`) mezclan
  entidades independientes (Stock Events, snapshots, aportes). `addSubscription` envía
  `categoryId` nulo además de `categoryName`, y el esquema del servidor lo admite.
- **El coste es desproporcionado.** Tocaría ocho stores y la mayor parte de
  `command-mapping.ts` y `movement-commands.ts`, además de `docs/architecture/sync-v2.md`,
  para eliminar un riesgo que hoy se resuelve en la acción concreta que lo tiene.
- **El `void` es deliberado.** El cliente es offline-first: la interfaz no espera a la
  sincronización. Una cola única en serie añadiría un punto de acoplamiento entre stores
  que hoy son independientes.

## Cuándo reabrirlo

Si vuelve a aparecer una carrera de orden entre sincronizaciones de la misma acción, el
arreglo local sigue siendo la primera opción: encadenar las dos llamadas y añadir un test
determinista como el de #285. Conviene reconsiderar esta propuesta si ese patrón se repite
en más de una acción nueva, o si aparece una tercera entidad que dependa de ids de otra
creada en la misma acción.

## Prior requests

- #284: «Profundizar la frontera de sincronización: un único punto para registrar cambios de los stores»
