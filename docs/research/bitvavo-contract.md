# Validación del contrato contable de Bitvavo (#189)

Estado: **contrato fijado para la importación, con comisión cero asumida por decisión del usuario**.
El 2026-10-03 se consultó `/v2/account/history` para el intervalo UTC
2025-10-03 a 2026-10-04 (fin exclusivo) y se obtuvo una compra y una venta EUR con comisión.
Sus relaciones decimales exactas identifican precio unitario y flujos brutos en ambos lados.
No se ha contrastado el detalle con UI/CSV. Se pidió al propietario una clave exclusivamente de
lectura y la consulta tuvo éxito, pero los permisos concedidos no se inspeccionaron de forma
independiente. No se habilitó negociación ni retirada durante este trabajo.

Evidencia versionada:

- `tests/unit/fixtures/bitvavo-real-sanitized.json`: compra y venta reales con identificadores,
  fechas e importes saneados; incluye procedencia y límites de la verificación.
- `tests/unit/fixtures/bitvavo-zero-fee-assumed.json`: variantes **sintéticas** de compra y venta
  con `feesAmount: "0"` y `feesCurrency: "EUR"`, según el supuesto autorizado por el usuario.
  No hubo ninguna operación real sin comisión en esta cuenta durante el intervalo consultado.
- `tests/unit/fixtures/bitvavo-synthetic.json`: hipótesis alternativas para probar el análisis.

## Fuentes y alcance

