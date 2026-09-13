# Contrato con el orquestador

Este directorio es la frontera entre el repositorio y **cualquier** orquestador
de agentes. El reparto es deliberado:

| Lo define el repositorio | Lo decide el orquestador |
|---|---|
| Qué hay que hacer y en qué orden (`tickets.json`) | Cuándo lanzar cada ticket |
| Cómo se sabe que está hecho (`pnpm gate`) | Cuánta concurrencia tolerar |
| Qué se le dice al agente (`ticket-prompt.md`) | Qué hacer cuando un gate falla |

Un orquestador no necesita saber nada de este proyecto más allá de estos tres
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

## El gate

```
pnpm gate    # lint + comprobación de tipos + suites unit e integration
```

Devuelve 0 sólo si todo pasa. **Córrelo en el worktree antes de publicar nada**,
no en CI: un fallo descubierto después del push ensucia la PR y obliga a una
segunda vuelta.

## Ciclo de un ticket

```
worktree nuevo desde la rama del ticket anterior de su carril
  → agente con ticket-prompt.md
  → pnpm gate
  → verde: commit, push, PR hacia esa misma base, comentario en el issue
  → rojo: un reintento pasándole el fallo; si vuelve a fallar, para el carril
```

`scripts/run-ticket.sh` y `scripts/run-lane.sh` implementan exactamente eso en
bash, y sirven como referencia ejecutable de lo que se espera — o como plan B si
el orquestador no está disponible.
