# Plantilla de encargo de un ticket

El orquestador sustituye `{{issue}}` y `{{title}}` y entrega esto como prompt
inicial del agente, dentro de un worktree ya creado sobre la base del ticket.

---

Implementa el issue #{{issue}} de este repositorio: «{{title}}».

Antes de tocar código, lee:

- el issue completo — `gh issue view {{issue}}`
- el spec padre, issue #136, que explica por qué existe este trabajo
- `CONTEXT.md`, el glosario del dominio: escribe con esas palabras
- `docs/adr/`, las decisiones que no se revisitan en este ticket
- `docs/migration/d1-v2-persistence-audit.md` si el issue cita un hallazgo (§X.Y)

Reglas del encargo:

- **El criterio de «hecho» son los criterios de aceptación del issue.** Muchos
  tickets traen ya su test en rojo en `tests/integration/d1-v2/round-trip/`.
  Ponlos en verde sin relajar ninguna aserción, sin cambiar lo que afirman y sin
  marcarlos como omitidos. Si crees que un test afirma algo incorrecto, para y
  dilo en vez de editarlo.
- **No amplíes el alcance.** Hay otros agentes trabajando en paralelo sobre la
  misma base; tocar ficheros que este ticket no necesita provoca conflictos que
  pagará otro.
- **No hagas commit, push ni abras PR.** De publicar se encarga quien te lanzó.
- **Deja el gate en verde**: `pnpm gate` (lint, comprobación de tipos y las dos
  suites). Ejecútalo tú antes de dar el trabajo por terminado.

Cuando acabes, resume en una línea qué cambiaste y por qué. Si no pudiste
terminar, di exactamente dónde te quedaste y qué falta: es más útil que un
resumen optimista.
