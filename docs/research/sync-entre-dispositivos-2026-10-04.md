# Comprobación de sincronización entre dispositivos — 2026-10-04

Revisión de `0496696c6f66a4367bdd3213031014b1d2261cb3`, solicitada después de que
un móvil autenticado mostrara los datos semilla y `/api/bootstrap` devolviera un 1102.

La escritura y la lectura entre dispositivos funcionan al recargar cuando las API responden.
La recuperación de errores de lectura y la actualización de pestañas abiertas tienen fallos
reproducibles. No se han aplicado correcciones de funcionamiento en esta revisión.

Las pruebas de navegador usan dos contextos independientes, con almacenamiento separado y la
misma identidad de prueba. Uno emula Pixel 5. Las peticiones de escritura y lectura normales
llegan a las API reales y a D1 local; solamente se intercepta `/api/bootstrap` para los escenarios
de error. La autenticación de los tests usa el header permitido exclusivamente en loopback.

**Resultados**

| Recorrido                                                                             | Resultado                                                                             |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Crear cuenta en ordenador y leerla en móvil nuevo                                     | Pasa                                                                                  |
| Crear movimiento en ordenador, editarlo en móvil y leer el importe nuevo en ordenador | Pasa al recargar; comprobado también contra `/api/bootstrap`                          |
| Crear cuenta en móvil y verla en ordenador                                            | Pasa al recargar                                                                      |
| Dos ediciones sin conexión sobre un movimiento                                        | Pasa; ambos dispositivos convergen a 22 al recargar, sin duplicados                   |
| Escritura sin conexión y envío al reconectar                                          | Pasa                                                                                  |
| Aislamiento entre usuarios y retorno con la misma identidad                           | Pasa                                                                                  |
| Un cobro vencido persiste y no se duplica al recargar                                 | Pasa                                                                                  |
| Móvil nuevo cuya descarga completa falla                                              | Falla: muestra 10 cuentas semilla                                                     |
| Cambios incrementales correctos con descarga completa fallida                         | Falla: el cambio está en IndexedDB y avanza el cursor, pero no aparece en la interfaz |
| Volver al foco en una pestaña abierta tras escribir desde otro dispositivo            | Falla: no solicita los cambios nuevos                                                 |

**Hallazgos**

1. **P1 — Un error de primera carga deja visible el seed como si fuera el estado del usuario.**
   `src/stores/financial-state.ts:13` inicializa con `BASE_SEED` y `src/scripts/app.ts:35` lo
   vuelve a colocar. Cuando falla `/api/bootstrap` y no hay una caché previa,
   `src/stores/sync.ts:205` termina sin sustituir ese estado. El navegador de prueba muestra
   exactamente 10 cuentas semilla en Configuración; una prueba unitaria confirma el mismo
   resultado. Esto reproduce el síntoma del móvil. El mensaje «Reintentando…» tampoco agenda
   un reintento de lectura en esta rama: el temporizador existente llama solamente a `flush()`.

2. **P1 — La proyección ignora cambios ya recibidos si falla el bootstrap.**
   `src/stores/sync.ts:576` guarda los cambios en las colecciones de IndexedDB y avanza el
   cursor. Después, `bootstrapState()` recupera el snapshot guardado en `:204` y lo proyecta
   en `:258`, sin incorporar esas colecciones actualizadas. La prueba unitaria confirma una
   referencia válida de la cuenta remota y cursor 1, mientras la lista visible sigue vacía.
   La prueba de navegador confirma la ausencia de la cuenta, aunque el indicador diga
   «Sincronizado». Una nueva lectura completa correcta puede recuperar el estado visible.

3. **P2 — Una pestaña que permanece abierta no busca cambios al recuperar el foco.**
   `src/stores/sync.ts:180` solo registra `online` y `offline`; no registra `focus` ni
   `visibilitychange`, ni programa lecturas periódicas. La prueba guarda una cuenta en el
   segundo dispositivo, confirma su existencia en el servidor y devuelve el foco al primero:
   el primero sigue mostrando el estado anterior. La recarga sí obtiene la cuenta.

**Verificación ejecutada**

- Integración ampliada: 109 tests pasan y 2 están omitidos, en 20 archivos de round-trip,
  repositorios de sincronización y API.
- Navegador sobre Astro dev: siete recorridos normales pasan, incluyendo las nuevas
  comprobaciones bidireccionales y convergencia de ambos dispositivos.
- `pnpm build`: pasa. El build se ejecutó con `PUBLIC_SYNC_V2=true`.
- Build de producción servido por Wrangler local: pasan el recorrido bidireccional y el
  conflicto; fallan los mismos tres escenarios de recuperación/frescura.
- Reproducción mínima: dos tests unitarios fallan en aproximadamente medio segundo.

El checkout de diagnóstico y sus pruebas se conservan en
`/tmp/finance-sync-review.Tx1XFJ`. La base local del repositorio principal no permitía arrancar
E2E por una migración que intentaba añadir otra vez `version`; se usó una base nueva en ese
checkout. Los fallos de diagnóstico no se han añadido a las suites del repositorio principal.

Para reproducir los fallos rápidos, desde ese checkout:

```bash
pnpm test:unit tests/unit/sync-store-read-model-review.test.ts
```

Para reproducir los cuatro casos de navegador ampliados sobre Astro dev:

```bash
pnpm test:e2e:sync-v2 tests/e2e/offline-sync.spec.ts --grep 'revisión' --max-failures=0
```

La comprobación adicional del build usó Wrangler local en el puerto 4662 y:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4662 pnpm test:e2e:sync-v2 tests/e2e/offline-sync.spec.ts --grep 'revisión|una edición concurrente' --max-failures=0
```

**Alcance de la conclusión:** estas pruebas verifican el código actual, las API y el build en
local. No constituyen una prueba de escritura entre los dispositivos físicos del usuario en
producción. El 1102 real no se reprodujo durante esta revisión; se reprodujo su consecuencia
para el cliente mediante una respuesta fallida. Queda pendiente identificar qué recurso supera
el Worker y corregir los fallos anteriores antes de considerar fiable la recuperación.
