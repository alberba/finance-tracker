# Autenticación integrada (#275)

Better Auth 1.7.7, su plugin passkey 1.7.7 y Resend 6.32.1 están fijados en el
lockfile. `@better-auth/utils` 0.4.2 fija el peer requerido por core/passkey; Better
Auth resuelve su dependencia propia. Astro 7 / Workers `nodejs_compat` / Drizzle
0.45.3 / D1 siguen siendo el runtime. Las migraciones 0007–0009 son aditivas y
conservan las claves financieras.

## Contratos

- `AuthPrincipal` es la identidad financiera única. Better Auth mantiene el mismo
  `id` de `users` para identidades migradas. El cuerpo de una petición nunca decide
  el usuario. `X-Finance-User-Id` permite rechazar una cola de otra identidad; no
  autoriza ni selecciona datos. Es obligatorio para `/api/sync` con Better Auth.
- Un usuario de autenticación pendiente no tiene espacio financiero. Un trigger
  confirma correo verificado, política y cupo, consume una plaza y crea `users`
  mediante una sola sentencia SQLite. Si falla, toda esa sentencia se revierte.
  No se usa el wrapper de transacciones de dominio para esta admisión: D1 no
  acepta `BEGIN` arbitrario. El registro completado es idempotente por usuario.
- Enlaces aleatorios de 72 caracteres; D1 guarda SHA-256. Cupo inicial 5, vigencia
  7 días, configurable. La cookie de invitación es HttpOnly/SameSite=Lax y caduca
  en un día. El límite y caducidad se comprueban al completar, también en OAuth.
  Una invitación nueva permite reintentar la admisión de un registro pendiente.
- Rol `auth_role=admin` independiente de `isLegacyOwner`. El propietario migrado,
  con correo verificado igual a `LEGACY_OWNER_EMAIL`, obtiene ese rol al entrar.
  Un administrador puede autorizar otros usuarios ya admitidos desde ajustes.
- Vinculación implícita desactivada. Google/GitHub con correo coincidente no
  acceden a una cuenta existente: primero entrar con correo, después vincular
  desde ajustes. La vinculación exige sesión y señal de correo verificado del
  proveedor. Las passkeys exigen sesión admitida y verificación WebAuthn del
  usuario comprobada en servidor, tanto al registrar como al autenticar.
- Sesión de 30 días, renovada como máximo cada hora de uso. La granularidad puede
  anticipar la caducidad hasta una hora frente a 30 días exactos desde el último
  uso. No hay caché de cookies de sesión. Cada autorización lee D1 y propaga la
  cookie de renovación, por lo que una revocación invalida el siguiente acceso.
- Códigos de seis cifras, 10 minutos, cinco intentos; secretos OTP hasheados.
  Rate limiting de Better Auth en D1: 60 peticiones/minuto por IP y ruta,
  10/minuto en sign-in, 5/minuto en email-otp (las reglas del plugin pueden ser
  más restrictivas). Producción usa exclusivamente `cf-connecting-ip`, que
  Cloudflare establece. No depende de contadores en memoria de un Worker.
- Correo transaccional esperado antes de responder. El plugin
  `await-transactional-delivery` evita que Better Auth oculte fallos de entrega
  como tareas de fondo. Fallar el envío no completa ni admite el registro.
- Recuperación usa un OTP `forget-password`, establece una contraseña y revoca
  sesiones antes de abrir la nueva. El código `sign-in` ordinario conserva las
  otras sesiones. Perder una passkey permite recuperar por correo verificado.
- Logout voluntario sincroniza primero. Si quedan comandos, la persona decide
  quedarse o descartarlos explícitamente. Primero se revoca la sesión remota,
  después se borra el almacenamiento. Expiración/revocación detiene la cola y
  conserva IndexedDB bajo el mismo usuario. No cachear login ni redirects en SW.

## Configuración del operador

1. Elegir el origen HTTPS canónico. Escribir `BETTER_AUTH_URL` y `RESEND_FROM`
   como variables del Worker; `LEGACY_OWNER_EMAIL` debe ser el correo real del
   propietario. Construir con `PUBLIC_SYNC_V2=true` antes del corte: los usuarios
   invitados necesitan el modelo multiusuario y las colas separadas.
