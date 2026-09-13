# Encargo de un ticket — runner Claude Code

El orquestador sustituye `{{issue}}` y `{{title}}` y entrega esto como prompt
inicial, dentro de un worktree ya creado sobre la base del ticket.

`/implement` es quien hace el trabajo: conduce `/tdd` por dentro, cierra pasando
`/code-review` y commitea en la rama actual. Lo de arriba y lo de abajo es sólo
el contexto que esta tanda de tickets necesita y que la skill no puede adivinar.

---

/implement el issue #{{issue}} de este repositorio: «{{title}}».

Léelo con `gh issue view {{issue}}`. El spec padre es el issue #136.

Contexto que este trabajo da por sabido:

- `CONTEXT.md` es el glosario del dominio: escribe con esas palabras.
- `docs/adr/` contiene decisiones ya tomadas; no se revisitan en este ticket.
- `docs/migration/d1-v2-persistence-audit.md` explica cada hallazgo que el issue
  cite como §X.Y, con fichero y línea.

La costura de test acordada es el tier de ida y vuelta,
`tests/integration/d1-v2/round-trip/`: afirma lo que el usuario percibe —tecleo
esto, recargo, ¿sigue ahí?— y nunca funciones internas. **Muchos tickets traen ya
su test en rojo**: en esos, `/tdd` empieza con el rojo puesto. Ponlos en verde
sin relajar ninguna aserción, sin cambiar lo que afirman y sin omitirlos; si
crees que un test afirma algo incorrecto, para y dilo en vez de editarlo.

Dos límites del encargo:

- **No amplíes el alcance.** Hay otros agentes trabajando en paralelo sobre la
  misma base: tocar ficheros que este ticket no necesita provoca conflictos que
  paga otro.
- **Commitea, pero no hagas push ni abras PR.** De publicar se encarga quien te
  lanzó, después de pasar `pnpm gate`.
