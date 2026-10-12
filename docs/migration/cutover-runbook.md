# Cutover v1 → v2 — procedimiento histórico retirado

La aplicación actual utiliza D1 relacional y Better Auth. El protocolo de blob,
el puente Access y las herramientas de cutover v1 se retiran por petición del
propietario el 12 de octubre de 2026. El procedimiento anterior permanece en el
historial de Git; no se debe ejecutar contra el despliegue actual.

La evidencia del archivo y el cierre operativo está en
[retirada de v1](retention-checklist.md). La configuración actual se describe en
[autenticación](../operations/authentication.md) y [sync v2](../architecture/sync-v2.md).
La reparación de datos v2 conserva su [runbook específico](remediacion-v2-runbook.md).
