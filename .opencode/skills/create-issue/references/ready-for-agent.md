# Preparación para agentes

Una issue está `ready-for-agent` cuando un agente puede empezar sin pedir decisiones de producto o alcance y puede comprobar cuándo ha terminado. No exige causa raíz ni implementación prescrita si el problema y el resultado pedido están definidos.

## Reporte y brief

El **cuerpo** sigue el template del repo, es breve y depende del tipo:

- **bug:** el efecto para el usuario, un caso concreto con la discrepancia actual/esperada y el estado de verificación.
- **feature:** la necesidad del usuario, el resultado pedido y las decisiones abiertas.
- **task/epic:** el objetivo y su alcance.

Distingue impacto reportado de alcance comprobado, conserva los adjuntos y termina con el enlace al brief publicado.

El comentario **Agent Brief** es la especificación autosuficiente y el contrato de implementación; el reporte y la discusión aportan contexto. Su extensión la marca lo necesario para implementar y validar, no un límite de palabras, y retoma del cuerpo los hechos que necesite para entenderse solo.

```markdown
## Agent Brief

**Categoría:** tipo de tarea según el tracker.
**Resumen:** resultado que debe conseguirse.

**Comportamiento actual:**
Qué ocurre, con el caso y la evidencia. Distinguir verificado, reportado e hipótesis.

**Comportamiento deseado:**
Qué debe ocurrir tras el cambio, con los casos límite y errores del alcance acordado.

**Interfaces clave:**
Conceptos, tipos, funciones o configuración implicados y sus contratos.

**Criterios de aceptación:**

- [ ] Resultados concretos, completos y verificables por separado.

**Fuera de alcance:**
Trabajo adyacente excluido.
```

Describir comportamiento y contratos, y dejar la implementación al agente. Nombrar interfaces y tipos que orienten aunque el código cambie, en vez de rutas, números de línea o estructura interna.

Conservar las decisiones de la conversación, la reproducción y la evidencia necesarias para ejecutar sin reconstruir la discusión. Añadir dependencias y accesos que condicionen empezar o validar, y enlazar las guías operativas existentes. Los hallazgos adyacentes no amplían el alcance.

Si el repo exige otra estructura de brief o una firma, seguirla. Al actualizarlo, editar el comentario vigente y mantener el enlace del cuerpo.

## Cerrar pendientes

Reutilizar decisiones ya tomadas; en issues existentes, leer body, comentarios y notas de triage antes de preguntar. Preguntar solo por lo que cambie el resultado, el alcance o la posibilidad de validar; registrar lo resuelto y formular pendientes concretos, sin inventar respuestas para obtener el label.

En bugs, verificar el caso con evidencia existente o una reproducción de solo lectura dentro del alcance autorizado, y registrar si queda confirmado, no reproducido o sin datos. Un reporte suficiente deja lista la investigación sin acceso a producción; si ese acceso es indispensable para empezar, explicitar el bloqueo.

Si queda una decisión de producto o alcance que impida empezar, escribirla en `## Decisiones pendientes` del cuerpo como pregunta concreta, con el contexto necesario para contestar. El brief puede explicar sus consecuencias técnicas, pero no es el único lugar donde aparecen las preguntas. Mantener separadas las propuestas y las decisiones confirmadas; una propuesta del agente no resuelve por sí sola un pendiente.

Revisar los comentarios de la propia issue antes de actualizar ese bloque. Cuando el usuario resuelva una decisión, incorporarla al reporte y al brief, retirar la pregunta resuelta y reevaluar el estado. Las elecciones de implementación que el agente pueda tomar con el código no se convierten en decisiones de producto ni en preguntas al usuario.

Si el usuario prefiere registrar la issue antes de resolver las preguntas, conservar lo establecido y los pendientes visibles en el cuerpo, bajo el estado que corresponda.

## Estado

Tener un Agent Brief no implica estar lista. Aplicar `ready-for-agent` solo tras verificar el brief y comprobar que no quedan decisiones que impidan empezar. Mapear a las convenciones locales y mantener un único estado de triage:

- `ready-for-agent`: especificación suficiente, ejecutable por un agente.
- `needs-info`: falta un dato concreto del reportador.
- `needs-triage`: pendiente de evaluar la petición.
- `ready-for-human`: requiere ejecución humana; explicar el motivo.

Conservar las etiquetas locales de alcance o bloqueo con significado propio. `needs-discussion` es una decisión de alcance pendiente: resolverla antes de recomendar `ready-for-agent`. Declarar las dependencias que impidan empezar como bloqueos. Comentar una duplicada no cambia su estado: reevaluar la issue completa y cambiarlo solo dentro del alcance autorizado.
