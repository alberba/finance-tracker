# Línea base de simplificación — 11 de octubre de 2026

Referencia: issue [#300](https://github.com/alberba/finance-tracker/issues/300).
Commit: `2ba9065e0d66214f676d96bd9f4c8cfb27bd044c`.
Medición sobre el árbol de trabajo, zona Europe/Madrid. El código de aplicación y las configuraciones Playwright coinciden con HEAD. Había eliminaciones locales de skills antes de medir; el JSON conserva la lista. No atribuir esas eliminaciones a los futuros cambios de arquitectura.

Los datos detallados, inventarios de casos, pruebas ejecutadas y hashes SHA-256 están en [simplification-baseline-2026-10-11.json](simplification-baseline-2026-10-11.json). Estos dos documentos son la línea base; no añaden infraestructura ni un gate.

## Qué medimos y por qué

Medimos responsabilidades dispersas, intermediarios y mecanismos de coordinación identificados en la auditoría. Los conteos no son objetivos independientes: mejorar exige conservar comportamiento, invariantes y separaciones útiles. No usamos líneas de código, número total de archivos ni porcentaje de coverage como puntuación de arquitectura.

| Indicador | Antes | Comparación posterior |
| --- | ---: | --- |
| Archivos en la acción de cambiar mes del dashboard | 5 | Repetir el recorrido y explicar qué responsabilidades se concentran |
| Callbacks externos del controlador del dashboard | 4 | Eliminar las delegaciones identificadas, reutilizando navegación existente |
| Escrituras a `ui.month` por cambio de mes | 2 | Una escritura con la normalización actual conservada |
| Registros de handlers externos de persistencia en el store financiero | 2 | Retirar los que queden sin consumidores; no crear un bus sustituto |
| Bucles de sondeo para resolver la regla padre | 2 | Cero; padre encolado durablemente antes que hijos |
| Límite de intentos de resolución | 10 | Eliminar el límite temporal, mantener recuperación ante fallos |
| Límite de turnos de espera por intento | 20 | Eliminar esperas de macrotarea como mecanismo de coordinación |
| Consultas a `isSyncV2Enabled()` | 24 en 9 archivos | Retirar consultas de rollout prescindibles; revisar compatibilidad retenida |
| Protocolos autenticados de persistencia implementados | 2 | Retirar legacy solo donde no haya consumidores soportados |
| Suite general Playwright, configurada con legacy | 374 casos en 23 archivos | Los recorridos existentes usan v2 conservando sus assertions útiles |
| Suite dedicada Playwright sync v2 | 9 casos en 5 archivos | Comprobar migración de recorridos, sin exigir más casos ni duplicarlos |
| Pruebas focalizadas ejecutadas | 69/69 pasan, 6 archivos | Repetir los comportamientos y añadir las regresiones necesarias |

## Definiciones que deben permanecer estables

- **Recorrido de mes:** acción desde `DashboardSection` → `useDashboardViewModel` → store del dashboard → store UI → callback en el controlador anterior. Cuenta cinco archivos únicos, incluida la segunda escritura al mismo `ui.month`. Excluye controles hijos y evaluación del selector del modelo de vista. No es un conteo de todas las dependencias transitivas.
- **Callbacks dashboard:** cuatro slots registrados (`changeYear`, `changeMonth`, `changeRange`, `navigate`), no el número de coincidencias textuales del identificador.
- **Persistencia del store:** slots `stateCommitHandler` y `stateReloadHandler`, no funciones de acceso ni tipos asociados.
- **Sondeo:** bucles en resolución de la regla y espera del envío en curso. `10 × 20 = 200` es el máximo estático de esperas por macrotarea; no es latencia observada, milisegundos ni número de peticiones de red.
- **Consultas al flag:** llamadas sin argumentos en archivos `.ts`, `.vue` y `.astro` de `src`, excluyendo comentarios y declaración de la función. Conteo textual, no análisis AST. Los paths por archivo se conservan en el JSON.
- **Protocolos:** blob completo con GET/PUT y versión base, frente a comandos y proyección relacional v2. Ambos están implementados; no significa que ambos estén activados en producción. La demo no cuenta como protocolo autenticado.
- **Casos Playwright:** instancias descubiertas por `--list`, por proyecto; un escenario ejecutado en dos proyectos cuenta dos veces. Los archivos se cuentan sin duplicados. No se ejecutó el navegador ni se midió cobertura o calidad. Las configuraciones dedicadas de auth y Bitvavo están fuera de esta comparación de dos suites. Bitvavo sí aparece entre los escenarios seleccionados por la configuración v2.
- **Pruebas focalizadas:** se conserva cada nombre de test y resultado en el JSON. No exigir mantener 69 tests si una consolidación conserva las garantías; justificar eliminaciones. Estos tests no demuestran por sí solos todo el comportamiento de navegador, toda la creación offline de reglas ni todos los fallos concurrentes.

## Cómo repetir las mediciones

Capturar commit y diferencias antes de ejecutar. Registrar el nuevo resultado como un documento posterior, sin sobrescribir esta línea base.

```sh
git rev-parse HEAD
git status --short
pnpm exec playwright test --list --reporter=json > /tmp/finance-after-general-e2e.json
pnpm exec playwright test --config playwright.sync-v2.config.ts --list --reporter=json > /tmp/finance-after-v2-e2e.json
pnpm exec vitest run tests/unit/dashboard-view-model.test.ts tests/unit/recurring-confirm-category-sync.test.ts tests/unit/snapshot-edit.test.ts tests/unit/wealth-view-model.test.ts tests/integration/d1-v2/round-trip/wealth.test.ts tests/integration/d1-v2/round-trip/movement-commands.test.ts --reporter=json --outputFile=/tmp/finance-after-vitest.json
```

Si desaparece una configuración o se reemplaza un test, registrar su sustituto y la correspondencia de comportamientos; no recrear código legacy para poder ejecutar el comando viejo.

Para sumar casos de un reporte Playwright, recorrer recursivamente `suites`, contar cada elemento de `specs[].tests[]` y contar los valores únicos de `specs[].file`. Verificar que `errors` esté vacío. Comparar títulos y proyectos con el inventario guardado, además de totales.

Para repetir el conteo del flag desde la raíz del repositorio:

```python
from pathlib import Path
import re
sites = []
for p in sorted(Path('src').rglob('*')):
    if p.suffix not in ('.ts', '.vue', '.astro'):
        continue
    source = re.sub(r'/\*[\s\S]*?\*/|//[^\n]*', '', p.read_text())
    count = len(re.findall(r'\bisSyncV2Enabled\s*\(\s*\)', source))
    if p.name == 'feature-flags.ts':
        count -= 1
    if count > 0:
        sites.append((str(p), count))
print(sites)
print('calls', sum(count for _, count in sites), 'files', len(sites))
```

Los recorridos, callbacks, slots, protocolos y bucles requieren volver a leer su comportamiento. Si se renombran o se trasladan, siguen contando: desaparecer de una búsqueda no basta para afirmar que se eliminó complejidad.

## Comprobaciones del después

1. Dashboard: año, mes y rango, cifras actualizadas, navegación desde tarjetas, URL, atrás/adelante, selección accesible móvil y demo. Verificar una propiedad clara de las acciones sin registro externo previo.
2. Recurrencia: regla y primeros pendientes offline, reinicio antes del envío, reconexión, identidad y categoría compartidas, confirmación antes del primer envío, operación de inversión y recuperación ante fallos/concurrencia. Verificar orden durable de comandos, no tiempos de espera.
3. Persistencia: recorridos generales bajo v2 y recarga, aislamiento por identidad, cola pendiente y restauración de backups. Inventariar consumidores legacy antes de retirar compatibilidad. Revisar diffs visuales.
4. Mantener las garantías de cola, overlay, proyección, escritura conjunta de movimiento y operación, texto de edición de snapshots y atomicidad de D1/SQLite. Una mejora de conteos que rompe alguna no es una mejora.

## Lo que esta línea base no mide

No hemos medido tiempo humano para entender o modificar el proyecto, latencia de red ni duración representativa de CI. No se infiere que 5 archivos impliquen una cantidad concreta de esfuerzo, ni se calcula un índice compuesto de complejidad.

Para medir esfuerzo directamente, un futuro ensayo debe pedir a una persona que no conozca la solución explicar: (a) dónde y cuántas veces cambia el mes; (b) cómo se garantiza la identidad de la regla al crear offline; (c) qué persiste una edición y cómo vuelve tras recargar. Registrar minutos hasta una explicación correcta, archivos consultados y errores. Usar participantes comparables que no hayan leído antes la solución y conservar las mismas preguntas. Sin ese ensayo, el tiempo de comprensión queda como **no medido**, no como cero.

La skill clean-code ya estaba eliminada al capturar esta línea base. No hay un experimento antes/después que demuestre el efecto de eliminarla sobre las decisiones de un agente.

## Ampliación: tamaño y rendimiento

Mediciones realizadas el mismo día y commit, después de una compilación nueva de producción con adaptador Cloudflare, sync v2 activado por la configuración de producción y subida de source maps a Sentry desactivada. Node `v24.16.0`, pnpm `10.26.0`, macOS `26.6.2`, ARM64. Dependencias instaladas previamente; no hubo build ni tests concurrentes durante el benchmark de navegador.

| Indicador | Antes | Alcance |
| --- | ---: | --- |
| Código fuente TS/JS/Vue/Astro/CSS | 1.471.043 bytes en 323 archivos | Contexto de tamaño; no objetivo de reducción |
| JavaScript cliente emitido | 1.170.216 bytes en 54 archivos | Incluye chunks diferidos y service worker; excluye source maps |
| JavaScript cliente gzip | 395.735 bytes | Suma comprimida por archivo, nivel 9 |
| CSS cliente emitido / gzip | 73.027 / 13.497 bytes | Un archivo |
| JavaScript servidor emitido | 4.642.301 bytes en 70 archivos | Incluye dependencias empaquetadas; no secretos, config ni mapas |
| Build producción | 7,060 s | Una ejecución; sin subida de source maps |
| 69 pruebas focalizadas | 4,279 s | Mediana de 3 ejecuciones seriales, todas pasan |
| Dashboard visible | 790,30 ms | Mediana de 7 contextos fríos, encabezado visible |
| DOMContentLoaded | 486,60 ms | Mismo perfil |
| FCP | 192 ms | Mismo perfil |
| LCP muestreado | 456 ms | Captura temprana; no LCP final de página asentada |
| JS transferido al muestrear | 287,45 KiB | Incluye overhead de transferencia; no todo el bundle |
| JS descomprimido al muestrear | 802,53 KiB | Recursos cargados hasta el muestreo |
| Peticiones JS al muestrear | 33 | Puede incluir precarga iniciada antes del muestreo |
| Tiempo de scripting | 227,23 ms | Chrome Performance metrics |
| Tiempo total de tareas | 689,13 ms | Chrome Performance metrics |
| Long tasks | 2; 351 ms acumulados | Tareas mayores de 50 ms |

Los nombres `jsTransferKb` y `jsDecodedKb` del script dividen entre 1024: aquí se expresan correctamente como KiB. El JSON conserva los nombres originales y los siete resultados individuales.

El perfil usa el benchmark existente: Chromium, demo, CPU ×4, latencia 40 ms, 10 Mbps, cache del navegador y service workers desactivados, terceros bloqueados. Servidor local Cloudflare recién iniciado. `appReadyMs` mide el primer encabezado visible; no demuestra que todas las interacciones o datos estén listos. Se muestrea tras dos frames, de modo que LCP y precargas son una foto temprana. No mide sesión autenticada, coste de encolado IndexedDB, envío de comandos ni latencia de D1. No comparar directamente estas cifras con producción real, con Astro dev ni con el informe de agosto sin igualar versiones, método y condiciones.

Para repetir el perfil, compilar y arrancar el worker generado, usando un puerto libre. Detener el servidor al finalizar:

```sh
SENTRY_AUTH_TOKEN='' DEPLOY_TARGET=cloudflare pnpm build
pnpm exec wrangler dev --config dist/server/wrangler.json --local --ip 127.0.0.1 --port 4387
BENCHMARK_BASE_URL=http://127.0.0.1:4387 BENCHMARK_ITERATIONS=7 pnpm benchmark:performance
```

El tiempo de build de 7,060 s es una sola muestra y debe considerarse orientativo. El tiempo de tests incluye arranque de pnpm y Vitest: las muestras fueron 4,513 / 4,279 / 4,261 s. Repetir tres veces de forma serial para comparar la mediana. No convertir mejoras pequeñas en conclusiones sin mirar dispersión y carga de la máquina.

Para repetir tamaños lógicos y gzip, después de compilar:

```python
from pathlib import Path
import gzip
for root, suffixes in [('src', {'.ts', '.js', '.vue', '.astro', '.css'}),
                       ('dist/client', {'.js'}), ('dist/client', {'.css'}),
                       ('dist/server', {'.js', '.mjs', '.cjs'})]:
    files = sorted(p for p in Path(root).rglob('*')
                   if p.is_file() and p.suffix in suffixes)
    raw = sum(p.stat().st_size for p in files)
    compressed = sum(len(gzip.compress(p.read_bytes(), mtime=0)) for p in files)
    print(root, sorted(suffixes), len(files), raw, compressed)
```

El JSON también conserva tamaños por chunk, hashes y tamaños de los grupos de código señalados por la auditoría. Esos grupos contienen responsabilidades útiles: su tamaño no equivale a bytes eliminables. La prioridad sigue siendo reducir intermediarios y protocolos innecesarios conservando comportamiento; tamaño y rendimiento permiten detectar mejoras secundarias y regresiones, no justificar una reescritura.

## Ampliación: LOC

Medido con **cloc 2.06** sobre archivos existentes y versionados en el mismo commit. LOC significa líneas físicas clasificadas como código, excluyendo líneas vacías y comentarios; no número de instrucciones ni complejidad. Se guardan los resultados por archivo en el JSON.

| Grupo | Archivos | Código (LOC) | Comentarios | Vacías |
| --- | ---: | ---: | ---: | ---: |
| Aplicación (`src`) | 323 | 36.782 | 2.794 | 3.225 |
| Tests | 202 | 27.536 | 969 | 3.794 |
| Herramientas (`scripts`) | 30 | 4.744 | 419 | 458 |
| Migraciones SQL | 16 | 725 | 64 | 5 |
| Configuración raíz y workflows | 20 | 803 | 99 | 55 |
| **Total de código medido** | **591** | **70.590** | **4.345** | **7.537** |

El lockfile tiene 7.441 líneas no vacías adicionales, pero se clasifica por separado como datos de dependencias y no se suma al código. Se excluyen documentación, skills, JSON de semillas, dependencias instaladas y build generado.

Los grupos de los hallazgos se solapan con la aplicación; no deben sumarse al total:

| Alcance fijo de la auditoría | Código (LOC) | Comentarios | Vacías |
| --- | ---: | ---: | ---: |
| Composable, store y controlador del dashboard | 168 | 0 | 28 |
| Store de recurrencia | 514 | 70 | 29 |
| Puente de persistencia: app, helpers, normalización, store financiero y flag | 1.165 | 63 | 120 |

Estos alcances contienen comportamiento que debe conservarse: no son estimaciones de líneas eliminables. Sus listas exactas están en `loc.groups.scope_*` del JSON. Si un refactor traslada código fuera del alcance fijo, registrar los destinos y una segunda medida del alcance funcional; no contabilizar el traslado como eliminación.

### Repetición de LOC

No se instaló una dependencia en el proyecto. Se usó el script Perl de cloc, versión fijada, en el directorio temporal:

```sh
curl --fail --silent --show-error --location https://raw.githubusercontent.com/AlDanial/cloc/v2.06/cloc --output /tmp/finance-baseline-cloc.pl
perl /tmp/finance-baseline-cloc.pl --version
```

Para cada grupo, crear una lista de archivos con `git ls-files`, filtrada por existencia, prefijo y extensiones `.ts`, `.js`, `.mjs`, `.cjs`, `.vue`, `.astro`, `.css`, `.sql`, `.sh`, `.py`, `.yml`, `.yaml`. Configuración comprende archivos en raíz y workflows; excluir `pnpm-lock.yaml` de ese grupo. Las migraciones incluyen ambos directorios. Ejecutar:

```sh
perl /tmp/finance-baseline-cloc.pl --list-file=/tmp/loc-files.txt --force-lang=HTML,astro --json --by-file --out=/tmp/loc-result.json --quiet
```

Astro se clasifica como HTML; comentarios dentro de plantillas mixtas son una aproximación del contador. Mantener la misma herramienta y opciones en el después. La clasificación separada de código/comentarios puede variar por estilo sin que cambie comportamiento: revisar también líneas físicas totales y diffs. Los archivos seleccionados y contados coincidieron en todos los grupos, sin descartes por duplicados en esta medición.