- [Historial de cuenta](https://docs.bitvavo.com/docs/rest-api/get-transaction-history/):
  `/v2/account/history`, paginación `page`/`maxItems` y fechas en milisegundos.
- [Autenticación y permisos](https://docs.bitvavo.com/docs/rest-api/introduction/): firma HMAC-SHA256
  y separación entre lectura y negociación. La documentación exige negociación para los endpoints
  de órdenes/trades; aquí solo se consulta el historial de cuenta.

La descripción de `priceAmount` no determina inequívocamente si es precio unitario o total, y el
ejemplo publicado de una venta muestra EUR enviados y BTC recibidos. No se toma ese ejemplo como
evidencia contable. La conclusión se apoya en las dos respuestas reales y sus igualdades exactas.

Esta herramienta local de investigación no es el cliente de servidor de #190/#191. Ese cliente
deberá seguir ADR-0004 (Effect detrás de una frontera Promise).

## Captura local

1. En una cuenta normal, crea una clave con **solo lectura**, sin negociación ni retiradas.
   Anota localmente que verificaste los permisos y el tipo de cuenta; el script no puede comprobar
   los permisos concedidos a una clave. Usa compras y ventas existentes.
2. Crea un archivo privado fuera del repositorio, por ejemplo con `umask 077` y un editor local,
   que contenga estas variables (sustituye los marcadores dentro del editor):

   ```dotenv
   BITVAVO_API_KEY=tu_clave
   BITVAVO_API_SECRET=tu_secreto
   ```

3. Desde la raíz del repo, carga ese archivo con Node y consulta un intervalo corto que incluya
   una compra y una venta. `--to` es exclusivo; las fechas son medianoches UTC:

   ```sh
   node --env-file=/ruta/privada/bitvavo.env --import tsx scripts/bitvavo-contract.ts capture --from 2025-01-01 --to 2025-02-01
   ```

El resultado queda en `.scratch/bitvavo/capture.json`, ignorado por Git, con permisos 0600 y sin
sobrescribir archivos. Se conservan como máximo cuatro ejemplos: compra/venta con comisión y
compra/venta sin comisión. Solo se guardan los campos necesarios; direcciones y campos adicionales
se descartan. Los importes, fechas e identidades capturados siguen siendo privados. No compartas
ese archivo. Si necesitas repetir, mueve o elimina tu captura local anterior.

El script solo hace GET al historial, rechaza redirecciones, usa timeout y no imprime cuerpos de
error. Si falla por permisos, no los amplíes: registra el bloqueo para consultarlo con soporte.
Limita el intervalo si supera 100 páginas. Si no hay compra y venta, prueba otro intervalo.

## Contraste y saneado

Revisa localmente cada ejemplo contra su detalle en Bitvavo. `analysis.json`, también privado,
enumera las hipótesis matemáticas compatibles con cada ejemplo para ayudarte en el contraste.
Una coincidencia matemática no sustituye la comprobación del detalle real. Registra:

| Campo                                 | Compra                 | Venta                  |
| ------------------------------------- | ---------------------- | ---------------------- |
| `priceAmount` / `priceCurrency`       | Precio unitario, EUR   | Precio unitario, EUR   |
| `sentAmount` / `sentCurrency`         | Importe bruto, EUR     | Cantidad de cripto     |
| `receivedAmount` / `receivedCurrency` | Cantidad de cripto     | Importe bruto, EUR     |
| `feesAmount` / `feesCurrency`         | Comisión separada, EUR | Comisión separada, EUR |

Para cantidad `q`, precio unitario `p`, total bruto `G = q × p` y comisión EUR `f`, contrastamos
dos hipótesis por lado: flujo EUR bruto `G`, o flujo neto `G + f` en compra / `G - f` en venta.
Si `priceAmount` es total, `G = priceAmount`; si es unitario, `G = q × priceAmount`.
Las igualdades se evalúan con decimales, sin convertir a `number`. No se infiere el precio
dividiendo un flujo cuyo tratamiento de comisión no está confirmado.

Después de verificar la semántica, ejecuta sin credenciales:

```sh
pnpm exec tsx scripts/bitvavo-contract.ts sanitize --price-kind unit
```

Usa `total` si eso es lo confirmado. El saneado exige compra y venta, rechaza una elección que no
concuerde con los flujos y queda en `.scratch/bitvavo/sanitized.json`. Cambia ids y fechas y escala
cantidad, EUR y comisión por el mismo factor. Escala `priceAmount` solo cuando es total. Conserva
monedas y la representación de comisión cero. Es una transformación proporcional, no una garantía
de anonimato irreversible: revisa el resultado antes de compartirlo. El precio unitario se conserva.

El análisis devuelve todas las hipótesis compatibles. Con cantidad uno, o comisión cero, puede
haber varias: no elige arbitrariamente. Si hay redondeos que impiden la igualdad exacta, el resultado
es incompatible hasta documentar la regla de redondeo con evidencia. Si compra y venta usan distintas
semánticas de precio, el saneado conjunto fallará: registrar ese bloqueo antes de adaptar el contrato.

## Decisión contractual para #190

La operación conserva `priceAmount` directamente como precio unitario y `feesAmount` como comisión
EUR. La cantidad es `receivedAmount` en compra y `sentAmount` en venta; el símbolo es la moneda
cripto correspondiente. El importe bruto `G = q × p` debe coincidir exactamente con `sentAmount`
en compra y `receivedAmount` en venta. La comisión no está incluida en esos flujos.

El importe de caja previsto es `G + f` pagado en compra y `G - f` cobrado en venta. No se calcula
el precio dividiendo un flujo ni se incorpora la comisión al precio unitario. La futura importación
deberá aplicar la convención de signo del movimiento una sola vez sobre esos importes.
`src/scripts/investment-movements.ts` actualmente suma comisión a cantidad × precio para ambos
lados; #190 debe adaptar ese recorrido para las ventas antes de usarlo con este contrato.

`readValidatedOperation` en la herramienta expresa este mapeo con cadenas decimales y exige el
contrato fijado: precio unitario, flujo bruto y comisión EUR. Acepta comisión cero EUR sin volver
a inferir la semántica; tampoco rechaza cantidad uno por la ambigüedad del análisis exploratorio.
Rechaza flujos netos, precio total, moneda nula/ausente, divisas distintas e importes incoherentes.
`requireContract` sigue siendo un analizador de hipótesis: la ambigüedad de un ejemplo aislado no
invalida una operación que cumple el contrato ya establecido por los ejemplos reales.

La comisión cero es un **supuesto autorizado, no una observación remota ni una confirmación de
soporte**: `feesAmount: "0"`, `feesCurrency: "EUR"` (la moneda del precio). El usuario decidió
continuar con ese supuesto sin exigir una operación real o respuesta de soporte para este caso.
No se extiende a comisiones en cripto ni a moneda nula/ausente.

Los dos ejemplos cumplen las igualdades exactas, por lo que no se ha inventado una tolerancia ni
una regla de redondeo. Si otra respuesta no las cumple, se rechaza como incompatible y se investiga
con evidencia adicional antes de flexibilizar el contrato. Las pruebas fijan ambos lados y ejercitan
el supuesto de comisión cero de forma explícita. La UI/CSV y la inspección independiente de permisos
siguen sin verificarse; no se presentan como criterios comprobados ni se ha cerrado la issue en GitHub.

Verificación local de la herramienta:

```sh
pnpm exec vitest run --project unit tests/unit/bitvavo-contract.test.ts
```
