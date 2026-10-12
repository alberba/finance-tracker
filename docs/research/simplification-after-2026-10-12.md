# Simplificación #300: comparación después — 12 de octubre de 2026

> Medición intermedia previa al cierre completo de v1. Las cifras finales tras la
> ampliación del propietario están en [cierre de legacy](legacy-retirement-2026-10-12.md).

Código medido: `c0e7da0cc78c56673dfe4d2b6fc4098e8170ee74`, sin cambios versionados pendientes. La línea base publicada en `034272e` mide `2ba9065`. [Línea base](simplification-baseline-2026-10-11.md) y [captura después con inventarios y muestras](simplification-after-2026-10-12.json). Los commits posteriores de documentación y PNG no cambian el código medido.

## Mecanismos

| Medida estática                                    |            Antes | Después |
| -------------------------------------------------- | ---------------: | ------: |
| Archivos atravesados por cambio de mes             |                5 |       3 |
| Escrituras de mes por acción                       |                2 |       1 |
| Slots de callbacks del dashboard                   |                4 |       0 |
| Bucles de sondeo de recurrencia                    |                2 |       0 |
| Máximo teórico de esperas de turno del sondeo      |              200 |       0 |
| Handlers externos de persistencia financiera       |                2 |       0 |
| Llamadas al selector de rollout en `src`           | 24 en 9 archivos |       0 |
| Protocolos de persistencia del cliente autenticado |                2 |       1 |

El límite de 200 era una cota estática, no una latencia observada. El protocolo legacy del servidor permanece por los consumidores y compromisos descritos abajo.

## LOC

Misma herramienta cloc 2.06, hash y cohortes versionadas; Astro como HTML. Se excluyen documentación, skills, semillas JSON, dependencias, build y lockfile (7.441 líneas no vacías de datos, sin cambios).

| Cohorte       |  Antes | Después | Diferencia |
| ------------- | -----: | ------: | ---------: |
| Aplicación    | 36.782 |  36.668 |       -114 |
| Tests         | 27.536 |  27.928 |       +392 |
| Herramientas  |  4.744 |   4.744 |         +0 |
| Migraciones   |    725 |     725 |         +0 |
| Configuración |    803 |     800 |         -3 |
| Total         | 70.590 |  70.865 |       +275 |

| Alcance de auditoría                    | Antes | Después | Diferencia |
| --------------------------------------- | ----: | ------: | ---------: |
| Dashboard fijo                          |   168 |     119 |        -49 |
| Recurrencia fija                        |   514 |     586 |        +72 |
| Puente legacy fijo                      | 1.165 |     882 |       -283 |
| Dashboard funcional ampliado            |   671 |     632 |        -39 |
| Recurrencia y mapeo funcional ampliados | 1.143 |   1.268 |       +125 |

Los alcances se solapan; no se suman al total. El dashboard ampliado incluye las rutas y navegación compartida además de los tres archivos originales. La recurrencia ampliada incluye el store, mapeo, builder de movimientos y panel que llama al store. Sus listas, inventarios antes/después, líneas físicas y deltas están en el JSON.

La recurrencia crece 125 LOC en el alcance funcional: el sondeo se sustituye por coordinación de encolado y recuperación de fallos parciales. Esto no es una reducción de líneas ni un traslado oculto. El código de aplicación total baja 114 LOC; las pruebas crecen 392 LOC, por lo que el total medido sube 275 LOC. Formato y clasificación de plantillas también influyen; estas cifras no miden tiempo humano ni prueban por sí mismas mejor diseño. La captura inicial ya incluía la retirada local de clean-code, por lo que no permite atribuirle un efecto antes/después.

## Tamaños

Bytes lógicos y gzip independiente por archivo, con el mismo método de la línea base.

| Artefacto        | Antes, bytes | Después, bytes |  Antes, gzip | Después, gzip |
| ---------------- | -----------: | -------------: | -----------: | ------------: |
| Fuente de código |    1.471.043 |      1.460.406 | No capturado |       469.746 |
| JS cliente       |    1.170.216 |      1.167.157 |      395.735 |       394.609 |
| CSS cliente      |       73.027 |         73.027 |       13.497 |        13.497 |
| JS servidor      |    4.642.301 |      4.643.033 | No capturado |     1.065.163 |

JS cliente: -3,059 bytes y -1,126 bytes gzip; CSS sin cambios. El servidor cambia +732 bytes. Son diferencias pequeñas; el JSON conserva cada chunk, tamaño y hash.

## Tiempos y navegador

