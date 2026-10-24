# Adjuntos existentes

## Preparar

Asociar cada fichero con el reporte donde el usuario lo menciona o pega; si es ambiguo, resolverlo antes de publicar ese adjunto. Cada acción lleva cero, uno o varios.

Comprobar que existen y son legibles, también fuera del repo y con espacios en la ruta (las imágenes pegadas viven en temporales). Si falta alguno, explicar cuál y decidir con el usuario entre publicar sin él o esperar.

Inspeccionar las imágenes y redactar un alt text breve de lo observado. Vídeos: usar el contexto conocido o el mecanismo de reproducción disponible; `gh` no les da alt text.

Comprobar `--attach` en `gh issue create --help` o `gh issue comment --help`. Si falta, dejar el texto preparado y explicar el impedimento antes de publicar con media.

## Publicar

Un `--attach <ruta>` por fichero, en el mismo comando que crea la issue o el comentario; para imágenes, `--attach '<ruta>#<alt>'`, con quoting seguro.

Para ubicar una imagen en una sección, escribir `![alt](<ruta>)` en el body y adjuntar esa misma ruta: `gh` la sustituye por la URL subida. Los adjuntos sin referencia se añaden al final.

Si falla una subida, conservar la URL devuelta, verificar qué adjuntos llegaron y aplicar la recuperación de «Publicar y verificar» antes de reintentar. Completar los faltantes en la issue existente con las operaciones de la ayuda de `gh`.
