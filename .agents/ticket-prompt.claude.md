# Encargo de un ticket — runner Claude Code

El orquestador sustituye `{{issue}}`, `{{title}}` y `{{base}}`, y entrega esto
como prompt inicial en un worktree ya creado y situado en la rama del ticket.
A partir de ahí el agente es autónomo: espera a sus bloqueadores si los tiene,
implementa, pasa el gate, publica la PR y comenta en el issue. El orquestador no
vuelve a intervenir.

---

Eres el responsable del issue #{{issue}} de este repositorio: «{{title}}», de
principio a fin. Estás en un worktree propio, sobre la rama `ticket/{{issue}}`,
y tu base es `{{base}}`.

## 1. Espera a tus bloqueadores

`.agents/tickets.json` dice de qué tickets depende el tuyo. Compruébalos:

```
gh issue view <bloqueador> --json number,state,title
```

Si alguno sigue abierto, **espera**: consulta cada pocos minutos hasta que
todos estén cerrados, y sólo entonces empieza. Mientras esperas no toques nada.
Cuando se cierre el último, actualiza tu base antes de trabajar:

```
git fetch origin && git rebase origin/{{base}}
```

Si tras dos horas de espera algún bloqueador sigue abierto, comenta en tu issue
que estás bloqueado y termina, en vez de empezar a ciegas.

## 2. Implementa

/implement el issue #{{issue}}. Léelo con `gh issue view {{issue}}`; el spec
padre es el #136.

Contexto que este trabajo da por sabido:

- `CONTEXT.md` es el glosario del dominio: escribe con esas palabras.
- `docs/adr/` son decisiones tomadas; no se revisitan en este ticket.
- `docs/migration/d1-v2-persistence-audit.md` explica cada hallazgo que el issue
  cite como §X.Y, con fichero y línea.

La costura de test acordada es el tier de ida y vuelta,
`tests/integration/d1-v2/round-trip/`: afirma lo que el usuario percibe —tecleo
esto, recargo, ¿sigue ahí?— y nunca funciones internas. **Muchos tickets traen ya
su test en rojo**, así que `/tdd` empieza con el rojo puesto. Ponlos en verde sin
relajar ninguna aserción, sin cambiar lo que afirman y sin omitirlos; si crees
que un test afirma algo incorrecto, para y dilo en vez de editarlo.

**No amplíes el alcance**: hay otros agentes trabajando en paralelo sobre la
misma base, y tocar ficheros que este ticket no necesita provoca conflictos que
paga otro.

## 3. Gate

`pnpm gate` — lint, comprobación de tipos y las dos suites. No publiques nada
hasta que salga en verde. Si falla, arréglalo; si tras varios intentos no lo
consigues, comenta en el issue qué falla exactamente y termina sin publicar.

## 4. Publica

Con el gate en verde, y sólo entonces:

```
git push -u origin ticket/{{issue}}
gh pr create --base {{base}} --head ticket/{{issue}} \
  --title "<título del ticket>" \
  --body "Implementa #{{issue}}. Spec: #136.

<qué cambiaste y por qué, en dos o tres frases>

El gate pasó en local antes de publicar.

Closes #{{issue}}"
```

Si `gh pr create` devuelve 502 —le pasa a este repositorio—, usa la API REST:
`gh api repos/{owner}/{repo}/pulls -X POST -f title=… -f head=… -f base=… -f body=…`

Termina comentando en el issue el enlace de la PR.
