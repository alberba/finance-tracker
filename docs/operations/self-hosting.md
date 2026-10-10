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
en su rollback. Los batches siguen siendo atómicos, también dentro de un callback.
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
