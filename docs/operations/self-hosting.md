# Ejecución local

## Desarrollo diario: `bun run dev:worktree`

Para trabajar en el código y el diseño, sin Docker:

```sh
bun run setup:worktree   # una vez por worktree: .dev.vars (con su BETTER_AUTH_URL), dependencias y D1 local
bun run dev:worktree     # Astro con hot reload en el puerto del worktree
```

`dev:worktree` usa 4321 en el checkout principal y un puerto propio en cada worktree, y ajusta
`BETTER_AUTH_URL` en `.dev.vars` a ese puerto (o al de la variable `PORT`, que usa la vista previa de `.claude/launch.json`); se para con `bunx astro dev stop`. Para entrar
con tu cuenta y tus datos (un export JSON de Datos → Exportar, por ejemplo el de producción):

```sh
bun run dev:account tu@correo.example ~/Downloads/finance-tracker-AAAA-MM-DD.json
```

Crea la cuenta (o le pone contraseña nueva si ya existe) en la D1 local, guarda la contraseña en
`.data/dev-account-password` e importa el JSON sustituyendo los datos de esa cuenta; sin JSON solo
deja la cuenta. Necesita el servidor en marcha para importar. Las credenciales de integraciones
no viajan en el export, y los instrumentos propios cuyo instrumento de mercado no exista en la D1
local se omiten. Producción no se toca.

## Docker en OrbStack

Para probar la imagen y SQLite como en producción. Con OrbStack arrancado, desde la raíz del repositorio:

```sh
bun run local:setup
bun run local:up
```

`local:up` arranca Astro en modo desarrollo con hot reload y muestra la URL de esta instancia cuando el contenedor está listo. El checkout
principal usa el puerto 4321; cada worktree obtiene otro puerto, guardado en
`.data/selfhost-port` y reutilizado en los siguientes arranques. Si un puerto está ocupado
por otra aplicación, se busca uno libre. Cada proyecto conserva su propio volumen SQLite.
La URL de autenticación se ajusta al puerto de la instancia.

El correo y la contraseña inicial están en
`.env.selfhost`, creado con permisos privados y excluido de Git y de la imagen Docker.
La configuración se guarda en el checkout principal y los worktrees la usan mediante
un enlace simbólico: al editar ese archivo, todos reciben los mismos cambios.
`bun run local:up`, `bun run local:down` y `bun run setup:worktree` preparan el enlace automáticamente.
Si un worktree tenía una configuración propia, se conserva en `.env.selfhost.local`
antes de enlazar la compartida; si ya hay una copia, se usa un sufijo numérico.
Selecciona «Contraseña» y entra con correo y contraseña. El administrador inicial ya tiene el correo verificado;
no necesitas configurar un proveedor de correo para este acceso.

La primera creación de la imagen descarga y prepara las dependencias y puede superar un minuto. Las siguientes reutilizan la caché de bun y las capas de Docker, compartidas entre worktrees. En desarrollo, el código y la configuración se montan desde el worktree: los cambios en Vue, Astro y CSS aparecen en el navegador sin reconstruir la imagen. Las dependencias Linux permanecen dentro del contenedor; no se monta el `node_modules` de macOS. Si cambias las dependencias, vuelve a ejecutar `bun run local:up`.

Para probar la compilación de producción con el mismo puerto y volumen, usa `bun run local:up:prod`. Para volver al hot reload, usa `bun run local:up`.

El servidor usa Astro con Node y SQLite local; no consulta D1 ni requiere Cloudflare
Access. La sincronización v2 está activada en ambos modos de Docker. Los datos empiezan vacíos,
independientes de producción. El importador de Datos admite la copia JSON v2 de la
aplicación; esto no migra las cuentas de autenticación de Cloudflare.

```sh
bun run local:down
bun run local:up
```

