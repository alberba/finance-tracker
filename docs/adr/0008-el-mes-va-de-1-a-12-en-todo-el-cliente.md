# El mes va de 1 a 12 en todo el cliente

El cliente contaba el mes de 0 a 11 (herencia de `Date`) mientras D1, los comandos de sync y el
dominio lo cuentan de 1 a 12, y la conversión ±1 vivía repartida por la frontera. Un desfase no
falla: un gasto de febrero acabaría en enero o marzo sin error visible.

Elegimos 1–12 en todo el cliente (`Transaction.month`, filtros, snapshots, presupuestos) en vez de
mantener 0–11 y centralizar la conversión: así la frontera con D1 deja de convertir. Los arrays de
12 posiciones (presupuestos, totales) siguen indexados desde 0 internamente, pero solo se acceden
mediante un único helper de índice, y `Date` es el otro único punto 0-based. La caché IndexedDB y la cola de comandos ya guardan 1–12, así que no se migran. El único estado
persistido con mes 0–11 es el blob de `localStorage` del modo demo: se descarta y se regenera desde
la semilla en vez de migrarlo.

El mes se modela como un tipo `Month` (1–12) que solo se obtiene validando con `asMonth(n)` en los
bordes (entrada del usuario, `Date`, filas de D1), de modo que un `month - 1` suelto o un `0` no
compilen.
