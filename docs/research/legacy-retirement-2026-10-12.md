# Cierre de legacy — 12 de octubre de 2026

El propietario amplió #300 después de la primera entrega: pidió cerrar toda la
transición y autorizó expresamente el despliegue y borrado de v1 con copia verificada.
Código inventariado: `1f6843b925140d014b9e9ded7b1a11357c876a98`.
Las capturas de bundle y tiempos corresponden a `9e5c94f`; los commits siguientes
solo ajustan runners y esperas E2E, sin cambiar la aplicación ni los seis archivos
de tests focalizados. Esta captura sustituye las
cifras finales de la [entrega previa](simplification-after-2026-10-12.md), que conserva
su valor como medición intermedia. [Muestras y deltas por fichero](legacy-retirement-2026-10-12.json).

## Código retirado

- Rutas de blob `GET/PUT /api/state` y `POST /api/state/reset-legacy`, su persistencia,
  namespace, guard de propietario, binding `finance_tracker_db` y migraciones v1.
- Migrador v1→v2, exportador v2→v1, paridad, lectura/dump v1 y sus tests exclusivos.
  La apertura SQLite necesaria para reparar v2 permanece en `scripts/lib/local-v2-db.ts`.
  El reparador exige un usuario explícito; no presupone un propietario por email de entorno.
- Puente Cf-Access, JWT/JWKS, vinculación automática del propietario, variables de rollout
  y concesión automática del rol administrador por correo. Los roles existentes se conservan.
- Logout con destino Access: ahora revoca Better Auth, mantiene el orden de sincronización
  y borrado local, y vuelve a `/login`.
- Runners y CI dejan de preparar una D1 v1. No se cambia ninguna migración v2 aplicada.

El formato de datos `State`, `legacyId`, la demo, normalización y reparación de datos
siguen siendo consumidores actuales, no protocolos v1 alternativos. Las identidades y
la columna física histórica `is_legacy_owner` se conservan como datos; el runtime y sus
interfaces ya no leen ni escriben ese flag. Logout sigue limpiando claves privadas
antiguas del navegador. Las rutas `/api/state/initialize` y `/api/state/reset` son v2.

## LOC con el método de la línea base

cloc 2.06, Astro como HTML, mismas cohortes y exclusiones. No se incluyen docs, datos
semilla, dependencias ni lockfile. Los archivos conservados y retirados se registran
con sus recuentos anteriores y posteriores en el JSON.

| Cohorte       | Línea base | Antes de retirar v1 |  Final | Diferencia con línea base |
| ------------- | ---------: | ------------------: | -----: | ------------------------: |
| Aplicación    |     36.782 |              36.668 | 36.255 |                      −527 |
| Tests         |     27.536 |              27.928 | 27.070 |                      −466 |
| Herramientas  |      4.744 |               4.744 |  2.789 |                    −1.955 |
| Migraciones   |        725 |                 725 |    713 |                       −12 |
| Configuración |        803 |                 800 |    859 |                       +56 |
| Total         |     70.590 |              70.865 | 67.686 |                    −2.904 |

Esta ampliación retira 3.179 LOC respecto de la entrega intermedia. La reducción
acumulada de aplicación es 527 LOC (1,4 %), y del total medido 2.904 (4,1 %).
Desaparecen los tests que solo validaban contratos retirados; se conserva y adapta
la cobertura de sesiones, aislamiento, roles, datos y logout vigentes.

## Tamaños y tiempos

Mismo Node/pnpm, adaptador Cloudflare y método por archivo de la línea base. Las
capturas de build/tests/navegador fueron seriales; los E2E comenzaron después.

| Medida                               | Línea base |     Final |
| ------------------------------------ | ---------: | --------: |
| JS cliente, bytes                    |  1.170.216 | 1.167.037 |
| JS cliente, gzip                     |    395.735 |   394.484 |
| CSS cliente, bytes                   |     73.027 |    72.779 |
| CSS cliente, gzip                    |     13.497 |    13.485 |
| JS servidor, bytes                   |  4.642.301 | 4.598.181 |
| Build, una muestra                   |    7,060 s |   6,364 s |
| Mismos 69 tests, mediana de tres     |    4,279 s |   4,351 s |
| Encabezado visible, mediana de siete |   790,3 ms |    766 ms |
| FCP                                  |     192 ms |    192 ms |
| LCP temprano                         |     456 ms |    436 ms |
| Long tasks                           |          2 |         3 |
| Duración de long tasks               |     351 ms |    375 ms |

El benchmark conserva siete contextos nuevos, CPU ×4, 40 ms, 10 Mbps, cache y
service workers desactivados y terceros bloqueados. Mide demo después de dos
frames, no sesión autenticada, D1, outbox ni hidratación completa. La variación
incluye métricas peores; no demuestra una mejora de velocidad atribuible al cambio.
Build tiene una muestra. Los tres runs de tests pasan los mismos 69 casos.

## Validación y operación

- Gate local de la ampliación: 155 archivos, 1.216 tests; tipos y lint pasan.
- Revisión de estándares y spec: la única referencia residual al binding v1 en los
  tipos locales quedó corregida. Sin hallazgos confirmados pendientes.
- E2E generales: 162 activos comprobados entre ejecuciones y una cuarentena previa.
  La ejecución completa pasó 128 y se detuvo por una recarga abortada en el caso de
  ticker de Stock Events; ese caso pasó tres repeticiones aisladas y el grupo restante
  pasó sus 40 casos (incluye seis de ajustes ya comprobados). No se declara una única
  ejecución completa en verde ni una causa demostrada para el aborto.
- Autenticación Worker/D1: 24/24 en escritorio y móvil; sync v2: 9/9, incluyendo
  offline, concurrencia, aislamiento, Bitvavo y ausencia de cobros duplicados.
- Capturas Linux: 108/108 sin regenerar PNG ni cambiar umbrales. Los cuatro fallos
  previos de layout del dashboard siguen documentados en la entrega intermedia.
- [CI del último código](https://github.com/alberba/finance-tracker/actions/runs/38238915545):
  lint, tipos, cobertura, migraciones/build, smoke y autenticación pasan en `1f6843b`.
- El smoke detectó que logout ya requiere Better Auth en el entorno general: se
  genera una configuración local por ejecución con origen correcto y secretos
  efímeros privados. El nonce se propaga a los workers para no reescribir la
  configuración y reiniciar Vite al importar el módulo. Solo se copian las dos claves
  de mercado necesarias; las esperas de demo usan la señal explícita de carga.
- [Archivo verificado y secuencia remota](../migration/retention-checklist.md).
  El resultado operativo queda registrado en la [PR #309](https://github.com/alberba/finance-tracker/pull/309)
  y en el manifiesto privado del archivo.
