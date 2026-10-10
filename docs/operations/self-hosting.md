# Ejecución local en OrbStack

Con OrbStack arrancado, desde la raíz del repositorio:

```sh
pnpm local:setup
pnpm local:up
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
`pnpm local:up`, `pnpm local:down` y `pnpm setup:worktree` preparan el enlace automáticamente.
Si un worktree tenía una configuración propia, se conserva en `.env.selfhost.local`
antes de enlazar la compartida; si ya hay una copia, se usa un sufijo numérico.
Selecciona «Contraseña» y entra con correo y contraseña. El administrador inicial ya tiene el correo verificado;
no necesitas configurar un proveedor de correo para este acceso.

La primera creación de la imagen descarga y prepara las dependencias y puede superar un minuto. Las siguientes reutilizan la caché de pnpm y las capas de Docker, compartidas entre worktrees. En desarrollo, el código y la configuración se montan desde el worktree: los cambios en Vue, Astro y CSS aparecen en el navegador sin reconstruir la imagen. Las dependencias Linux permanecen dentro del contenedor; no se monta el `node_modules` de macOS. Si cambias las dependencias, vuelve a ejecutar `pnpm local:up`.

Para probar la compilación de producción con el mismo puerto y volumen, usa `pnpm local:up:prod`. Para volver al hot reload, usa `pnpm local:up`. Para trabajar a diario sin Docker, recomendamos `pnpm setup:worktree` y `pnpm dev`; este modo usa D1 local y puedes abrir `/?demo=1`.

El servidor usa Astro con Node y SQLite local; no consulta D1 ni requiere Cloudflare
Access. La sincronización v2 está activada en ambos modos de Docker. Los datos empiezan vacíos,
independientes de producción. El importador de Datos admite la copia JSON v2 de la
aplicación; esto no migra las cuentas de autenticación de Cloudflare.

```sh
pnpm local:down
pnpm local:up
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

## Diferencia con preview

`pnpm preview` prueba la compilación de Cloudflare mediante workerd. Este despliegue
ejecuta un servidor Node de producción dentro de Docker. La compilación habitual y
`deploy:cf` siguen seleccionando Cloudflare; Docker usa `DEPLOY_TARGET=node`.

La frontera SQLite mantiene los métodos que consume el cliente Drizzle D1 para
reutilizar los repositorios. Los batches son transacciones SQLite. Como en D1, las
transacciones interactivas del dominio no son atómicas: no se comparte un BEGIN entre
peticiones asíncronas. No hay una migración a otro motor ni una reescritura del dominio.

## Futuro despliegue en Debian

La imagen y el volumen también sirven en Docker sobre Debian. Antes de publicar,
configura `BETTER_AUTH_URL` con tu URL HTTPS y usa `docker compose --env-file .env.selfhost up`;
prepara el correo y backups del volumen y de las
claves. El puerto de Compose solo escucha en loopback para conectar tu proxy inverso.
Falta adaptar la identificación de IP de Better Auth a un proxy de confianza: ahora
usa `cf-connecting-ip`, por lo que este cambio está validado para uso local y no deja
cerrada la configuración de seguridad de un servidor público.

Sentry del servidor usa el SDK Node en este destino. Sin configurar un DSN e
inicializarlo, no envía eventos del servidor. La integración cliente existente sigue
activa. No se han exportado ni modificado datos de Cloudflare.

### Archivado de worktrees en Orca

`pnpm local:archive` elimina el contenedor, la imagen, la red y el volumen de datos de este worktree, si existen. El volumen contiene su SQLite: el archivado descarta esos datos. El checkout principal está protegido y el `.env.selfhost` compartido se conserva.

Para instalar el script en una ruta estable del checkout principal, ejecuta `pnpm local:archive:install`. Esto permite ejecutar el hook también en ramas antiguas que no contienen el script. Para conservar la identidad de un proyecto anterior, ejecuta una vez `pnpm local:up` con esta versión antes de detenerlo; así el archivado podrá identificar también su volumen cuando ya no quede contenedor. Configura este hook en Orca → Ajustes → finance-tracker → Script de archivado:

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
pnpm setup:worktree
pnpm local:archive:install
exec pnpm dev --host 127.0.0.1
```

Astro muestra el puerto asignado y elige otro si está ocupado. Abre esa URL con `/?demo=1` para usar datos sintéticos. El script de archivado es el del apartado anterior; usa una ruta del checkout principal para seguir disponible aunque la rama archivada no lo contenga.
