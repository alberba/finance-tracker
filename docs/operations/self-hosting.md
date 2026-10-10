# Ejecución local en OrbStack

Con OrbStack arrancado, desde la raíz del repositorio:

```sh
pnpm local:setup
pnpm local:up
```

Abre <http://localhost:4321/login>. El correo y la contraseña inicial están en
`.env.selfhost`, creado con permisos privados y excluido de Git y de la imagen Docker.
Selecciona «Contraseña» y entra con correo y contraseña. El administrador inicial ya tiene el correo verificado;
no necesitas configurar un proveedor de correo para este acceso.

El servidor usa Astro con Node y SQLite local; no consulta D1 ni requiere Cloudflare
Access. La sincronización v2 se activa al compilar la imagen. Los datos empiezan vacíos,
independientes de producción. El importador de Datos admite la copia JSON v2 de la
aplicación; esto no migra las cuentas de autenticación de Cloudflare.

```sh
docker compose logs -f app
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
configura `BETTER_AUTH_URL` con tu URL HTTPS, el correo y backups del volumen y de las
claves. El puerto de Compose solo escucha en loopback para conectar tu proxy inverso.
Falta adaptar la identificación de IP de Better Auth a un proxy de confianza: ahora
usa `cf-connecting-ip`, por lo que este cambio está validado para uso local y no deja
cerrada la configuración de seguridad de un servidor público.

Sentry del servidor usa el SDK Node en este destino. Sin configurar un DSN e
inicializarlo, no envía eventos del servidor. La integración cliente existente sigue
activa. No se han exportado ni modificado datos de Cloudflare.