El volumen `finance-data` conserva la base de datos al parar, recrear o actualizar el
contenedor. No uses `docker compose down -v` si quieres conservarla. Las migraciones
se aplican una sola vez al arrancar. Cambiar la contraseña inicial en `.env.selfhost`
no sustituye la de una cuenta existente; se cambia desde la aplicación.

Guarda también `.env.selfhost`: contiene la clave de cifrado de credenciales de
integraciones. Para copiar SQLite, detén primero el servicio o usa su API de backup;
copiar solo el archivo `.sqlite` en caliente puede omitir datos del journal WAL.

El correo de verificación, OTP y recuperación requiere `RESEND_API_KEY` y
`RESEND_FROM` en `.env.selfhost`. Google/GitHub necesitan credenciales propias y
callbacks para este origen. Las passkeys se pueden usar en `localhost`.

## Recuperar reportes anteriores tras desplegar la migración

La migración `0016_issue_reports.sql` crea la tabla de propiedad de «Mis reportes». Las issues
enviadas antes no tienen fila y no aparecen hasta recuperarlas una vez. Hazlo con una copia de
`finance.sqlite` (o sobre el volumen inmediatamente después de la copia diaria) y con las mismas
variables de GitHub que usa el servidor (`GITHUB_ISSUE_TOKEN` o `GITHUB_TOKEN`, `GITHUB_OWNER`,
`GITHUB_REPO`).

```sh
# 1) Simulación: no escribe nada. Revisa el recuento y las issues saltadas.
bun run reports:backfill --v2-sqlite=/ruta/a/finance-tracker-v2.sqlite

# 2) Aplicación: inserta solo las filas que faltan.
bun run reports:backfill --v2-sqlite=/ruta/a/finance-tracker-v2.sqlite --execute

# 3) Opcional: deja el SQL para aplicarlo a D1 con wrangler.
bun run reports:backfill --execute --remote-sql-out=.data/reports-backfill.sql
```

En el paso 3 la lista de usuarios contra la que se valida el plan sigue siendo la de
`--v2-sqlite`, no la de D1. Usa una copia reciente de producción. Además, cada `INSERT`
del fichero lleva una guarda `WHERE EXISTS (SELECT 1 FROM users …)`: si una cuenta ya no
existe en D1, esa fila se omite en lugar de romper la clave foránea y abortar el resto.

El comando es idempotente y puede repetirse. Lee las issues con label `source:web-report` paginando
la API REST (nunca el buscador) y se salta, listándolas al final, las que no tienen bloque
`### Reportero`, lo tienen modificado o cuyo `Identificador` no corresponde a ninguna cuenta. Se
lanza una sola vez tras el despliegue; las altas posteriores se registran solas.

## Reparar los vínculos de inversión (BTC y ETH)

