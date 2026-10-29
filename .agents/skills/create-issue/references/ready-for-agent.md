# Preparación para agentes

Una issue está `ready-for-agent` cuando un agente puede empezar sin pedir decisiones de producto o alcance y puede comprobar cuándo ha terminado. No exige causa raíz ni implementación prescrita si el problema y el resultado pedido están definidos.

## Cuerpo autocontenido

El cuerpo es la única especificación: una persona lo entiende leyendo las primeras secciones y un agente lo ejecuta sin reconstruir la conversación. Su extensión la marca lo necesario para implementar y validar; si pide mucho más de 400 palabras, suele ser señal de dividir la issue.

```markdown
## Problema
Efecto para el usuario o necesidad, en pocas líneas.

## Resultado
Qué debe ocurrir tras el cambio, con los casos límite y errores del alcance.
**Sin cambios:** comportamiento vecino que debe seguir igual.

## Decisiones
- Decisión tomada, con su motivo.

## Decisiones pendientes
- Pregunta concreta, con el contexto para contestarla.

## Para implementar
**Objetivo:** dónde se actúa: partner, fuente, pantalla, comando, modelo o concepto exactos.

**Terminado cuando:**
- [ ] Resultado concreto, completo y verificable por separado.

**Evidencia:** hechos con fecha y estado (verificado, reportado o hipótesis).

**Dónde mirar:** conceptos, tipos y símbolos que se pueden buscar.

**Fuera de alcance:** trabajo adyacente excluido.
```

`## Decisiones` y `## Decisiones pendientes` aparecen solo si tienen contenido; `**Evidencia:**` y `**Dónde mirar:**`, cuando aportan algo.

- **bug:** el problema es el efecto con un caso actual/esperado y su estado de verificación; el resultado, el comportamiento corregido; **Sin cambios**, las regresiones que vigilar.
- **feature:** el problema es la necesidad del usuario; el resultado, lo pedido y sus casos límite.
- **task/epic:** el problema que se resuelve y el cambio que lo resuelve.

El **Objetivo** nombra el blanco exacto: ante un blanco ambiguo, un agente elige uno plausible en vez de preguntar. **Terminado cuando** es la condición de cierre: cada criterio se comprueba solo, sin interpretar el resto.

La issue guarda lo que el código no cuenta: decisiones y su motivo, evidencia externa fechada (producción, ERP, reportes), reproducción, dependencias y accesos que condicionan empezar o validar, y enlaces a guías existentes. Lo que el agente obtiene leyendo el código (rutas, números de línea, recuentos, estructura actual) lo calcula al implementar; en la issue se nombra el concepto o el símbolo. Los hallazgos adyacentes no amplían el alcance.

## Revisión de huecos

Antes de recomendar `ready-for-agent`, releer el borrador como el agente que lo implementará sin la conversación:

- ¿El Objetivo admite más de un blanco?
- ¿Cada criterio de **Terminado cuando** se puede comprobar?
- ¿Algún dato del cuerpo es una foto del código que caducará?
- ¿Falta una decisión que cambie el resultado, el alcance o la validación?

Resolver con contexto y código lo que se pueda; lo que dependa del usuario pasa a `## Decisiones pendientes`.

## Cerrar pendientes

Reutilizar decisiones ya tomadas; en issues existentes, leer body, comentarios y notas de triage antes de preguntar. Preguntar solo por lo que cambie el resultado, el alcance o la posibilidad de validar; registrar lo resuelto y formular pendientes concretos, sin inventar respuestas para obtener el label.

En bugs, verificar el caso con evidencia existente o una reproducción de solo lectura dentro del alcance autorizado, y registrar si queda confirmado, no reproducido o sin datos. Un reporte suficiente deja lista la investigación sin acceso a producción; si ese acceso es indispensable para empezar, explicitar el bloqueo.

Mantener separadas las propuestas y las decisiones confirmadas; una propuesta del agente no resuelve por sí sola un pendiente. Las elecciones de implementación que el agente pueda tomar con el código no se convierten en preguntas al usuario.

Si el usuario prefiere registrar la issue antes de resolver las preguntas, conservar lo establecido y los pendientes visibles en el cuerpo, bajo el estado que corresponda.

## Actualizar una issue existente

La especificación vigente vive en un solo sitio. Cuando el usuario cambia o resuelve una decisión, editar ese sitio: la sección afectada del cuerpo (Resultado, Decisiones, **Terminado cuando**, **Fuera de alcance**), retirar la pregunta resuelta y reevaluar el estado. La evidencia nueva de un reporte duplicado va en un comentario.

Si el cuerpo no tiene `## Para implementar` y hay un comentario `## Agent Brief`, la especificación es el último de esos comentarios: editarlo y dejar el cuerpo como está. Si el repo documenta otra estructura o una firma para la especificación separada, seguirla en las issues nuevas.

## Estado

Aplicar `ready-for-agent` solo tras la revisión de huecos, sin decisiones que impidan empezar. Mapear a las convenciones locales y mantener un único estado de triage:

- `ready-for-agent`: especificación suficiente, ejecutable por un agente.
- `needs-info`: falta un dato concreto del reportador.
- `needs-triage`: pendiente de evaluar la petición.
- `ready-for-human`: requiere ejecución humana; explicar el motivo.

Conservar las etiquetas locales de alcance o bloqueo con significado propio. `needs-discussion` es una decisión de alcance pendiente: resolverla antes de recomendar `ready-for-agent`. Declarar las dependencias que impidan empezar como bloqueos. Comentar una duplicada no cambia su estado: reevaluar la issue completa y cambiarlo solo dentro del alcance autorizado.
