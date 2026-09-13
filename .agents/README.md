# Contrato con el orquestador

Este directorio es la frontera entre el repositorio y **cualquier** orquestador
de agentes. El reparto es deliberado:

| Lo define el repositorio | Lo hace el orquestador | Lo hace el agente |
|---|---|---|
| Qué hay que hacer y en qué orden (`tickets.json`) | Crear el worktree y la rama | Esperar a sus bloqueadores |
| Cómo se sabe que está hecho (`pnpm gate`) | Lanzar una sesión por ticket | Implementar y pasar el gate |
| Qué se le dice al agente (`ticket-prompt.<runner>.md`) | Elegir modelo y esfuerzo | Commit, push, PR y comentario |

**El orquestador sólo arranca sesiones.** No espera, no vigila el gate, no
publica: un ticket es una sesión que se lanza y se olvida. El agente que la
ocupa es responsable de su ticket de principio a fin, y si su ticket está
bloqueado, de esperar consultando el estado de los issues que lo bloquean hasta
que se cierren.

Un orquestador no necesita saber nada de este proyecto más allá de estos
ficheros.

## `tickets.json`

Un objeto por ticket:

- **`issue`** — número en GitHub, la fuente de verdad del enunciado.
- **`blockedBy`** — los tickets que deben estar hechos antes. La **frontera** en
  cada momento es el conjunto de tickets cuyos bloqueadores están todos cerrados;
  esos pueden lanzarse en paralelo.
- **`lane`** — agrupación por **radio de impacto**, no por tema: dos tickets del
  mismo carril tocan los mismos ficheros y no deben correr a la vez, mientras que
  dos carriles distintos rara vez se solapan. Un carril se ejecuta en orden y
  cada ticket se apila sobre la rama del anterior.
- **`runner`**, **`model`**, **`effort`** — con qué ejecutarlo. El criterio está
  en `docs/` y en el hilo del spec, pero en una frase: **donde hay test en rojo
  se puede usar un modelo barato con esfuerzo alto, porque el test es el juez;
  donde no lo hay, hace falta el modelo bueno.**
- **`hasFailingTest`** — si el ticket trae ya su criterio de «hecho» ejecutable.
- **`humanRun`** — `true` en los dos tickets que **no** deben publicarse sin una
  persona: el script de reparación y el cierre del esquema escriben sobre datos
  reales. El agente puede prepararlos; ejecutarlos es un acto humano.

## El encargo

Hay una plantilla por runner, y no es una duplicación gratuita: `/implement`
—que conduce `/tdd` por dentro y cierra pasando `/code-review`— es una skill de
Claude Code, así que Codex no la ve. `ticket-prompt.claude.md` la invoca;
`ticket-prompt.codex.md` explica el mismo flujo por extenso. Lo que ninguna de
las dos da por sabido es el contexto de esta tanda: el glosario, los ADRs, la
auditoría, y que la costura de test es el tier de ida y vuelta.

El agente lo hace todo: espera, implementa, commitea, pasa el gate, publica la
PR y comenta el enlace en el issue. Cierra el issue la propia PR, vía
`Closes #<issue>`, que es también lo que desbloquea a los agentes que estén
esperando.

## El gate

```
pnpm gate    # lint + comprobación de tipos + suites unit e integration
```

Devuelve 0 sólo si todo pasa. **Córrelo en el worktree antes de publicar nada**,
no en CI: un fallo descubierto después del push ensucia la PR y obliga a una
segunda vuelta.

## Ciclo de un ticket

```
orquestador: worktree nuevo + rama ticket/<issue> + una sesión
        agente: ¿bloqueadores cerrados? ─ no → esperar y volver a mirar
                                         └ sí → rebase sobre la base
                → implementar (TDD sobre el tier de ida y vuelta)
                → pnpm gate ─ rojo → arreglar; si no sale, comentar y parar
                            └ verde → commit, push, PR (Closes #issue), comentar
```

Un ticket cerrado desbloquea al siguiente por sí solo: los agentes que esperan
lo ven al consultar el estado del issue. No hace falta que nadie les avise.

`scripts/run-ticket.sh` y `scripts/run-lane.sh` siguen sirviendo como plan B si
el orquestador no está disponible, pero hacen más de lo que aquí se pide: son de
la época en que publicaba el runner.
