# Contribuir

Cómo se trabaja en este repo: entorno, ramas, commits, PRs y qué tiene que pasar en verde antes de
mezclar. Las reglas sobre **cómo se escribe el código** están aparte, en
[`CODING_STANDARDS.md`](./CODING_STANDARDS.md).

## Entorno

Node según `.node-version`, pnpm como gestor.

```bash
pnpm install
pnpm setup:worktree
pnpm dev
```

`pnpm setup:worktree` crea `.dev.vars` y aplica las migraciones D1 locales; cómo entrar en local
con identidad local de pruebas está en el [README](./README.md#ejecutar-en-local-astro). Para Playwright,
una sola vez: `pnpm test:e2e:install`.

Sesiones y proveedores de login: [autenticación](docs/operations/authentication.md).
Node/SQLite, Docker y arranque o archivado de worktrees en Orca:
[self-hosting](docs/operations/self-hosting.md).

## Dónde viven las issues

En [GitHub Issues](https://github.com/alberba/finance-tracker/issues). El vocabulario de triaje
(`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) está descrito en
`docs/agents/triage-labels.md`, y el flujo con `gh` en `docs/agents/issue-tracker.md`.

## Ramas y commits

- Se sale de `main` con una rama por trabajo. No se commitea directo a `main`.
- Mensajes en formato **Conventional Commits**: `feat:`, `fix:`, `chore:`, `ci:`, `docs:`,
  `refactor:`, `test:`. Si el trabajo cierra una issue, referénciala (`Closes #123`).
- Un commit hace una cosa. Si el mensaje necesita una "y", probablemente son dos commits.

## Antes de abrir el PR

Si el cambio solo modifica texto documental, revisa los enlaces y las instrucciones, comprueba
el formato de los Markdown tocados y ejecuta `git diff --check`. Esa revisión basta para abrir
la PR; los cambios de código, configuración o contenido ejecutable requieren las comprobaciones
siguientes, aunque estén dentro de `docs/`.

Para esos cambios, ejecuta el gate de calidad y smoke en secuencia:

```bash
pnpm gate                   # dependencias + lint + tipos + unit/component/integration
pnpm test:e2e:smoke          # recorridos críticos
```

El CI de cada PR ejecuta lint, tipos y `pnpm test`, comprueba que las migraciones D1
locales v2 aplican limpias y ejecuta `pnpm build`. No calcula cobertura. El E2E (smoke, auth, funcional, visual, sync-v2)
corre al empujar a `main`; en una PR, solo con el label `run-e2e`.

`pnpm test:e2e:visual` compara píxeles y es inestable por naturaleza: un diff de snapshot es una
pregunta que hay que mirar, no necesariamente un fallo. Si el cambio visual es el esperado,
actualiza los snapshots explícitamente.

## Pull requests

- Describe **qué** cambia y **por qué**; el diff ya cuenta el cómo.
- Enlaza la issue de origen. Un PR sin issue detrás debería explicar en su cuerpo qué lo motivó.
- Un cambio funcional de frontend llega con cobertura E2E nueva o actualizada.
- Las migraciones de base de datos no se editan una vez mezcladas: se añade una nueva.

## Agentes

Este repo está configurado para las skills de ingeniería descritas en [`AGENTS.md`](./AGENTS.md),
con los ajustes por repo en `docs/agents/`. Un cambio hecho por un agente pasa exactamente por el
mismo listón que uno hecho a mano: mismos estándares, mismos gates, misma revisión.