Node v24.16.0, pnpm 10.26.0, macOS 26.6.2 ARM64, adaptador Cloudflare, dependencias calientes y subida de source maps desactivada. Sin builds ni tests concurrentes durante las capturas de tiempo. El agente de visuales no ejecutó pruebas durante este intervalo. La captura publicada corresponde al código final después de restaurar el footer; las capturas intermedias anteriores a esa corrección no se usaron para escoger un resultado más favorable.

| Medida                             |      Antes |    Después |
| ---------------------------------- | ---------: | ---------: |
| Build final, una muestra           |    7,060 s |    6,197 s |
| 69 tests focalizados, mediana de 3 |    4,279 s |     4,42 s |
| Primer encabezado visible          |   790,3 ms |     704 ms |
| DOMContentLoaded                   |   486,6 ms |   440,6 ms |
| FCP                                |     192 ms |     188 ms |
| LCP temprano                       |     456 ms |     412 ms |
| JS transferido                     | 287,45 KiB | 286,59 KiB |
| JS decodificado                    | 802,53 KiB | 799,87 KiB |
| Peticiones JS                      |         33 |         33 |
| Ejecución JS                       |  227,23 ms |  204,79 ms |
| Tareas                             |  689,13 ms |  623,22 ms |
| Long tasks                         |          2 |          2 |
| Duración de long tasks             |     351 ms |     303 ms |

Las tres muestras de tests son 4,357 / 4,42 / 4,596 s; todas pasan los mismos 69 casos en seis archivos. La mediana aumenta unos 141 ms (+3,3 %). Con tres muestras y variación de carga, no se acredita una mejora ni se atribuye causalidad a esa diferencia. Build final tiene una sola muestra.

El benchmark conserva el script (hash verificado), Chromium, demo, CPU ×4, 40 ms, 10 Mbps, siete contextos nuevos, cache y service workers desactivados y terceros bloqueados. Muestrea después de dos frames: el encabezado visible no demuestra hidratación completa y LCP es temprano. No mide sesión autenticada, encolado IndexedDB, D1 o producción. El encabezado varía entre 693,4 y 1143,2 ms en las siete muestras posteriores; no convertir la diferencia de mediana en una promesa de velocidad. Las siete muestras completas y el perfil están en el JSON.

## Inventario y ejecución

Descubrimiento general: 374 → 375 casos en los mismos 23 archivos; suite dedicada v2: 9 → 9 casos en cinco archivos. De los generales, 212 son visuales: 108 capturas y 104 checks de layout. Los otros 163 incluyen una cuarentena previa. Descubrir un test no significa ejecutarlo.

Tres títulos cambian conservando su recorrido: periodo del dashboard entre secciones; persistencia sin caché local mediante contexto nuevo; logout y borrado de datos privados ahora v2. Se añade el recorrido de periodo, tarjetas e historial en demo. El JSON guarda la correspondencia de títulos y todos los casos.

Validación final del código:

