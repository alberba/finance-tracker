---
name: create-issue
description: Crear issues de GitHub (una o en lote) y añadir contexto a las existentes desde un repositorio local.
---

# Crear issues de GitHub

## 1. Destino y alcance

Tomar la descripción del mensaje y del contexto previo; si no hay, pedirla.

Resolver `ORG/REPO` con el destino del usuario, la configuración del tracker y los remotos Git. Si discrepan, verificar el repositorio vigente en GitHub y preguntar solo si la ambigüedad persiste. Usar `--repo ORG/REPO` en toda operación.

Una issue por problema de alcance independiente; los bullets de pasos o criterios de un mismo problema van juntos. Los comentarios en issues existentes cuentan como acción.

## 2. Preparar

Leer las convenciones del tracker y los templates. Elegir el tipo por la intención global (`bug`, `feature`, `task`, `epic`; `task` si ninguna domina) y mapearlo al template y al tipo nativo de la organización (`--type` en `gh issue create` y `gh issue edit`), o al label local si no los define.

Explorar el código en solo lectura hasta localizar el componente y las referencias del reporte; si no se localizan, preparar con lo disponible y decirlo. Separar hechos reportados, verificados, hipótesis y propuestas.

Redactar una issue autocontenida según [Preparación para agentes](references/ready-for-agent.md): el cuerpo es la especificación completa, con la parte para personas arriba y la de implementación debajo. Con template, sus secciones van primero con el encabezado exacto (en un issue form, `### <etiqueta>` de cada campo) y reciben la parte equivalente; lo que el template no recoja va después, en `## Para implementar`. Los datos desconocidos quedan pendientes.

El título empieza por el verbo de lo que se hace (en los bugs, por el síntoma), se entiende sin abrir la issue y usa el vocabulario del glosario. Lleva prefijo solo si el `title:` del template lo define, aunque las issues vecinas lo usen. El tipo usa su campo nativo cuando exista; partner y módulo se describen según el tracker, fuera del título; las issues hermanas de un epic comparten forma.

Labels: aplicar la taxonomía documentada del repo con sus nombres exactos y ejes obligatorios, y proponer prioridad por convención e impacto. Crear un label ausente solo si la convención lo exige o el usuario lo autoriza. Lo obligatorio que falte o no pueda hacerse queda pendiente. Al reclasificar una issue, actualizar la representación del tipo que defina el tracker y sustituir el estado de triage anterior que ya no corresponda, conservando los demás labels.

En cualquier issue cuyo cambio modifique la apariencia de la interfaz (layout, estilos, tipografía, iconos o animaciones), añadir el label `ui-change`, sea cual sea su tipo. Usar el equivalente documentado del repo si existe; si falta, crear `ui-change` como parte de esta convención. Un cambio de lógica sin efecto en la apariencia conserva sus labels habituales.

Con imágenes o vídeo pegados o con rutas, seguir [Adjuntos](references/adjuntos.md). Solo ficheros existentes; grabar media nueva es otro flujo.

Preparada = cada acción con destino, título y cuerpo o comentario, labels, adjuntos, estado recomendado, esfuerzo (si el repo lo define) y pendientes, tras la revisión de huecos de la referencia.

## 3. Duplicadas y relacionadas

Buscar issues abiertas y cerradas por problema, componente, partner y concepto de dominio, incluidos los rechazos previos documentados. Ampliar a otros repos si el usuario los señala o el contexto lo sugiere. Leer título y body de los candidatos; comentarios cuando afecten al diagnóstico o al estado.

- **Duplicada:** mismo problema y alcance. Informar URL y estado; comentar solo si aporta contexto nuevo o lo pide el usuario. Si está cerrada, comprobar si el reporte es una recurrencia y no reabrir.
- **Relacionada:** alcance distinto. Referenciar con URL, o `ORG/REPO#N` en otro repo.
- **Sin coincidencias:** continuar. Si la búsqueda falla o queda incompleta, decirlo sin afirmar que no hay duplicadas.

Un síntoma compartido (un 502) no basta para declarar duplicada. Cada reporte acaba en creación, comentario, edición de una issue existente o duplicada sin acción.

## 4. Confirmar

Mostrar el resultado concreto antes de pedir aprobación: destino, acción, título y cuerpo o comentario, labels, referencias y adjuntos, y si queda lista para un agente o qué lo impide. En lote, un resumen por acción con sus textos.

La autorización explícita ya dada cubre su alcance y no se pide de nuevo. Si falta, una sola pregunta reúne confirmación y decisiones de contenido. Un cambio de dato suelto («P1») actualiza el borrador sin confirmar la publicación. Una aprobación parcial habilita solo lo aprobado.

Publicar con la acción autorizada y sus pendientes relevantes resueltos. Sin estimación temporal, salvo petición expresa. Si el repo usa un campo de esfuerzo relativo (en un proyecto de GitHub o en la propia issue, p. ej. `Size` o `Effort`), proponer su valor por el alcance dentro de esta misma aprobación. Usar el campo canónico del repo; la existencia de varios campos equivalentes no obliga a rellenarlos todos.

## 5. Publicar y verificar

Escribir el texto exacto en un fichero temporal, creado y borrado en comandos distintos del de publicación, y pasarlo con `--body-file` a `gh issue create`, `gh issue edit` o `gh issue comment`. Título, tipo, labels y rutas, como argumentos con quoting seguro. Aplicar `ready-for-agent` solo cuando la referencia lo permita; crear el label si falta y hay permiso.

Si el repo define campos de esfuerzo, fijar los aprobados tras crear: los de proyecto con `gh project item-edit` (ids en `gh project view`, `item-list` y `field-list`) y los de issue con la mutación GraphQL `setIssueFieldValue` (`issueFields: [{fieldId, singleSelectOptionId}]`, ids en `organization.issueFields`). Sin proyecto ni campos de issue, este paso se omite.

Antes de reintentar un fallo, comprobar stdout y GitHub: la issue pudo crearse pese al error, sobre todo con adjuntos. Recuperar lo existente y completar lo pendiente; repetir la creación solo si no se publicó.

Verificar en GitHub cuerpo, tipo, labels, esfuerzo (si aplica), referencias y adjuntos. En lote, reanudar solo lo pendiente. Cerrar con las URLs y los pendientes concretos, distinguiendo publicación verificada de verificación incompleta.
