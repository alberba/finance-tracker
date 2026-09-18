# Encargo del orquestador

Eres el orquestador de una tanda de tickets. **Sólo abres sesiones.** No
implementas, no esperas, no revisas gates, no publicas: cada agente es
responsable de su ticket de principio a fin, espera incluida.

## Qué leer

`.agents/tickets.json` — un objeto por ticket con `issue`, `blockedBy`, `lane`,
`runner`, `model`, `effort` y `humanRun`.

## Qué hacer, por cada ticket

1. **Sáltate los `humanRun: true`.** Son #148 y #149: escriben sobre datos
   reales de producción y los lanza una persona. No abras sesión para ellos.

2. **Crea su worktree y su rama**, desde el repositorio base:

   ```
   git -C <repo-base> worktree add -b ticket/<issue> ../.ticket-<issue> <base>
   ```

   donde `<base>` es la rama del ticket anterior de su mismo carril, o
   `mal-guardado-v2-multiusuario` si es el primero del carril.

3. **Lanza una sesión en ese worktree**, con el modelo y el esfuerzo que dice el
   manifiesto, y como prompt inicial la plantilla de su runner con `{{issue}}`,
   `{{title}}` y `{{base}}` sustituidos:

   - `runner: "claude"` → `.agents/ticket-prompt.claude.md`
   - `runner: "codex"` → `.agents/ticket-prompt.codex.md`

   De cada plantilla se envía lo que hay **después** de la línea `---`; lo de
   arriba es documentación para humanos.

4. **Olvídate de esa sesión.** El agente espera a sus bloqueadores por su cuenta,
   consultando el estado de esos issues, y publica su PR cuando termina.

## Concurrencia

La regla es **como mucho un ticket vivo por carril**. Los carriles agrupan por
radio de impacto: dos tickets del mismo carril tocan los mismos ficheros y se
pisarían; dos carriles distintos casi nunca se solapan. Puedes tener los cinco
carriles vivos a la vez.

No hace falta que esperes a que un carril avance para lanzar el siguiente
ticket: si prefieres lanzarlos todos de golpe, cada agente esperará solo a sus
bloqueadores. Cuesta más sesiones y no gana tiempo, así que lo razonable es
lanzar el primer ticket de cada carril y, cuando su PR se mergea, el siguiente.

## Cuándo has terminado

Cuando cada ticket del manifiesto tenga su PR abierta o su issue cerrado, salvo
los `humanRun`. Si un agente comenta en su issue que no pudo pasar el gate o que
sigue bloqueado, **no lo relances a ciegas**: informa y para.