2. Crear una clave aleatoria de al menos 32 caracteres, por ejemplo
   `openssl rand -base64 32`. Guardar con
   `pnpm exec wrangler secret put BETTER_AUTH_SECRET`. Usar una distinta para
   local/staging/producción. Nunca usar un prefijo `PUBLIC_` para secretos.
3. En [Resend Domains](https://resend.com/domains), añadir un dominio o subdominio
   propio y copiar los registros DNS que muestra Resend. Esperar la verificación
   SPF/DKIM. Elegir un remitente de ese dominio en `RESEND_FROM`. Crear una API
   key de envío en [API Keys](https://resend.com/api-keys) y guardar con
   `pnpm exec wrangler secret put RESEND_API_KEY`.
   Consultar [las cuotas y precios vigentes](https://resend.com/pricing) al
   configurar: el plan gratuito permite empezar sin cuota fija, pero el límite
   diario puede detener logins/recuperaciones. No se asume una cuota permanente.
4. En [Google Auth Platform](https://console.cloud.google.com/auth/overview),
   configurar audiencia, marca y un cliente OAuth de aplicación web. Autorizar
   el origen y `${BETTER_AUTH_URL}/api/auth/callback/google`. Configurar
   `GOOGLE_CLIENT_ID` y guardar `GOOGLE_CLIENT_SECRET` con `wrangler secret put`.
   Añadir los usuarios de prueba mientras la aplicación permanezca en testing.
5. En [GitHub OAuth Apps](https://github.com/settings/developers), registrar una
   OAuth App con homepage canónica y callback
   `${BETTER_AUTH_URL}/api/auth/callback/github`. Configurar `GITHUB_CLIENT_ID` y
   guardar `GITHUB_CLIENT_SECRET` con `wrangler secret put`. Las credenciales del
   login son distintas de `GITHUB_ISSUE_TOKEN`, usado para reportes.
6. Para local, copiar las mismas variables a `.dev.vars`, usar un secreto propio
   y `BETTER_AUTH_URL=http://localhost:4321`. Las passkeys necesitan un dominio
   válido; `localhost` sirve, `127.0.0.1` no sirve como RP ID. Los callbacks de
   local/staging necesitan su propio registro en los proveedores.

## Migración y corte

1. Mantener Access activo y `AUTH_MODE=cf-access` (el valor omitido conserva el
   puente). Exportar una copia D1 antes de migrar, conservando su versión/fecha.
   `pnpm exec wrangler d1 export finance-tracker-db-v2 --remote --output <ruta>`.
2. Aplicar `pnpm d1:migrate:remote:v2` durante una ventana controlada. 0007 prepara
   únicamente emails ligados a una identidad `cf-access` de confianza que
   coincide con `users.email`, conservando el id. No crea sesiones desde cookies
   Access ni provisiona identidades por un email OAuth coincidente.
3. Ejecutar en D1 la consulta de preflight de abajo. Cero usuarios pendientes es
   condición del corte. Si hay datos sin identidad verificable, resolver la
   correlación con prueba explícita del propietario antes del corte; no crear
   una cuenta nueva ni rellenar emails basándose en parámetros del navegador.
   Si alguien entra por Access después de 0007, ejecutar al cierre de la ventana
   `pnpm exec wrangler d1 execute finance-tracker-db-v2 --remote --file scripts/prepare-authentication-users.sql`.
   Es idempotente y usa las mismas identidades de confianza que 0007. No tocar ids ni credenciales financieras.
4. En staging, definir `AUTH_MODE=better-auth`, construir/deployar con sync v2 y
   probar las APIs privadas antes de retirar la política externa de Access.
   Comprobar login del propietario por código, mismo `user.id` e historial,
   administrador inicial, invitación, verificación, ambos OAuth, vinculación,
   passkey y recuperación. Probar dos sesiones, revocación inmediata, aislamiento
   y cola pendiente durante pérdida de sesión. No hacer logout para la primera
   migración: provocaría un borrado voluntario; basta autenticar una vez.
5. Validar por separado una PWA realmente instalada en Android/iOS: callback
   Google/GitHub vuelve al origen, sesión compartida con la PWA según el navegador,
   envío/recepción de códigos, passkey, cierre remoto y vuelta del segundo plano.
   La emulación de Playwright no demuestra compatibilidad del dispositivo.
6. Publicar el Worker con `AUTH_MODE=better-auth`. Solo tras verificar las
   fronteras privadas retirar la política Access del hostname. Ese modo ignora
   por completo las cabeceras Access. Dejar un artefacto de rollback preparado.
7. Tras cerrar la ventana de rollback, retirar `CF_ACCESS_*`, las políticas y
   el bloque de middleware del puente `cf-access`, conservando las identidades
   históricas para auditoría. El puente solo autoriza JWT Access verificados y
   nunca convierte cookies a sesiones Better Auth.

```sql
SELECT u.id, u.email FROM users u
LEFT JOIN auth_user a ON a.id = u.id
LEFT JOIN auth_admission m ON m.user_id = u.id
WHERE a.id IS NULL OR m.user_id IS NULL;
SELECT u.id, u.email, u.is_legacy_owner, r.role FROM users u
LEFT JOIN auth_role r ON r.user_id = u.id
WHERE u.is_legacy_owner = 1;
PRAGMA foreign_key_check;
```

## Verificación y rollback

- Gates: `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm build`.
- HTTP/SQLite: `pnpm test:integration tests/integration/auth`.
- Worker/D1 y WebAuthn real con autenticador virtual:
  `pnpm test:e2e:auth` (desktop y móvil; correo y red de proveedores externos simulados).
  `AUTH_TEST_PORT` permite otro puerto. El runner usa una D1 de pruebas distinta,
  migraciones reales y el mismo estado local que Astro. Los servidores de prueba
  solo funcionan con flag de pruebas y origen loopback. El alias de red OAuth
  se activa exclusivamente en el runner (`AUTH_E2E_NETWORK=true`); mantiene los
  handlers de Better Auth, callbacks y persistencia reales. No desplegar esos flags.
  Ejecutar los comandos Astro de check/build antes o después del E2E: comparten
  caché de Vite y ejecutarlos simultáneamente puede invalidarla.
- Repetir el spec de logout legacy: `pnpm test:e2e tests/e2e/logout.spec.ts`.
- Si el corte falla: reactivar Access y volver al artefacto con
  `AUTH_MODE=cf-access`. D1 y los ids financieros se conservan; las tablas nuevas
  pueden permanecer. No restaurar una copia antigua sobre cambios financieros
  nuevos. Los usuarios nuevos de Better Auth conservan sus datos y volverán a
  tener acceso al restablecer ese modo, pero el puente no les concede acceso
  automáticamente. La cola local se conserva al perder la sesión.
- Retirar `TEST_AUTH_ENABLED`, `TEST_RESEND_URL` y cabeceras de pruebas en prod.
  El override de email y de IP de prueba es inerte con un origen no loopback.

## Prueba de NUEVA autenticación para #274

`POST /api/authentication-proof` requiere un principal admitido. Primero enviar
`{ "action": "send", "purpose": "local-pin-recovery" }`; después enviar
`{ "action": "verify", "purpose": "local-pin-recovery", "otp": "123456" }`.
Better Auth consume el código y crea una nueva sesión del mismo usuario. La
respuesta propaga su cookie y devuelve `proof`, válido cinco minutos, guardado
hasheado y ligado a usuario, sesión nueva y propósito. `consumeAuthenticationProof`
se usa únicamente desde el servidor, después de comprobar la sesión actual en
D1. Es de un solo uso: no es una edad de sesión, timestamp de token ni renovación.
La operación de PIN de #274 debe coordinar el consumo con su propio cambio para
que un fallo obligue a pedir una nueva prueba, sin permitir reutilizar una prueba
consumida. Esta issue no implementa el PIN ni el bloqueo local.

## Fuentes consultadas

- [Astro integration](https://better-auth.com/docs/integrations/astro),
  [Drizzle](https://better-auth.com/docs/adapters/drizzle).
- [Sesiones](https://better-auth.com/docs/concepts/session-management),
  [cuentas y vinculación](https://better-auth.com/docs/concepts/users-accounts),
  [rate limiting](https://better-auth.com/docs/concepts/rate-limit).
- [OTP](https://better-auth.com/docs/plugins/email-otp),
  [passkeys](https://better-auth.com/docs/plugins/passkey),
  [Google](https://better-auth.com/docs/authentication/google),
  [GitHub](https://better-auth.com/docs/authentication/github).
- [Resend/Workers](https://resend.com/docs/send-with-cloudflare-workers),
  [dominios](https://resend.com/docs/dashboard/domains/introduction),
  [precios](https://resend.com/pricing). Comprobados el 2026-10-06.
