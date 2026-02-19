# Instrucciones del proyecto

## Reglas de desarrollo frontend
- Después de añadir o modificar una funcionalidad en el frontend, crear y/o actualizar tests E2E que cubran los nuevos casos de uso.
- No cerrar una tarea de frontend sin cobertura E2E asociada a los cambios funcionales.

## Límite de tamaño en TypeScript
- Evitar que cualquier archivo `.ts` supere las 1000 líneas.
- Si un archivo `.ts` supera las 1000 líneas y no es estrictamente necesario, dividirlo en módulos más pequeños con responsabilidades claras.
- Si excepcionalmente se necesita superar ese límite, documentar brevemente el motivo en el PR o en la explicación de cambios.
