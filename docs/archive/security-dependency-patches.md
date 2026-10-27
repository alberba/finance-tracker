# Parches de dependencias

## http-cache-semantics 4.2.0

La auditoría de producción detecta
[GHSA-ch52-4w7c-c8xp](https://github.com/advisories/GHSA-ch52-4w7c-c8xp).
A 3 de octubre de 2026 no hay una versión corregida publicada.

Aplicamos mediante `pnpm patchedDependencies` el cambio de `index.js` propuesto en la
[PR upstream #58](https://github.com/kornelski/http-cache-semantics/pull/58), obtenido del commit
`14a8c2ad51740dc39bf3e8f1a11c845a5003f217`. El parche distingue las restricciones de reutilización
de la caducidad normal e impide que `max-stale` reutilice respuestas privadas, con `no-cache`,
con `proxy-revalidate` o con cookies sin autorización explícita de caché compartida.

`tests/unit/http-cache-semantics.test.ts` carga la dependencia que utiliza Astro y verifica
esas restricciones, además de conservar la reutilización permitida de una respuesta pública
caducada. Los cuatro casos de restricción fallan sin el parche.

La excepción `auditConfig.ignoreGhsas` afecta únicamente a este aviso: la auditoría de npm
comprueba nombres y versiones, no el contenido de parches locales. El lockfile conserva
el hash del parche y CI instala con `--frozen-lockfile`; las pruebas comprueban el código
instalado. El resto de avisos y los umbrales de auditoría siguen activos.

Cuando upstream publique una versión corregida, actualizar la dependencia y retirar el parche,
su entrada en `patchedDependencies` y esta excepción. Mantener las pruebas de regresión.
