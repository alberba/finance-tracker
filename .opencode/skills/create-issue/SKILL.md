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

Leer las convenciones del tracker y los templates. Elegir el tipo por la intención global (`bug`, `feature`, `task`, `epic`; `task` si ninguna domina) y mapearlo al template y al label local.

Explorar el código en solo lectura hasta localizar el componente y las referencias del reporte; si no se localizan, preparar con lo disponible y decirlo. Separar hechos reportados, verificados, hipótesis y propuestas.

Seguir el template, con sus campos y prefijo de título; sin template, `## Descripción` y `## Notas técnicas`. Los datos desconocidos quedan pendientes; los criterios de aceptación salen del comportamiento pedido.

Preparar las issues nuevas para `ready-for-agent` según [Preparación para agentes](references/ready-for-agent.md): reporte en el cuerpo, brief en un comentario. Resolver con contexto y código lo posible; reunir solo las preguntas que bloqueen la implementación.

Labels: aplicar la taxonomía documentada del repo con sus nombres exactos y ejes obligatorios (partner, módulo…), y proponer prioridad por convención e impacto. Crear un label ausente solo si la convención lo exige o el usuario lo autoriza. Lo obligatorio que falte o no pueda hacerse queda pendiente.

En las `feature` que cambien la apariencia de la interfaz (layout, estilos, tipografía, iconos o animaciones), añadir el label `ui-change` además del tipo. Usar el equivalente documentado del repo si existe; si falta, crear `ui-change` como parte de esta convención. Un cambio de lógica sin efecto en la apariencia conserva sus labels habituales.

Con imágenes o vídeo pegados o con rutas, seguir [Adjuntos](references/adjuntos.md). Solo ficheros existentes; grabar media nueva es otro flujo.

Preparada = cada acción con destino, título/body, brief o comentario, labels, adjuntos, estado recomendado y pendientes.

## 3. Duplicadas y relacionadas

Buscar issues abiertas y cerradas por problema, componente, partner y concepto de dominio, incluidos los rechazos previos documentados. Ampliar a otros repos si el usuario los señala o el contexto lo sugiere. Leer título y body de los candidatos; comentarios cuando afecten al diagnóstico o al estado.

- **Duplicada:** mismo problema y alcance. Informar URL y estado; comentar solo si aporta contexto nuevo o lo pide el usuario. Si está cerrada, comprobar si el reporte es una recurrencia y no reabrir.
- **Relacionada:** alcance distinto. Referenciar con URL, o `ORG/REPO#N` en otro repo.
- **Sin coincidencias:** continuar. Si la búsqueda falla o queda incompleta, decirlo sin afirmar que no hay duplicadas.

Un síntoma compartido (un 502) no basta para declarar duplicada. Cada reporte acaba en creación, comentario o duplicada sin acción.

## 4. Confirmar

Mostrar el resultado concreto antes de pedir aprobación: destino, acción, título/body, brief o comentario, labels, referencias y adjuntos, y si queda lista para un agente o qué lo impide. En lote, un resumen por acción con sus textos.

La autorización explícita ya dada cubre su alcance y no se pide de nuevo. Si falta, una sola pregunta reúne confirmación y decisiones de contenido. Un cambio de dato suelto («P1») actualiza el borrador sin confirmar la publicación. Una aprobación parcial habilita solo lo aprobado.

Publicar con la acción autorizada y sus pendientes relevantes resueltos. Sin estimación temporal ni proyecto, salvo petición expresa.

## 5. Publicar y verificar

Escribir el texto exacto en un fichero temporal, creado y borrado en comandos distintos del de publicación, y pasarlo con `--body-file` a `gh issue create` o `gh issue comment`. Título, labels y rutas, como argumentos con quoting seguro.

Autorizar la creación incluye publicar el brief: `gh issue comment --body-file`, enlazado desde el cuerpo. Aplicar `ready-for-agent` tras verificar el brief; crear el label si falta y hay permiso.

Antes de reintentar un fallo, comprobar stdout y GitHub: la issue pudo crearse pese al error, sobre todo con adjuntos. Recuperar lo existente y completar lo pendiente; repetir la creación solo si no se publicó.

Verificar en GitHub cuerpo, brief, enlace, labels, referencias y adjuntos. En lote, reanudar solo lo pendiente. Cerrar con las URLs y los pendientes concretos, distinguiendo publicación verificada de verificación incompleta.
