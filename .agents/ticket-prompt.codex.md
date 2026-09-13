# Encargo de un ticket — runner Codex

Mismo encargo que `ticket-prompt.claude.md`, escrito por extenso: Codex no ve
las skills de `.claude/`, así que el flujo que allí aporta `/implement` —TDD por
rebanadas, revisión al cerrar— va explicado aquí.

---

Eres el responsable del issue #{{issue}} de este repositorio: «{{title}}», de
principio a fin. Estás en un worktree propio, sobre la rama `ticket/{{issue}}`,
y tu base es `{{base}}`.

## 1. Espera a tus bloqueadores

`.agents/tickets.json` dice de qué tickets depende el tuyo. Compruébalos:

```
gh issue view <bloqueador> --json number,state,title
```

Si alguno sigue abierto, **espera**: consulta cada pocos minutos hasta que todos
estén cerrados, y sólo entonces empieza. Mientras esperas no toques nada. Cuando
se cierre el último, actualiza tu base:

```
git fetch origin && git rebase origin/{{base}}
```

Si tras dos horas algún bloqueador sigue abierto, comenta en tu issue que estás
bloqueado y termina, en vez de empezar a ciegas.

## 2. Implementa

Lee antes de tocar código:

- el issue completo — `gh issue view {{issue}}`
- el spec padre, issue #136
- `CONTEXT.md`, el glosario del dominio: escribe con esas palabras
- `docs/adr/`, decisiones ya tomadas que no se revisitan aquí
- `docs/migration/d1-v2-persistence-audit.md` si el issue cita un hallazgo (§X.Y)

Trabaja dirigido por los tests, una rebanada cada vez: un test en rojo, el
código mínimo que lo pone en verde, limpieza. La costura acordada es el tier de
ida y vuelta, `tests/integration/d1-v2/round-trip/`, que afirma lo que el
usuario percibe —tecleo esto, recargo, ¿sigue ahí?— y nunca funciones internas.
**Muchos tickets traen ya su test en rojo**: ponlos en verde sin relajar ninguna
aserción, sin cambiar lo que afirman y sin omitirlos. Si crees que un test
afirma algo incorrecto, para y dilo en vez de editarlo.

Antes de darlo por terminado, revisa tu propio diff contra dos preguntas: ¿sigue
los estándares del repositorio (`AGENTS.md`, el código de alrededor)? ¿hace lo
que el issue pedía, ni más ni menos?

**No amplíes el alcance**: hay otros agentes en paralelo sobre la misma base.

## 3. Gate

`pnpm gate` — lint, comprobación de tipos y las dos suites. No publiques nada
hasta que salga en verde. Si tras varios intentos no lo consigues, comenta en el
issue qué falla exactamente y termina sin publicar.

## 4. Publica

Con el gate en verde, y sólo entonces: commit en `ticket/{{issue}}`, push, y PR
contra `{{base}}` con `gh pr create` (si devuelve 502, usa
`gh api repos/{owner}/{repo}/pulls -X POST`). El cuerpo lleva qué cambiaste y
por qué, y `Closes #{{issue}}`. Termina comentando el enlace de la PR en el
issue.
