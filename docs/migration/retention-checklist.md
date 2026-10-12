# Retirada de v1 — 12 de octubre de 2026

El propietario pidió cerrar toda la transición y autorizó expresamente el despliegue
y el borrado de la base v1 después de guardar y verificar una copia. Esta decisión
sustituye la espera anterior de 30 días; no se presentan los checks semanales como
realizados. El runbook anterior se conserva en el historial de Git.

## Archivo verificado

Los exports completos de `finance-tracker-db` y `finance-tracker-db-v2` se guardaron
fuera del repositorio, con permisos 0600, en
`/Users/albertsalom/.finance-tracker-backups/2026-10-12-v1-retirement/`.
Cada SQL se restauró en SQLite: `PRAGMA integrity_check` dio `ok` y
`PRAGMA foreign_key_check` no devolvió errores. Los payloads del archivo v1 son JSON
válido. `verification.json` conserva tamaños, SHA-256 y recuentos por tabla.

- v1: 139.589 bytes; SHA-256 `0386c8a0829bab5f6c47b7adcf311bb0969c9ba57dc8a1fe4c324b77b8fbcbf9`.
- v2: 68.672.685 bytes; SHA-256 `673b1b14c53cf28407e27eb53bd4ef615f02841e8ede7977edb92a2bac4629c8`.

El preflight de v2 confirmó cero usuarios financieros sin `auth_user` o
`auth_admission`, un rol administrador y cero errores de claves foráneas.

## Secuencia de cierre

1. Retirar el protocolo blob, sus rutas, binding y migraciones v1, y sus
   herramientas de migración/exportación/paridad. Los runners usan únicamente D1 v2.
2. Retirar el puente de autenticación Access y las concesiones de propietario por
   variable de entorno. Conservar las identidades financieras y roles persistidos.
3. Validar, construir y desplegar el Worker sin el binding v1.
4. Comprobar demo, login, protección de APIs y ausencia de regresiones en v2.
5. Exportar y verificar una copia final de v1 después de retirar su binding;
   borrar únicamente `finance-tracker-db` y confirmar que v2 sigue disponible.

Los pasos remotos se registrarán aquí con sus resultados al completarse. No se
elimina la base v2 ni se restauran exports antiguos sobre datos nuevos.

## Datos actuales con nombres históricos

`legacyId` sigue siendo una identidad de correlación usada por comandos, proyección
e importación de datos v2, también para entidades nuevas. Suprimirla no forma parte
de retirar un protocolo: rompería referencias actuales. Las migraciones v2 ya aplicadas
se conservan como historia inmutable. El formato `State` y su normalización se usan
por la demo y los recorridos de reparación; la copia de Datos usa el formato relacional
v2. El logout conserva el borrado de claves antiguas del navegador para no dejar
información privada de sesiones previas.