`bun run db:repair-links` (#558) vincula cada movimiento de inversión sin instrumento al instrumento
del usuario con ese símbolo, corrige los que apuntan a un instrumento de otro símbolo (las tres
compras de ETH de enero y febrero que apuntaban a BTC) y pasa a Bitvavo las compras de ETH que
constan con otra cuenta. La correspondencia símbolo → cuenta es el argumento `--move=ETH=Bitvavo`
(es el valor por defecto; repetible). Los movimientos con símbolo que no casan con ningún
instrumento del usuario, o con varios, se listan como saltados y no se tocan.

Por defecto **solo simula**: imprime cada movimiento con su antes y su después y no escribe nada.
`--execute` aplica exactamente ese plan en una sola transacción, tras dejar una copia de la base
(`<base>.antes-vinculos-<fecha>`), y aborta sin escribir si un movimiento cambió desde que se
calculó el plan. Cada movimiento reparado sube su versión y entra en `sync_changes`, así que los
demás dispositivos lo reciben. Es idempotente: sobre datos ya reparados el plan sale vacío.

La app en Docker no lleva `bun`, así que se lanza sobre una copia de la base y se devuelve al volumen
con el mismo procedimiento que la restauración de copias:

```sh
# 1) Copia de producción y simulación (la app puede seguir en marcha). Revisa el plan: los
#    movimientos de BTC y ETH sin instrumento, las tres compras de ETH que apuntan a BTC y las
#    compras de ETH que no constan en Bitvavo; nada más.
scp servidor:/var/backups/finance/<última copia>.gz . && gunzip -c <última copia>.gz > finance.sqlite
bun run db:repair-links --v2-sqlite=./finance.sqlite --email=<email>

# 2) Ventana de mantenimiento: parar la app, copiar la base del volumen y repararla.
ssh servidor 'cd ~/finance-prod && docker compose stop'
#    Copia la base del volumen y simula otra vez sobre esa copia: el plan debe seguir
#    siendo el revisado.
ssh servidor 'docker run --rm -v finance-data:/data -v "$PWD":/out alpine cp /data/finance.sqlite /out/finance.sqlite'
scp servidor:finance.sqlite ./finance.sqlite
bun run db:repair-links --v2-sqlite=./finance.sqlite --email=<email>
bun run db:repair-links --v2-sqlite=./finance.sqlite --email=<email> --execute

# 3) Comprobar que repetirlo no cambia nada (plan vacío) y devolver la base al volumen:
#    propietario UID 1000, borrar finance.sqlite-wal y -shm, y arrancar.
bun run db:repair-links --v2-sqlite=./finance.sqlite --email=<email>
scp ./finance.sqlite servidor:finance.sqlite
ssh servidor 'docker run --rm -v finance-data:/data -v "$PWD":/in alpine sh -c "cp /in/finance.sqlite /data/finance.sqlite && rm -f /data/finance.sqlite-wal /data/finance.sqlite-shm && chown 1000:1000 /data/finance.sqlite"'
ssh servidor 'cd ~/finance-prod && docker compose up -d'
```

Mientras la app está parada nadie escribe, así que la base reparada no pierde datos. Si algo sale
mal, restaura la copia diaria como se indica en «Copias». Después, en Inversión, las unidades de BTC
y de ETH deben ser la suma de todas sus compras y ETH debe figurar en Bitvavo.

## Convertir las cuentas-ETF en instrumentos de Trade Republic

`bun run db:merge-accounts` (#564) fusiona las cuentas heredadas «ETF XDWH», «ETF IQQI», «ETF AGED»,
«ETF SXRS» y «ETF Plata» en una única cuenta de inversión «Trade Republic» (la crea si falta, ADR
0011). Para cada cuenta heredada:

- suma lo que valía en cada cierre mensual (saldo arrastrado y movimientos incluidos) y su saldo
  inicial en Trade Republic;
- pasa su instrumento (el que apunta a ella) a Trade Republic;
- reasigna sus movimientos: cuenta destino Trade Republic y, si no lo tenían, su instrumento;
- pasa su parte de cada aporte a Trade Republic;
- la **archiva**, sin borrarla, con saldo inicial 0.

La correspondencia cuenta heredada → cuenta de inversión es el argumento repetible
`--merge=<cuenta>=<cuenta de inversión>`; por defecto, las cinco cuentas «ETF …» → Trade Republic.
«Acciones», «Oro» y «Fondos Indexados» no se tocan mientras no se indique su broker. Una cuenta sin
instrumento (no tiene símbolo en Ajustes) bloquea la ejecución: se lista como `BLOQUEO` en el plan.

Por defecto **solo simula**: imprime las cuentas, los cierres, los aportes y los movimientos afectados
y no escribe nada. `--execute` aplica exactamente ese plan en una sola transacción, tras dejar una
copia de la base (`<base>.antes-fusion-cuentas-<fecha>`). Antes de confirmar comprueba que el
patrimonio de cada mes (calculado como el cliente) y el capital aportado total son idénticos a antes;
si no lo son, o si los datos cambiaron desde la simulación, aborta sin escribir nada. Cada fila tocada
sube su versión y entra en `sync_changes`, así que los demás dispositivos la reciben. Es idempotente:
sobre datos ya fusionados el plan sale sin cuentas (las ya fusionadas se listan como tales).

Se lanza con el mismo procedimiento que la reparación de vínculos (la app en Docker no lleva `bun`):
sobre una copia de la base, con la app parada, y devolviéndola al volumen.

```sh
# 1) Copia de producción y simulación (la app puede seguir en marcha). Revisa el plan: las cinco
#    cuentas, un cierre por mes con su saldo en Trade Republic y los movimientos reasignados.
scp servidor:/var/backups/finance/<última copia>.gz . && gunzip -c <última copia>.gz > finance.sqlite
bun run db:merge-accounts --v2-sqlite=./finance.sqlite --email=<email>

# 2) Ventana de mantenimiento: parar la app, copiar la base del volumen y fusionar.
ssh servidor 'cd ~/finance-prod && docker compose stop'
ssh servidor 'docker run --rm -v finance-data:/data -v "$PWD":/out alpine cp /data/finance.sqlite /out/finance.sqlite'
scp servidor:finance.sqlite ./finance.sqlite
bun run db:merge-accounts --v2-sqlite=./finance.sqlite --email=<email>            # el plan revisado
bun run db:merge-accounts --v2-sqlite=./finance.sqlite --email=<email> --execute  # lo aplica

# 3) Comprobar que repetirlo no cambia nada (plan sin cuentas) y devolver la base al volumen:
#    propietario UID 1000, borrar finance.sqlite-wal y -shm, y arrancar.
bun run db:merge-accounts --v2-sqlite=./finance.sqlite --email=<email>
scp ./finance.sqlite servidor:finance.sqlite
ssh servidor 'docker run --rm -v finance-data:/data -v "$PWD":/in alpine sh -c "cp /in/finance.sqlite /data/finance.sqlite && rm -f /data/finance.sqlite-wal /data/finance.sqlite-shm && chown 1000:1000 /data/finance.sqlite"'
ssh servidor 'cd ~/finance-prod && docker compose up -d'
```

Mientras la app está parada nadie escribe. Si algo sale mal, restaura la copia diaria como se indica
en «Copias». Después, en Inversión, el detalle de Trade Republic debe mostrar los cinco instrumentos
y el patrimonio de cada mes debe ser el mismo que antes. Ejecútalo después de `db:repair-links`.

## Diferencia con preview

`bun run preview` prueba la compilación de Cloudflare mediante workerd. Este despliegue
ejecuta un servidor Node de producción dentro de Docker. La compilación habitual
sigue seleccionando Cloudflare (es la que ejercitan los tests); Docker usa `DEPLOY_TARGET=node`.

La frontera SQLite mantiene los métodos que consume el cliente Drizzle D1 para
reutilizar los repositorios. En Node, `runInTransaction` ejecuta `BEGIN IMMEDIATE` y
conserva la propiedad de la conexión durante todo el callback async, hasta `COMMIT`
o `ROLLBACK`. Importar (también reemplazar), inicializar, restablecer y provisionar
usuario/identidad confirman todas sus escrituras o revierten todas. Cada comando sync
incluye entidad, operación, cambios, cursor, auditoría y resultado en esa unidad.

La reserva del comando se confirma antes de la unidad de escritura: un fallo de
infraestructura deja una reserva `processing`, recuperable cuando vence su lease.
Los rechazos se guardan después del rollback; el replay, los conflictos y la parada
del lote mantienen su contrato. El lote completo no constituye una sola transacción.

Todas las lecturas, escrituras y batches que pasan por el binding comparten una cola
por conexión física, incluso con distintos handles Drizzle. Las peticiones ajenas
esperan hasta que termina la transacción; no ven escrituras pendientes ni participan
en su rollback. Los batches siguen siendo atómicos, también dentro de un callback. Los statements
preparados no exponen la conexión ni una ejecución síncrona pública; todos sus
métodos respetan la cola y rechazan SQL de control transaccional, incluidos
`COMMIT`, `ROLLBACK` y `SAVEPOINT`. Ese control pertenece al binding.
No se debe acceder directamente a la conexión nativa mientras el servidor la usa.
Los callbacks deben esperar sus consultas y no lanzar trabajo en segundo plano:
una tarea que hereda un propietario ya terminado recibe un error. Las transacciones
interactivas anidadas no están soportadas. Mantén cortos los callbacks: bloquean la
cola, y una llamada de red dentro de ellos retrasa las demás peticiones.

La capacidad se selecciona por backend/conexión. Un fallo real al iniciar SQLite se
propaga sin ejecutar el callback ni desactivar otra conexión. Cloudflare D1 mantiene
sus batches atómicos y sus operaciones interactivas secuenciales de mejor esfuerzo,
sin garantía de rollback entre consultas: no ofrece esa capacidad. No se envían
`BEGIN` ni `SAVEPOINT` a D1 para descubrirla. Estas garantías locales corresponden
a un único servidor Node y SQLite; no requieren cambiar de motor.

## Producción en Oracle

Producción corre desde octubre de 2026 en un servidor Ubuntu ARM con Docker, detrás de
Nginx Proxy Manager (NPM) en otra máquina. Los dos hablan por Tailscale: el servidor no
expone la app a Internet.

- **Servidor**: `~/finance-prod/compose.yaml` publica `<ip-tailscale>:4321` y monta el volumen
  externo `finance-data` con `finance.sqlite`. `docker.service` arranca después de `tailscaled`
  (drop-in de systemd) para que el puerto enlace tras un reinicio.
- **`.env`** (chmod 600): las variables públicas, los secretos (`BETTER_AUTH_SECRET`,
  `DATA_ENCRYPTION_KEY`, claves de Google/GitHub/Resend/mercado) y
  `BETTER_AUTH_URL=https://<dominio>`. Con `LOCAL_ADMIN_EMAIL` ya presente en la base, el
  arranque no crea otro administrador. `TEST_AUTH_ENABLED` no debe existir nunca.
- **NPM**: proxy host `<dominio>` → `http://<ip-tailscale>:4321`, certificado Let's Encrypt,
  Force SSL y Websockets. No hace falta configuración avanzada.
- **IP del cliente**: `CLIENT_IP_HEADER=x-real-ip`, que NPM sobrescribe con la IP real. Una
  cabecera `proxy_set_header` a nivel de servidor no sirve: nginx no la hereda en el
  `location /` de NPM.
- **Passkeys y OAuth**: el RP ID es el dominio de `BETTER_AUTH_URL`, así que cambiar de dominio
  exige registrar passkeys nuevas. Las callbacks son `/api/auth/callback/{google,github}`.
- **Despliegue automático**: `.github/workflows/deploy.yml` se ejecuta cuando el CI de `main`
  de un push termina en verde (o a mano con `workflow_dispatch` sobre `main`). Espera solo
  la verificación de que el árbol del push coincide con el validado en una PR verde; si no se
  puede verificar, ejecuta lint/tipos, Vitest y migraciones D1. El build de CI solo corre en PR
  y a mano: el despliegue construye la imagen del merge. La regresión extensa es semanal o manual,
  en otro workflow, y no dispara despliegues. Entra a Tailscale como nodo efímero,
  envía `git archive` del commit probado a `~/finance-tracker`, construye la imagen, recrea el
  contenedor y espera al healthcheck. Requiere un entorno `production` con los secretos
  `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET` (cliente OAuth de Tailscale con el tag `tag:ci`, que
  la ACL debe dejar llegar por SSH al servidor), `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`,
  `DEPLOY_HOST` (IP Tailscale) y `DEPLOY_USER`.
- **Actualizar a mano**: enviar el árbol a `~/finance-tracker` (por ejemplo `git ls-files -co
--exclude-standard | tar -cf - -T - | ssh servidor 'tar -x -C ~/finance-tracker'`),
  `docker build -t finance-tracker:selfhost .` y `docker compose up -d --force-recreate`.
  Las migraciones pendientes se aplican al arrancar.
- **Mantenimiento**: `MAINTENANCE_MODE=true` en el `.env` y recrear el contenedor responde 503
  a todo (el healthcheck de `/login` marcará el contenedor como no saludable, sin reiniciarlo).
- **Copias**: un timer de systemd (`finance-backup.timer`) ejecuta cada día
  `sqlite3 .backup` sobre el volumen, comprueba la integridad y guarda 14 copias comprimidas en
  `/var/backups/finance`. Para restaurar: parar la app, descomprimir sobre
  `finance.sqlite` del volumen (propietario UID 1000), borrar `-wal` y `-shm` y arrancar.
  Están en el mismo servidor: añade una copia externa si los datos importan.

## En otro servidor

La misma imagen y el mismo volumen sirven en cualquier servidor con Docker. Antes de publicar,
configura `BETTER_AUTH_URL` con tu URL HTTPS y usa `docker compose --env-file .env.selfhost up`;
prepara el correo y backups del volumen y de las
claves. El puerto de Compose solo escucha en loopback para conectar tu proxy inverso.
Detrás de un proxy inverso, define `CLIENT_IP_HEADER=x-real-ip` (o la cabecera que tu proxy
sobrescriba con la IP real). Sin ella Better Auth usa `cf-connecting-ip`, que un cliente
puede falsificar fuera de Cloudflare.

Sentry del servidor usa el SDK Node en este destino. El middleware lo inicializa en la
primera petición si `SENTRY_DSN` está en el `.env`; sin DSN no se envía ningún evento del
servidor. Además de los 500 de las rutas, viajan los fallos auxiliares del reporte web
(`report.stage` = `enrich` o `upload`, `report.reason` = estado HTTP, `timeout`, `shape`,
`network`...), siempre sin texto del usuario, claves ni cuerpos del proveedor. La integración
cliente existente sigue activa. No se han exportado ni modificado datos de Cloudflare.

### Archivado de worktrees en Orca

`bun run local:archive` elimina el contenedor, la imagen, la red y el volumen de datos de este worktree, si existen. El volumen contiene su SQLite: el archivado descarta esos datos. El checkout principal está protegido y el `.env.selfhost` compartido se conserva.

Para instalar el script en una ruta estable del checkout principal, ejecuta `bun run local:archive:install`. Esto permite ejecutar el hook también en ramas antiguas que no contienen el script. Para conservar la identidad de un proyecto anterior, ejecuta una vez `bun run local:up` con esta versión antes de detenerlo; así el archivado podrá identificar también su volumen cuando ya no quede contenedor. Configura este hook en Orca → Ajustes → finance-tracker → Script de archivado:

```sh
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
node "$ORCA_ROOT_PATH/.data/orca/archive-local.mjs" "$ORCA_WORKTREE_PATH"
```

La instalación se mantiene fuera de Git; vuelve a ejecutar el instalador cuando actualices el script.

### Configuración de Orca para desarrollo diario

Script de configuración (prepara dependencias, variables y D1 local, instala la limpieza compartida y abre Astro con hot reload):

```sh
set -eu
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$ORCA_WORKTREE_PATH"
bun run setup:worktree
bun run local:archive:install
exec bun run dev --host 127.0.0.1
```

Astro muestra el puerto asignado y elige otro si está ocupado. Abre esa URL con `/?demo=1` para usar datos sintéticos. El script de archivado es el del apartado anterior; usa una ruta del checkout principal para seguir disponible aunque la rama archivada no lo contenga.
