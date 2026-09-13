# Encargo de un ticket — runner Codex

Mismo encargo que `ticket-prompt.claude.md`, escrito por extenso: Codex no ve
las skills de `.claude/`, así que el flujo que allí aporta `/implement` —TDD por
rebanadas, revisión al cerrar— va explicado aquí.

---

Implementa el issue #{{issue}} de este repositorio: «{{title}}».

Antes de tocar código, lee:

- el issue completo — `gh issue view {{issue}}`
- el spec padre, issue #136, que explica por qué existe este trabajo
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

Dos límites del encargo:

- **No amplíes el alcance.** Hay otros agentes trabajando en paralelo sobre la
  misma base: tocar ficheros que este ticket no necesita provoca conflictos que
  paga otro.
- **Commitea en la rama actual, pero no hagas push ni abras PR.** De publicar se
  encarga quien te lanzó, después de pasar `pnpm gate`.

Deja `pnpm gate` en verde: lint, comprobación de tipos y las dos suites.