- `pnpm gate` en checkout limpio: 159 archivos y 1.260 tests de unit, component e integration; lint y Astro check pasan (seis hints de deprecación existentes). El checkout principal conserva scratchs ignorados del usuario en `.wrangler/d1-recovery-2026-10-04`; no se editaron para hacer pasar lint.
- E2E general: 162 casos activos pasan y se conserva una cuarentena previa. La ejecución completa se detuvo tras 128 pases por un selector `#save-status` legacy restante; después de sustituirlo por `tracker.waitForSync`, los 40 casos del grupo restante pasan, incluidos los seis de ajustes que ya habían pasado. No se declara una única ejecución completa en verde.
- Suite dedicada v2: 9/9, incluidos offline, conflicto concurrente, aislamiento, Bitvavo y cobro sin duplicados.
- Build de producción y los tres runs focalizados pasan; mismos perfiles que la línea base.
- Capturas Linux: **108/108** en la comparación completa final sin update. Se regeneran únicamente las dos capturas de menú expandido por el email ficticio estable de cada escenario; su diff queda limitado a la línea del email (321/306 píxeles). Las capturas de demo originales pasan tras restaurar el footer. Un run anterior mostró un desplazamiento horizontal de pestañas de Preferencias: se inspeccionó el diff, pasó al repetir ese único caso y luego pasó la suite completa; no se actualizó esa imagen ni se cambió el umbral. No se atribuye causalidad del scroll al cambio de identidad sólo porque otro caso similar dejara de fallar.
- Layout: 100/104. Los cuatro fallos de dashboard/dashboard-pending en móvil y escritorio señalan barras de 8×56 px. Se reprodujo el mismo fallo en `034272e` con la configuración legacy y el componente `DashboardMonthCard.vue` no tiene diff. Se mantienen las assertions: no se rediseña la UI ni se declara todo el gate visual en verde.
- [CI del código final](https://github.com/alberba/finance-tracker/actions/runs/38227856023): lint, tipos, cobertura, migraciones/build, autenticación y smoke pasan en `c0e7da0`. En esta PR, los jobs de full E2E, visual y sync no corren según el workflow; esas suites se verificaron localmente en los alcances descritos.
- Revisión de estándares y spec: sin hallazgos confirmados pendientes. Se corrigieron la identidad compartida de capturas, documentación/comentarios obsoletos, el selector legacy de una prueba y la retirada no solicitada de la línea del footer. La acción pública de inicializar un espacio conserva su idempotencia; el reset de la prueba de backup se hace sólo como preparación mediante la API existente.

## Mecanismos y comportamiento

La acción de mes pasa por tres archivos: `DashboardSection.vue`, el store del dashboard y el store UI. El store valida el mes y escribe `ui.month` una vez. Año y rango pertenecen al dashboard; la navegación utiliza `useSectionNavigation`, que ya existía. Desaparecen el composable delegador y los cuatro slots de callbacks. La adaptación de URL e historial permanece en el controlador de navegación. Los selectores financieros conservan sus reglas.

La recurrencia encola primero la regla y después sus pendientes, usando la identidad propia del comando de creación pendiente. Desaparecen los dos bucles de sondeo y los límites de 10 intentos y 20 turnos. La coordinación conserva temporalmente cambios todavía no encolados; no introduce otra copia persistida del modelo. El calendario de la regla avanza después de encolar todos sus pendientes: un fallo parcial seguido de reinicio puede regenerar los vencimientos que faltan. Confirmar conserva el orden movimiento → pendiente y el intento de sincronizar el pendiente tras un fallo del movimiento.

El cliente autenticado utiliza un protocolo de persistencia: comandos v2, cola durable, overlay y proyección relacional. Desaparecen el GET/PUT de blob del cliente, reconciliación, marcadores de versión y cambios pendientes, selector de rollout y dos registros de handlers del store financiero. La demo sigue siendo un caso explícito, editable y local, con sufijo `::demo`.

Los escenarios generales utilizan identidades aisladas y v2. Su preparación reutiliza inicialización y restauración de backups; las comprobaciones de persistencia leen el bootstrap relacional. Se conserva la suite dedicada de aislamiento y offline. Cambiar el mecanismo de preparación no acredita por sí solo el resultado de las pruebas: el inventario descubierto y las ejecuciones se documentan por separado.

## Compatibilidad retenida

La configuración del Worker activo utiliza v2. El inventario de despliegues también encontró el sitio Pages y despliegues históricos accesibles; esa configuración no demuestra la ausencia de consumidores externos antiguos. No se encontró el visto bueno requerido para retirar la ventana de rollback de 30 días de `docs/migration/retention-checklist.md`. Se mantienen los endpoints de blob restringidos al propietario para esos bundles y rollback, la base y migraciones v1, la exportación v2→v1 y las herramientas de paridad. El cliente actual no selecciona ese protocolo.

Normalización, `legacyId` y formatos de backup siguen siendo adaptadores de datos soportados. El catálogo global de instrumentos conserva su limitación de sincronización documentada; este trabajo no crea un contrato de mercado o esquema nuevo. El inventario operativo bruto permanece fuera del repositorio.

## Interpretación de las medidas

Las medidas repiten el método del 11 de octubre, incluido cloc 2.06, gzip por archivo, tres ejecuciones seriales de los tests focalizados y siete contextos fríos del benchmark existente. Los alcances fijos y los alcances funcionales ampliados se presentan juntos para que trasladar lógica a un archivo compartido no parezca eliminarla. El código nuevo de pruebas garantiza recuperación y persistencia; su tamaño se distingue del código de aplicación.

El benchmark de navegador utiliza demo, CPU ×4, latencia de 40 ms, 10 Mbps, terceros bloqueados y cache/service workers desactivados. Mide un encabezado visible y una captura temprana después de dos frames; no mide sesión autenticada, D1, el coste de la cola ni el LCP final. Build es una sola muestra. La dispersión de tiempos y la carga de la máquina limitan cualquier conclusión sobre diferencias pequeñas. El tiempo humano de comprensión sigue sin medirse.

La línea de estado existente del footer se conserva para mantener texto y altura en demo y sesión autenticada. No registra callbacks ni selecciona el protocolo de blob. Las capturas de demo originales se conservan: no se regeneran para aceptar una regresión de layout.
