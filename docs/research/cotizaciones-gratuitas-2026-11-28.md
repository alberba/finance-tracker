# Cotizaciones gratuitas de símbolos — 2026-11-28

Pregunta: «Búscame una manera gratuita de poder trasladar la cotización de los símbolos».
Este documento amplía [investment-portfolio-data-2026-10-18](investment-portfolio-data-2026-10-18.md)
con los proveedores que aquella revisión no cubrió y con pruebas hechas hoy. No es asesoramiento legal:
las lecturas de términos de uso son literales y se marcan como interpretación cuando lo son.

## Resumen y recomendación

**Interpretación.** El código apunta a la lectura (a): llevar la cotización _a la app_ desde una
fuente gratuita. Stock Events no es una fuente de precios para finance-tracker: la app solo le
_envía_ listas, símbolos y operaciones (`src/lib/server/stockevents.ts`), y su API no tiene endpoint
de cotización. Las cotizaciones salen de Yahoo Finance mediante `yahoo-finance2`. La lectura (b),
llevar los datos a Stock Events sin pagar Pro, se cubre en su propio apartado. En resumen: Stock
Events calcula sus propios precios y solo necesita símbolos y operaciones. Eso puede entrar gratis
por importación CSV/Excel, con el límite de 15 valores del plan gratuito.

**Recomendación para (a):**

1. **Fuente principal: seguir con Yahoo (`yahoo-finance2`).** Es la única fuente gratuita y sin
   clave que cubre a la vez los cuatro tipos de instrumento de la app (`stock`, `etf`, `fund`,
   `crypto`), las bolsas europeas, los fondos con ISIN (vía identificadores Morningstar `0P…`) y la
   búsqueda por ISIN. Funciona hoy (pruebas abajo) y la librería se mantiene activamente. El riesgo
   no es técnico, sino de términos: Yahoo prohíbe la recogida automatizada sin permiso. Asumirlo
   solo para uso personal, sin redistribuir, con caché y pocas peticiones.
2. **Respaldo para acciones, ETF y fondos: EODHD gratuito**, como cierre diario y no como refresco
   cada 5 minutos. Tiene 20 llamadas al día, sufijos europeos documentados, fondos y búsqueda por
   ISIN en el plan gratuito, y sus términos permiten guardar y analizar los datos para uso personal.
   Con 20 llamadas al día solo da para un cierre diario de ≤20 instrumentos cuando Yahoo falle.
3. **Cripto: CoinGecko Demo**, que ya está integrado. Exige clave gratuita, da 100 llamadas por
   minuto y 10.000 al mes, y obliga a atribuir. Divisas: **Frankfurter** (BCE), sin clave ni cuotas.
4. **ISIN → ticker: OpenFIGI**, gratuito y sin clave (25 peticiones/min), con identificadores de
   dominio público. Sirve como ayuda para resolver símbolos. No da precios.
5. **Revisar el respaldo actual de Twelve Data.** El plan Basic se licencia como «Internal
   non-display usage» y declara 3 mercados. Mostrar esos precios en el panel no está claramente
   permitido, y tampoco consta que Basic cubra bolsas europeas (detalle abajo).

Ninguna fuente gratuita verificada sustituye a Yahoo con cobertura europea y de fondos, refresco
frecuente y sin clave. Todas las alternativas oficiales gratuitas fallan en al menos una de esas
condiciones: cuota diaria mínima, solo EE. UU., licencia sin visualización o prohibición de guardar
datos.

**Actualización tras la ampliación (más de 50 fuentes y 25 repos; ver
[Fuentes adicionales](#fuentes-adicionales) y [Repos de código abierto](#repos-de-código-abierto)):**

- **Novedad para fondos europeos por ISIN: Morningstar `lt.morningstar.com`.** Su endpoint
  `timeseries_price` acepta `idtype=ISIN` y `currencyId=EUR`, sin cookie ni registro. Usa una clave
  pública embebida en la URL (`klr5zyak8x`), la misma que la web de Morningstar y `mstarpy`. Probado
  hoy con fondos IE, LU y ES, con ETF y con acciones. Es el mejor **respaldo para fondos** que ha
  aparecido, y cubre justo el hueco de Yahoo con ISIN de fondos domésticos. Mismo tipo de riesgo
  que Yahoo: API no oficial, y los términos de Morningstar prohíben la extracción automatizada. Úsese
  como Yahoo: personal, con caché y poco volumen.
- **Resolver ISIN → tickers de Yahoo: `api.portfolio-performance.info/v1/search?isin=`**, el
  buscador público del proyecto Portfolio Performance. Sin clave, probado hoy. Devuelve los tickers
  de Yahoo por bolsa (`EUNL.DE`, `IWDA.AS`…). No resuelve fondos sin cotización y sus términos de uso
  por terceros no constan. OpenFIGI sigue siendo la opción con licencia clara.
- **Cripto sin clave:** Kraken, Bitvavo, Coinbase y Binance dan BTC-EUR con velas diarias, sin
  registro. Sirven de respaldo de CoinGecko si se quiere evitar la clave Demo. No se leyeron sus
  términos de datos.
- **Sin cambios en lo demás.** Ninguna API oficial gratuita nueva cubre fondos europeos.
  financialdata.net (300/día, Frankfurt, Euronext y Londres) es la más prometedora para acciones,
  pero exige clave y no consta BME. Ningún bróker (Trading 212, IBKR, Degiro…) ofrece precios
  gratis y sin cuenta. Ningún repo resuelve los fondos `0P…` con una fuente gratuita y estable:
  Portfolio Performance, Ghostfolio y Wealthfolio acaban en Yahoo, en una API de pago o en un
  «feed manual» configurable con URL y selector.
- **Recomendación revisada:** Yahoo como principal; Morningstar `lt` como respaldo de fondos (y
  posible segunda opinión de ETF y acciones); EODHD Free para el cierre diario con licencia; OpenFIGI
  o el buscador de PP para ISIN → ticker; CoinGecko o un exchange público para cripto. Los fondos
  sin dato en ninguna fuente, como `ES0165237019`, necesitan precio manual o la web de la gestora.

## Qué pide hoy la app

Leído del código en esta rama (`free-symbol-quotes-transfer`, base `ce6e57aa`):

| Necesidad                     | Dónde                                                           | Qué usa                                                                                                                                                                                                                                              |
| ----------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Precio actual por instrumento | `src/lib/server/market-data.ts` (`loadMarketQuote`)             | `yahooFinance.quote(símbolo)`: `regularMarketPrice`, `currency` (convierte `GBp`/`GBX` a GBP), `regularMarketPreviousClose`, `regularMarketChangePercent`, `regularMarketTime` y `exchangeDataDelayedBy`. Caché de 120 s y enfriamiento tras un 429. |
| Respaldo de precio            | mismo archivo                                                   | Si Yahoo da 429 o ≥500, pasa a `MARKET_DATA_PROVIDER` (`twelve-data` o `coingecko`) cuando hay clave. Si todo falla, conserva el último precio válido marcado `stale`.                                                                               |
| Refresco                      | `src/composables/useLiveQuotes.ts`, `src/stores/market.ts`      | Cada 5 min con la pestaña visible, y al cambiar los instrumentos. Mínimo 60 s entre refrescos no forzados.                                                                                                                                           |
| Búsqueda de símbolos          | `src/lib/server/market-search.ts`                               | `yahooFinance.search` (10 resultados). Respaldo en `api.twelvedata.com/symbol_search`. Devuelve símbolo, nombre, bolsa, divisa y tipo.                                                                                                               |
| Histórico                     | `src/lib/server/benchmark-history.ts`                           | `yahooFinance.chart(..., interval: '1mo')`: cierres mensuales de índices de referencia (`EUNL.DE`, `SXR8.DE`, `^IBEX`, `SXRV.DE`, `EXSA.DE`).                                                                                                        |
| Tipos de activo               | `src/scripts/types.ts`                                          | `InstrumentType = 'stock' \| 'etf' \| 'fund' \| 'crypto'`; `QuoteProvider = 'yahoo' \| 'twelve-data' \| 'coingecko'`.                                                                                                                                |
| Símbolo de cripto             | `src/domain/investment/symbol-matching.ts` (`yahooQuoteSymbol`) | `BTC` → `BTC-EUR`, porque en Yahoo el `BTC` a secas es otro valor.                                                                                                                                                                                   |
| Stock Events                  | `src/lib/server/stockevents.ts`, `src/stores/stockevents.ts`    | Solo escritura de listas, símbolos y operaciones. Valida símbolos con un alta y borrado de prueba. Un 403 significa «sin Pro».                                                                                                                       |

Volumen orientativo: 10 instrumentos con la app abierta 8 h generan unas 96 rondas × 10 ≈ 960
peticiones al día, menos lo que absorba la caché. Con esa cifra quedan descartadas como fuente
principal todas las cuotas diarias de 20–250 peticiones.

## Tabla comparativa

«UE» = Xetra, BME, Euronext o LSE. «—» = no verificado en fuente primaria.

| Fuente                     | Clave                 | Límite gratuito                                      | UE                                                                                | Fondos / ISIN                                                      | Histórico gratis                                 | Búsqueda             | Términos para uso personal self-hosted                           |
| -------------------------- | --------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------ | -------------------- | ---------------------------------------------------------------- |
| Yahoo (`yahoo-finance2`)   | No                    | Sin cuota publicada; 429 con `Retry-After`           | Sí (probado hoy: `.DE`, `.MC`, `.L`)                                              | Sí, fondos `0P…`; búsqueda por ISIN (probado)                      | Sí (`chart`)                                     | Sí                   | Prohíbe la recogida automatizada sin permiso; API no oficial     |
| EODHD (Free)               | Sí                    | 20/día, 20/min                                       | Sí (`XETRA`, `LSE`, `PA`; Madrid sin confirmar)                                   | Fondos sí; búsqueda por ISIN incluida en el plan gratuito          | 1 año EOD; precio actual con 15 min de retraso   | Sí                   | Uso personal: permite guardar y analizar; prohíbe redistribuir   |
| Twelve Data (Basic)        | Sí                    | 8/min, 800/día                                       | No consta: «Markets: 3»; «Real-time EU» solo en Pro                               | `isin` como parámetro en todos los planes; fondos «Market data» sí | `time_series`, hasta 5.000 puntos                | Sí, acepta ISIN      | «Internal non-display usage»; mostrar datos queda dudoso         |
| Alpha Vantage (Free)       | Sí                    | 25/día                                               | Ejemplos `.LON`, `.DEX`                                                           | —                                                                  | Diario `compact` (100 puntos); `full` es premium | Sí (`SYMBOL_SEARCH`) | Uso comercial requiere contactar con ventas; ToS en PDF no leído |
| Finnhub (Free)             | Sí                    | 60/min (según buscador)                              | LSE con 15 min de retraso; el resto solo EOD; Euronext/Xetra no constan en gratis | —                                                                  | —                                                | —                    | «strictly for personal use»; prohíbe redistribuir                |
| FMP (Free)                 | Sí                    | 250/día (según buscador)                             | No: solo bolsas de EE. UU.                                                        | —                                                                  | 5 años (según buscador)                          | —                    | — (403 al leer los términos)                                     |
| Tiingo (Starter)           | Sí                    | 50/h, 1.000/día, 500 símbolos/mes                    | No consta                                                                         | Valor liquidativo de fondos de EE. UU.; sin ISIN                   | 5 años                                           | Sí (beta)            | Prohíbe guardar datos de forma persistente en Starter            |
| Marketstack (Free)         | Sí                    | 100/mes                                              | «70 Stock Exchanges», sin nombrarlas                                              | —                                                                  | 1 año EOD                                        | `tickers?search=`    | «Non-Commercial Use»                                             |
| Massive (antes Polygon)    | Sí                    | No se encontró plan gratuito en la página de precios | Docs: «U.S. stock market data»                                                    | —                                                                  | —                                                | —                    | Personal y no comercial                                          |
| Stooq                      | —                     | —                                                    | —                                                                                 | —                                                                  | —                                                | —                    | Hoy bloquea las descargas con un reto JavaScript (probado)       |
| GOOGLEFINANCE (Sheets)     | Cuenta Google         | —                                                    | «does not support most international exchanges»                                   | Fondos no soportados                                               | No accesible vía API ni Apps Script              | No                   | No apto para uso profesional                                     |
| CoinGecko (Demo / keyless) | Demo: sí; keyless: no | Demo 100/min, 10.000/mes; keyless ~5/min             | n/a (cripto)                                                                      | n/a                                                                | Sí                                               | Sí                   | Atribución obligatoria; prohíbe revender o redistribuir          |
| Frankfurter                | No                    | Sin cuotas; limitado contra abusos                   | n/a (divisas BCE y otros bancos centrales)                                        | n/a                                                                | Sí                                               | n/a                  | Uso comercial permitido; caché libre                             |
| OpenFIGI                   | No (opcional)         | 25/min mapping sin clave, 250 con clave              | Sí (identificadores, no precios)                                                  | ISIN → ticker y bolsa (probado)                                    | n/a                                              | Sí                   | Identificadores en dominio público                               |

## Detalle por proveedor

### Yahoo Finance vía `yahoo-finance2` (actual)

- **Funciona hoy.** Pruebas con `curl` al endpoint `chart` (el mismo que usa `yahooFinance.chart`),
  sin cookie ni crumb:
  - `VWCE.DE`: EUR, `GER`, 165,46, hora de mercado 2026-11-27 16:35:52 UTC.
  - `SAN.MC`: EUR, `MCE`, 10,902, 2026-11-27 16:43:31 UTC.
  - `AAPL`: USD, `NMS`, 358,54, 2026-11-27 18:00:01 UTC.
  - Fondo `0P00000WLG.F` (Vanguard Global Stock Index € Acc): EUR, `FRA`, `MUTUALFUND`, 62,3372,
    2026-11-26 21:00 UTC. Valor liquidativo diario, como cabe esperar.
- **Búsqueda por ISIN.**
  - `IE00BK5BQT80` → `VWRA.L` (ETF, Londres) y `IE00BK5BQT80.SG` (Stuttgart).
  - `IE00B03HD191` → `0P00000WLG.F`.
  - `ES0165237019` (un fondo español elegido al azar) → sin resultados. Algunos fondos domésticos no
    aparecen.
- **`v7/finance/quote` sin crumb devuelve 401** («User is unable to access this feature»). Por eso la
  librería gestiona cookie y crumb. El endpoint `chart` no lo exige, lo que da un plan B dentro del
  mismo Yahoo si `quote` se rompe. Sigue sujeto a los mismos términos.
- **Mantenimiento.**
  - Última versión `v4.0.6`, publicada el 2026-11-08
    ([releases](https://github.com/gadicc/yahoo-finance2/releases); `gh api …/releases/latest`).
  - Último push al repositorio el 2026-11-24. No está archivado.
  - El tracker muestra incidencias automáticas «Yahoo API response drift» casi semanales, que se
    cierran con parches de esquema (#1054 del 2026-11-24, #1047, #1046…).
  - También 429 al pedir crumb: #977 (2025-12-31) y #982 (2026-01-21, «temporary Yahoo issue»), ambas
    cerradas.
  - Fuente: `gh issue list -R gadicc/yahoo-finance2`.
  - La app ya fija `^4.0.6` en `package.json`. Conviene actualizar con frecuencia, porque los parches
    de esquema son la forma habitual de arreglar roturas.
- **Avisos del propio proyecto.** «Yahoo does not provide any official API to developers, nor makes
  any guarantees regarding service availability» y «you use this package at your own risk»
  ([README](https://github.com/gadicc/yahoo-finance2)). Las notas de la v4.0.0 (2026-07-11) indican
  que el crumb, la cola y el debounce dejan de compartirse entre instancias. La app ya usa una única
  instancia compartida (`src/lib/server/yahoo-finance.ts`).
- **Términos de Yahoo**
  ([ToS EE. UU.](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html), igual en la
  [versión IE](https://legal.yahoo.com/ie/en/yahoo/terms/otos/index.html)):
  - Prohíben «access or collect data … from our Services using any automated means … for any purpose
    without our express, prior permission».
  - Prohíben el uso «for any commercial purpose».
  - Prohíben la «high volume activity» sin consentimiento.
  - No se encontró una excepción para uso personal. _Interpretación:_ el uso actual incumple la
    letra de los términos aunque sea personal. El riesgo práctico es el bloqueo, no un coste.

### EODHD (respaldo recomendado)

- Plan Free: 20 llamadas al día y 20 por minuto, 1 año de histórico EOD, precio actual con 15 min
  de retraso, sin intradía ([precios](https://eodhd.com/pricing)).
- Formato de símbolo «`SYMBOL.EXCHANGE` — for example AAPL.US, BP.LSE or SAP.XETRA»; también
  `AIR.PA`. «Mutual funds are covered too». Actualiza «2-3 hours after the market closes»
  ([EOD](https://eodhd.com/financial-apis/api-for-historical-data-and-volumes/)).
- Búsqueda: «a ticker symbol, a company name, or an ISIN», con filtro por `stock`, `etf`, `fund`,
  `index` y `crypto`. Incluida en el plan Free
  ([búsqueda](https://eodhd.com/financial-apis/search-api-for-stocks-etfs-mutual-funds/)).
- Términos: el usuario no profesional puede «store, manipulate, and analyze the data for private,
  non-commercial purposes». Prohíben redistribuir y compartir la cuenta
  ([términos](https://eodhd.com/financial-apis/terms-conditions),
  [personal frente a comercial](https://eodhd.com/financial-apis/commercial-vs-personal-license-use)).
- Advertencia propia: los precios no salen de los feeds de las bolsas («OTC, peer to peer trades»)
  y «not necessarily real-time nor accurate».
- **Sin verificar:** el sufijo de Madrid y que la clave gratuita resuelva fondos europeos con
  `0P`/ISIN. Hay que probarlo con una cuenta (no se registró ninguna).

### Twelve Data (respaldo configurado hoy)

- Basic: 8 créditos por minuto y 800 al día, $0. Marcado «Internal non-display usage», «Markets:
  3» y tiempo real para acciones y ETF de EE. UU., forex y cripto. «Real-time EU market data» y
  «Mutual funds NAV» aparecen en Pro. «Basic is not licensed for commercial use»
  ([precios](https://twelvedata.com/pricing)).
- Los términos definen «Non-Display Use» como «any use of Data that does not involve displaying the
  Data to natural persons» ([términos](https://twelvedata.com/terms)). _Interpretación:_ mostrar
  precios de Basic en el panel no encaja en esa licencia. El plan que añade «Internal display data
  access» es Grow.
- Técnicamente, `quote`, `time_series` y `symbol_search` aceptan `isin` en «all plans»
  ([quote](https://twelvedata.com/docs/market-data/quote),
  [symbol_search](https://twelvedata.com/docs/discovery/symbol-search)).
- **Sin verificar:** cuáles son los 3 mercados de Basic
  (`https://twelvedata.com/exchanges?level=basic`, no leída).

### Alpha Vantage

- Gratuito: «25 API requests per day», con clave ([soporte](https://www.alphavantage.co/support/),
  [premium](https://www.alphavantage.co/premium/)).
- `TIME_SERIES_DAILY` `full` es premium. `TIME_SERIES_DAILY_ADJUSTED` y el intradía también son
  premium.
- Los ejemplos incluyen `TSCO.LON` y `MBG.DEX` (Xetra)
  ([documentación](https://www.alphavantage.co/documentation/)).
- Con 25 llamadas al día no sirve ni como respaldo diario de una cartera mediana.
- **Sin verificar:** los términos, publicados en PDF y no leídos como texto, y el detalle de
  `GLOBAL_QUOTE` y `SYMBOL_SEARCH`.

### Finnhub

- Términos leídos: «All plan listed on Finnhub website is strictly for personal use», prohíben
  redistribuir y añaden «30 API calls/second limit on top of all plan's limit»
  ([términos](https://finnhub.io/terms-of-service)).
- Las páginas de precios y documentación no cargaron (contenido por JS y 429). **Sin verificar en
  fuente primaria:** un buscador resume [finnhub.io/pricing](https://finnhub.io/pricing) como
  60 llamadas/min gratis, LSE con 15 min de retraso y el resto de mercados internacionales solo EOD,
  con Euronext/Xetra en blanco en la columna gratuita. Insuficiente para fondos europeos.

### Financial Modeling Prep

- Las tres páginas oficiales devolvieron 403 al lector. **Sin verificar en fuente primaria:**
  páginas del propio FMP ([FAQ](https://site.financialmodelingprep.com/faqs),
  [guía del plan gratuito](https://site.financialmodelingprep.com/how-to/how-to-sign-up-and-use-a-free-stock-market-data-api))
  indican 250 peticiones al día, solo bolsas de EE. UU. y 5 años de histórico. Descartado por
  cobertura.

### Tiingo

- Starter gratuito: 50 peticiones por hora, 1.000 al día, 500 símbolos al mes y 5 años de histórico.
  Licencia «Internal Use Only … you may not display or share the data with another person»
  ([precios](https://www.tiingo.com/about/pricing)).
- Los términos (actualizados el 2026-11-05) prohíben en Starter «write, save, archive … Tiingo Data
  in any persistent or durable storage» ([ToS](https://www.tiingo.com/tos)). Choca con
  `state.quotes`, que la app sincroniza y persiste.
- Símbolos con guion (`BRK-A`). Búsqueda en beta, sin ISIN
  ([búsqueda](https://www.tiingo.com/documentation/utilities/search)).
- Cobertura europea no declarada: solo «US & Chinese Stocks» y «ETFs & Mutual Funds». Descartado.

### Marketstack

- Gratuito: «100 Requests / mo», EOD, 1 año de histórico, «Non-Commercial Use»
  ([precios](https://marketstack.com/pricing)). La v1 es legacy y v2 no se leyó
  ([docs v1](https://docs.apilayer.com/marketstack/docs/api-endpoints-v1/)).
- 100 al mes no da ni para un cierre diario de 4 instrumentos. Descartado.

### Massive (antes Polygon.io)

- La [página de precios](https://massive.com/pricing) no muestra plan gratuito. Las docs de
  acciones dicen «REST endpoints for U.S. stock market data»
  ([docs](https://massive.com/docs/rest/stocks)).
- Los [términos para particulares](https://massive.com/legal/individuals-terms-of-service) mencionan
  «free and paid individual plans» sin detallarlos. **Sin verificar:** el plan «Stocks Basic» y su
  límite de 5 llamadas/min. Descartado por cobertura (EE. UU.).

### Stooq

- Probado hoy: `https://stooq.com/q/d/l/?s=aapl.us&i=d` devuelve una página con un reto de
  prueba de trabajo en JavaScript («This site requires JavaScript to verify your browser»), no el
  CSV. `q/l/` devuelve 404.
- Las páginas de ayuda no se pudieron leer (cuerpo vacío para el lector). Descartado: no es
  automatizable sin saltarse una protección anti-bots.

### GOOGLEFINANCE (Google Sheets)

- «does not support most international exchanges», «Mutual fund attributes are currently not
  supported», «Historical data cannot be downloaded or accessed via the Sheets API or Apps Script»
  ([ayuda](https://support.google.com/docs/answer/3093281)). Descartado.

### CoinGecko (cripto)

- Demo: 100 llamadas por minuto y 10.000 al mes, con clave y «Attribution required»
  ([precios](https://www.coingecko.com/en/api/pricing)).
- Keyless: «~5 calls/min (dynamic …)», «not recommended for production»
  ([keyless](https://docs.coingecko.com/docs/keyless-public-api)).
- Términos: mostrar «Powered by Coingecko», no redistribuir, refrescar la caché al menos cada 24 h
  ([términos](https://www.coingecko.com/en/api_terms)).
- Probado hoy sin clave: `simple/price?ids=bitcoin&vs_currencies=eur` → 200,
  `{"bitcoin":{"eur":54049,"last_updated_at":…}}`.
- _Nota de código:_ la app ya usa Demo (`x-cg-demo-api-key`). Hay que comprobar que la UI muestra la
  atribución cuando la fuente es CoinGecko (no verificado en esta investigación).

### Frankfurter y BCE (divisas)

- «No API key required», «There are no quotas», uso comercial permitido y caché libre. Tipos de
  referencia de 112 bancos centrales, BCE incluido; se puede autoalojar con Docker
  ([frankfurter.dev](https://frankfurter.dev)).
- Probado hoy: `https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD,GBP` →
  `{"date":"2026-11-27","rates":{"GBP":0.83504,"USD":1.0957}}`. El dominio antiguo
  `api.frankfurter.app` responde 301.
- Alternativa directa del BCE, probada sin clave:
  `data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?lastNObservations=1&format=csvdata` →
  1,0957 el 2026-11-27. Su página de ayuda dio 503. Reutilización con cita del BCE según el
  [aviso legal](https://www.ecb.europa.eu/services/disclaimer/html/index.en.html) (leído solo en
  resumen).

### OpenFIGI (ISIN → ticker)

- «free and open to the public». Sin clave: 25 peticiones/min y 10 trabajos por petición en
  `/v3/mapping`. Con clave gratuita: 250/min
  ([documentación](https://www.openfigi.com/api/documentation)). Identificadores dedicados «to the
  public domain» ([términos](https://www.openfigi.com/docs/terms-of-service)).
- Probado hoy: `IE00BK5BQT80` → `VWRA`/`VWRP` (`exchCode` `LN`) y `VWCE` (`GR`).
- Requiere traducir `exchCode` al sufijo de Yahoo (`GR` → `.DE`, `LN` → `.L`, …). No cubre los
  identificadores `0P…` de fondos de Yahoo/Morningstar.

## Fuentes adicionales

Ampliación del mismo día. Las pruebas con `curl` se hicieron el 2026-11-28 sin cuentas ni claves,
con un `User-Agent` de navegador cuando hizo falta. ISIN de prueba: `IE00B4L5Y983` (iShares Core
MSCI World), `IE00B03HD191` (Vanguard Global Stock Index), `LU0996182563` (Amundi Index MSCI World),
`ES0165237019` (fondo español de Mutuactivos) y `ES0113900J37` (Santander). «—» = no verificado.

### Tabla: webs europeas de fondos, ETF y bolsas (endpoints no oficiales)

| Fuente                     | Endpoint                                                                                 | Sin clave ni cookie          | Fondos por ISIN                        | ETF y acciones UE          | Probado hoy                                                   | Términos                                  |
| -------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------- | -------------------------- | ------------------------------------------------------------- | ----------------------------------------- |
| **Morningstar `lt`**       | `lt.morningstar.com/api/rest.svc/timeseries_price/klr5zyak8x`                            | Sí (clave pública en la URL) | **Sí** (IE, LU, ES); no `ES0165237019` | Sí                         | OK: serie diaria en EUR hasta el 2026-11-27                   | Prohíbe la extracción automatizada        |
| Morningstar `global`/`www` | `/api/v2/search`, `us-api…/chartservice`                                                 | No                           | —                                      | —                          | 202 (reto WAF) o 401                                          | Igual                                     |
| justETF                    | `www.justetf.com/api/etfs/{ISIN}/quote` y `/performance-chart`                           | Sí                           | No (`latestQuote: null`)               | Solo ETF                   | OK: 127,04 EUR (Xetra) el 2026-11-27                          | — (PDF no legible)                        |
| Euronext live              | `live.euronext.com/en/ajax/AwlHistoricalPrice/getFullDownloadAjax/{ISIN}-{MIC}`          | Sí                           | No                                     | Solo cotizados en Euronext | OK: CSV OHLC                                                  | Prohíbe robots y recuperación sistemática |
| Tradegate                  | `www.tradegate.de/refresh.php?isin={ISIN}`                                               | Sí                           | No                                     | Sí                         | OK: último, bid/ask y cierre; sin fecha                       | —                                         |
| Lang & Schwarz             | `www.ls-tc.de/_rpc/json/…/instrument/search/main` y `…/chart/dataForInstrument`          | Sí                           | No                                     | Sí                         | OK: histórico del ETF desde 2014                              | —                                         |
| Börse Frankfurt            | `api.boerse-frankfurt.de/v1/data/price_information?isin=&mic=XETR`                       | Sí (el histórico pide firma) | No                                     | Sí                         | Parcial: precio en vivo por SSE; `price_history` vacío        | —                                         |
| Onvista                    | `api.onvista.de/api/v1/instruments/search/facet?searchValue={ISIN}`                      | Búsqueda sí; histórico 403   | Búsqueda sí; no `ES0165237019`         | Sí                         | Parcial                                                       | Prohíbe la consulta automatizada          |
| Financial Times            | `markets.ft.com/data/funds/tearsheet/summary?s={ISIN}:EUR`; `searchapi/searchsecurities` | Sí                           | Si FT lo tiene (HTML)                  | Sí                         | Parcial: 63,45 EUR para `IE00B03HD191`; sin JSON de histórico | — (bloqueado al lector)                   |
| Quefondos                  | `www.quefondos.com/es/fondos/ficha/index.html?isin={ISIN}`                               | Sí                           | Fondos españoles (HTML)                | No                         | OK pero desfasado (VL del 14/07/2026)                         | —                                         |
| CNMV                       | `cnmv.es/portal/Consultas/IIC/Fondo?nif={ISIN}`                                          | —                            | En teoría                              | No                         | 400 desde `curl`                                              | —                                         |
| BME                        | `apiweb.bolsasymercados.es/Market/…` (SPA)                                               | —                            | —                                      | —                          | No probado                                                    | —                                         |
| Ariva                      | `ariva.de/quote/historic/historic.csv`                                                   | No                           | —                                      | —                          | Redirige a login                                              | —                                         |
| Investing.com              | `api.investing.com/api/search/v2/search`                                                 | No                           | —                                      | —                          | 403 (Cloudflare)                                              | —                                         |
| WSJ / MarketWatch          | `wsj.com/market-data/quotes/…/historical-prices/download`                                | No                           | —                                      | —                          | Reto anti-bot JavaScript                                      | —                                         |
| Finect                     | —                                                                                        | —                            | —                                      | —                          | Solo HTML; sin API JSON                                       | —                                         |

No se probaron finanzen.net, Borsa Italiana, Inversis, Openbank ni MyInvestor. No se encontró
ningún endpoint público de precios en estos tres últimos.

### Tabla: APIs con plan gratuito

| Fuente                          | Clave                       | Límite gratis                      | UE                                             | Fondos / ISIN                   | Histórico gratis             | Términos para uso personal                       |
| ------------------------------- | --------------------------- | ---------------------------------- | ---------------------------------------------- | ------------------------------- | ---------------------------- | ------------------------------------------------ |
| financialdata.net               | Sí                          | 300/día                            | Londres, Frankfurt, Euronext París y Ámsterdam | ISIN solo en Standard (de pago) | 20+ años (acciones)          | Uso personal o comercial; prohíbe el scraping    |
| StockData.org                   | Sí                          | 100/día                            | «70+ mercados» sin lista                       | No documentado                  | 1 mes                        | — (términos 404)                                 |
| MarketData.app                  | Sí (AAPL sin token)         | 100 créditos/día                   | No (SAN.MC 401)                                | Fondos de EE. UU.               | 1 año, 24 h de retraso       | «Internal Use»; no redistribuir                  |
| API Ninjas                      | Sí                          | 3.000/mes, 100/h                   | Sufijos `.L` y otros                           | —                               | Premium                      | Solo «evaluación y demos»; sin caché; atribución |
| Mboum                           | Sí                          | 500/mes                            | —                                              | —                               | —                            | No redistribuir; borrar al cancelar              |
| RapidAPI (wrappers de Yahoo)    | Sí                          | «Basic» gratis sin cifras visibles | —                                              | —                               | —                            | — (mismo origen que Yahoo)                       |
| Alpaca                          | Acciones sí; cripto no      | 200/min                            | No (solo IEX, EE. UU.)                         | No                              | Acciones con 15 min de corte | —                                                |
| Tiingo (endpoint IEX)           | Sí                          | Starter: 50/h, 1.000/día           | —                                              | —                               | —                            | «Internal Use Only» (ver Tiingo arriba)          |
| Nasdaq Data Link                | Sí                          | 50.000/día (según buscador)        | —                                              | No                              | WIKI congelado desde 2018    | —                                                |
| IEX Cloud                       | n/a                         | Cerró el 2024-08-31                | n/a                                            | n/a                             | n/a                          | n/a                                              |
| IEX Exchange (HIST/DEEP)        | No                          | Sin acciones gratis; solo opciones | No                                             | No                              | —                            | —                                                |
| Tradier                         | Sí                          | Requiere cuenta de bróker          | No                                             | No                              | —                            | —                                                |
| Intrinio                        | Sí                          | Sin plan gratis (solo prueba)      | No                                             | —                               | —                            | Individual: personal, sin redistribuir           |
| Barchart OnDemand               | Sí                          | —                                  | —                                              | —                               | —                            | —                                                |
| Morningstar Direct Web Services | OAuth2                      | Sin plan gratis constatado         | —                                              | —                               | —                            | —                                                |
| api.nasdaq.com (no oficial)     | No                          | —                                  | No («Symbol not exists»)                       | No                              | —                            | —                                                |
| Fintual                         | Lista pública; resto Bearer | —                                  | No (fondos chilenos)                           | Sin ISIN                        | Con token                    | —                                                |

### Tabla: cripto, divisas y bancos centrales

| Fuente                   | Clave         | Límite gratis                              | Cobertura                             | Histórico        | Términos                                             | Probado hoy              |
| ------------------------ | ------------- | ------------------------------------------ | ------------------------------------- | ---------------- | ---------------------------------------------------- | ------------------------ |
| Kraken                   | No            | Por IP; cifra no publicada                 | `XBTEUR` y demás                      | OHLC diario      | —                                                    | 200, bid 54.149,3        |
| Bitvavo                  | No            | Cabecera `bitvavo-ratelimit-limit: 1000`   | Mercados `X-EUR`                      | Velas            | —                                                    | 200, 54.174              |
| Coinbase Exchange / v2   | No            | 10 req/s por IP (Exchange)                 | `BTC-EUR`                             | Velas (Exchange) | —                                                    | 200, 54.167,21           |
| Binance                  | No            | Peso por IP                                | `BTCEUR`                              | Klines           | —                                                    | 200, 54.044,77           |
| CoinPaprika              | No            | —                                          | Cotiza en EUR                         | Diario           | —                                                    | 200, 54.081,6            |
| Bitpanda (`/v1/ticker`)  | No (hoy)      | `max-age=60`                               | Cripto y metales; sin acciones ni ETF | No               | API legacy se apaga el 2027-01-31                    | 200, 54.180,50           |
| Alpaca cripto            | No            | —                                          | Pares en USD                          | Barras diarias   | —                                                    | 200                      |
| CoinMarketCap Basic      | Sí            | 15.000 créditos/mes, 50/min                | Cripto                                | Diario 1 año     | Licencia comercial para un producto; no redistribuir | 401 sin clave            |
| CoinCap                  | Sí (v3)       | —                                          | —                                     | —                | —                                                    | v3 401; v2 sin DNS       |
| CryptoCompare / CoinDesk | Sí            | —                                          | —                                     | —                | —                                                    | 401 «API key required»   |
| open.er-api.com          | No            | 1 actualización al día; 429 bloquea 20 min | ~160 divisas                          | No               | Personal y comercial; atribución; no redistribuir    | 200                      |
| fawazahmed0/exchange-api | No            | «No rate limits»                           | 200+ divisas, cripto y metales        | Por fecha        | CC0                                                  | 200, fecha 2026-11-27    |
| Banco de España          | No            | —                                          | Tipos BCE (`DTCCBCE*EUR.B`)           | Completo         | Libre citando la fuente                              | CSV y JSON 200           |
| FRED                     | Sí (gratis)   | —                                          | Series de EE. UU. y macro             | Largo            | Series de terceros solo para uso personal            | 400 sin clave            |
| exchangerate.host        | Sí (apilayer) | —                                          | —                                     | —                | —                                                    | 401 `missing_access_key` |

### Tabla: brókeres con API

| Bróker              | API                                 | Precios de mercado                                                      | Notas                                                   |
| ------------------- | ----------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------- |
| Trading 212         | Oficial (beta), clave y secreto     | No: solo cartera, pedidos, metadatos de instrumentos e historial        | Solo cuentas Invest y Stocks ISA                        |
| Interactive Brokers | Oficial (Web API / TWS), con cuenta | Retrasados gratis; 100 snapshots en tiempo real al mes (según buscador) | Requiere el gateway en marcha y sesión                  |
| Degiro              | No oficial (`degiro-connector`)     | Sí (con tus credenciales)                                               | Riesgo de términos no verificado                        |
| eToro               | Oficial, `x-api-key` + `x-user-key` | Velas y snapshots                                                       | Claves desde la cuenta; precio y términos sin verificar |
| Scalable Capital    | No hay API pública                  | —                                                                       | Fuente secundaria                                       |
| Lightyear           | No hay API pública (sin verificar)  | —                                                                       | `api.lightyear.com` 403                                 |

## Detalle de las fuentes adicionales

### Morningstar `lt.morningstar.com` (mejor vía gratuita para fondos por ISIN)

- **Serie de precios por ISIN, sin resolver antes el `0P…`.** Probado hoy:

  ```sh
  curl -sS -A 'Mozilla/5.0' "https://lt.morningstar.com/api/rest.svc/timeseries_price/klr5zyak8x?id=IE00B03HD191&idtype=ISIN&currencyId=EUR&frequency=daily&startDate=2026-11-24&endDate=2026-11-28&outputType=COMPACTJSON"
  # [[1795478400000, 62.369],[1795564800000, 62.257],[1795651200000, 62.337],[1795737600000, 63.446]]
  ```

  - Respuesta `[[epoch_ms, precio], …]`. `outputType=CSV` devuelve `"date";"price"`.
  - `IE00B03HD191`: 63,446 EUR el 2026-11-27. El 62,337 del 26/11 coincide con el 62,3372 que da
    Yahoo para `0P00000WLG.F`.
  - `LU0996182563`: 420,23 (26/11). `IE00B4L5Y983`: 127,182. `ES0114105036` (otro fondo español):
    5.435,921 (26/11). Cubre fondos españoles.
  - `ES0113900J37`: 10,842 el 27/11, frente a 10,902 en Yahoo `SAN.MC`. La serie incluye un 9,985
    el 25/11. Para acciones, Yahoo es más fiable. _Interpretación:_ Morningstar mezcla centros de
    negociación o cierres.
  - Sin `currencyId=EUR` devuelve la divisa base de la clase (GBP en el fondo de Vanguard).

- **Metadatos y `SecId`.** `…/klr5zyak8x/security_details/{ISIN}?viewId=MFsnapshot&idtype=ISIN&responseViewFormat=json&currencyId=EUR`
  devuelve `Id` (`0P…`/`F0…`), nombre, ISIN y `LastPrice {Date, Value, Currency}`. Pesa entre 0,17
  y 0,76 MB; para el precio basta la serie. En `NetAssetValues`, `DayEndValue` es el patrimonio, no
  el valor liquidativo.
- **`ES0165237019` devuelve `[]`** aquí, en Onvista y en justETF. Quefondos solo tiene un VL del
  2026-07-14. _Interpretación:_ clase sin datos públicos recientes. Necesita precio manual.
- **Clave pública.** `klr5zyak8x` está embebida en la web de Morningstar y en `mstarpy`
  ([`security.py`](https://github.com/Mael-J/mstarpy/blob/master/mstarpy/security.py)). No es una
  API documentada y puede cambiar sin aviso.
- **Lo que no funciona sin navegador:** `global.morningstar.com` y `www.morningstar.com/api/v2/search`
  devuelven 202 con reto WAF. El `chartservice` de `us-api.morningstar.com` responde 401.
  `tools.morningstar.es` no resuelve desde `curl`.
- **Términos** (leídos solo como fragmento de buscador; la página dio 403 al lector):
  - [Europa](https://global.morningstar.com/en-eu/policies/terms-use): prohíbe «unauthorized
    crawling, scraping, or any automated or systematic data extraction methods».
  - [EE. UU.](https://www.morningstar.com/user-agreement): «only for your own personal,
    noncommercial use».
  - _Interpretación:_ mismo encaje que Yahoo. Uso personal, con caché y poco volumen; riesgo de
    bloqueo, sin licencia.

### justETF

- Cotización: `https://www.justetf.com/api/etfs/IE00B4L5Y983/quote?locale=en&currency=EUR&isin=IE00B4L5Y983`
  → `latestQuote.raw` 127,04, `latestQuoteDate` 2026-11-27, `quoteTradingVenue` XETRA.
- Histórico: `/api/etfs/{ISIN}/performance-chart?locale=en&currency=EUR&valuesType=MARKET_VALUE&dateFrom=…&dateTo=…`
  devuelve `series: [{date, value: {raw}}]`. Lo usa
  [`justetf-scraping`](https://github.com/druzsan/justetf-scraping).
- Solo ETF: para los tres fondos devuelve `latestQuote: null`.
- **Términos sin verificar.** `/en/terms-of-use.html` da 404 y el
  [PDF de condiciones](https://www.justetf.com/documents/justETF_general_terms_and_conditions.pdf)
  no se pudo leer como texto.

### Euronext live

- `curl -A 'Mozilla/5.0' "https://live.euronext.com/en/ajax/AwlHistoricalPrice/getFullDownloadAjax/FR0000120271-XPAR?format=csv&decimal_separator=.&date_form=d/m/Y&startdate=2026-11-20&enddate=2026-11-27"`
  → CSV `Date;Open;High;Low;Last;Close;…`, con cierre 78,56 el 27/11. Funciona sin cookie.
- Solo instrumentos de Euronext (París, Ámsterdam, Bruselas, Lisboa, Milán, Dublín, Oslo).
- [Términos](https://www.euronext.com/en/terms-use): prohíben «spiders, robots, avatars, agents»
  y la «systematic retrieval to create collections … databases»; uso «personal, non-commercial».

### Tradegate, Lang & Schwarz y Börse Frankfurt

- **Tradegate.** `https://www.tradegate.de/refresh.php?isin=IE00B4L5Y983` → `last` 127,56, `close`
  126,07, bid y ask, sin fecha. Los fondos devuelven `"0,00"`. Términos sin leer.
- **Lang & Schwarz.** Búsqueda en `https://www.ls-tc.de/_rpc/json/.lstc/instrument/search/main?q={ISIN}&localeId=2`
  (`instrumentId` 44039 para el ETF). Histórico en
  `…/_rpc/json/instrument/chart/dataForInstrument?instrumentId=44039&marketId=1&quotetype=mid&series=history`,
  desde 2014. No encuentra fondos. Términos sin leer.
- **Börse Frankfurt.** `https://api.boerse-frankfurt.de/v1/data/price_information?isin=IE00B4L5Y983&mic=XETR`
  responde por SSE con `lastPrice` 127,5 EUR; el stream queda abierto (una llamada tardó 25 s).
  `price_history` y `global_search` devuelven `{}` sin las cabeceras firmadas (`X-Security`,
  `X-Client-TraceId`). Wealthfolio usa otro host, `api.live.deutsche-boerse.com/v1`, para acciones y
  bonos (ver repos). Términos sin leer.

### Onvista

- Búsqueda: `https://api.onvista.de/api/v1/instruments/search/facet?searchValue=LU0996182563` →
  FUND 69399357. Encuentra `IE00B03HD191`, el ETF y Santander; no `ES0165237019`.
- `/instruments/FUND/{id}/chart_history` devuelve 403 con enlace a las condiciones.
- [AGB](https://www.onvista.de/agb), 3.3: «Eine automatisierte Abfrage des … Content … ist … ohne
  ausdrückliche schriftliche Einwilligung von onvista in jeglicher Form unzulässig». Descartado.

### Financial Times, Quefondos, CNMV y resto de webs

- **FT.** `https://markets.ft.com/data/searchapi/searchsecurities?query=ES0113900J37` → `SAN:MCE`. Con
  `IE00B4L5Y983` → `IWDA:LSE:USD`. Las fichas HTML dan precio (63,45 EUR para
  `IE00B03HD191:EUR`). No se encontró un JSON de históricos (`get-historical-prices` devolvió
  vacío). Términos no leídos (bloqueo al lector). Útil como comprobación manual.
- **Quefondos.** Ficha HTML por ISIN de fondos españoles. Para `ES0165237019` da 39,79 EUR del
  2026-07-14. HTML frágil y datos desfasados. Términos no leídos.
- **CNMV.** La ficha por ISIN respondió 400 a `curl`. **Sin verificar** si publica el valor
  liquidativo diario en un fichero o API; solo se constató que publica informes periódicos.
- **BME.** La web de fondos es una SPA sobre `apiweb.bolsasymercados.es/Market/` y
  `webapp.api.es.six-group.com`. No probado.
- **Ariva** (redirige a login), **Investing.com** (403, Cloudflare; por eso `investpy` dejó de
  funcionar), **WSJ/MarketWatch** (reto JavaScript) y **Finect** (sin API JSON): descartados.

### financialdata.net

- Free: 300 peticiones al día con clave (`?key=`); incluye listas de símbolos y precios de
  acciones ([precios](https://financialdata.net/pricing),
  [docs](https://financialdata.net/documentation)).
- Declara Londres, Frankfurt y Euronext París y Ámsterdam; no nombra Xetra ni BME. El endpoint por
  ISIN es del plan Standard.
- [Términos](https://financialdata.net/terms-of-service): uso personal o comercial; prohíben el
  scraping; no dicen nada de guardar datos.
- **Sin verificar:** `SAN.MC` y fondos. Requiere probar con una clave.

### StockData.org, MarketData.app, API Ninjas y Mboum

- **StockData.org:** 100 al día y 1 mes de histórico ([precios](https://www.stockdata.org/pricing));
  búsqueda de entidades en todos los planes ([docs](https://www.stockdata.org/documentation)).
  «70+ mercados» sin lista; términos 404.
- **MarketData.app:** 100 créditos al día, 1 año de velas, datos con 24 h de retraso, licencia
  «Internal Use» ([precios](https://www.marketdata.app/pricing/),
  [términos](https://www.marketdata.app/terms/)). AAPL responde sin token; `SAN.MC` da 401.
- **API Ninjas:** 3.000 al mes y 100 a la hora, «solo evaluación y demos», sin caché y con
  atribución ([precios](https://api-ninjas.com/pricing)). `/v1/stockprice` solo da el último cierre
  ([API](https://api-ninjas.com/api/stockprice)); [términos](https://api-ninjas.com/terms) 3.1: uso
  personal no comercial. Descartado por prohibir caché.
- **Mboum:** 500 al mes ([precios](https://mboum.com/pricing)); exige borrar los datos al cancelar
  ([FAQ](https://mboum.com/pages/faq)). Descartado por cuota.

### RapidAPI (wrappers de Yahoo)

- [apidojo/yahoo-finance1](https://rapidapi.com/apidojo/api/yahoo-finance1/pricing) y
  [sparior/yahoo-finance15](https://rapidapi.com/sparior/api/yahoo-finance15/pricing) muestran un
  «Basic» gratuito sin cifras visibles al lector. Son intermediarios de Yahoo: mismo origen y
  mismos términos de fondo, con una cuota añadida. Ghostfolio solo usa RapidAPI para el índice
  Fear & Greed. Descartado.

### Alpaca, Tradier, Intrinio, Barchart, IEX y Nasdaq

- **Alpaca:** Basic gratis con acciones solo del feed IEX, 200 llamadas/min e histórico limitado a
  hace más de 15 min ([docs](https://docs.alpaca.markets/docs/about-market-data-api)). Cripto sin
  clave, probado: `https://data.alpaca.markets/v1beta3/crypto/us/latest/quotes?symbols=BTC/USD` → 200
  ([cripto](https://docs.alpaca.markets/docs/crypto-pricing-data)). Sin Europa.
- **Tradier:** exige cuenta de bróker (fuentes secundarias; docs 404 al lector). Sin token:
  «Invalid access token». Descartado.
- **Intrinio:** sin plan gratis, solo prueba; Individual a 150 USD/mes y solo EE. UU.
  ([precios](https://intrinio.com/pricing)). Descartado.
- **Barchart OnDemand:** la página de [API gratuita](https://www.barchart.com/ondemand/free-market-data-api)
  no cargó. **Sin verificar.**
- **IEX:** IEX Cloud cerró el 2024-08-31
  ([análisis de Alpha Vantage](https://www.alphavantage.co/iexcloud_shutdown_analysis_and_migration/)).
  IEX Exchange no ofrece acciones gratis; solo opciones
  ([productos](https://www.iex.io/products/market-data-connectivity)).
- **Nasdaq Data Link:** límites con clave de 50.000 al día según un fragmento de
  [rate limits](https://docs.data.nasdaq.com/docs/rate-limits) (la página redirige a 404). WIKI
  está congelado desde 2018 (fuentes secundarias). No se confirmó qué datasets europeos quedan.
  `api.nasdaq.com` (no oficial) da AAPL sin clave, pero «Symbol not exists» para `SAN.MC` e IWDA.
- **Morningstar Direct Web Services:** OAuth2, para empresas
  ([nota de prensa](https://newsroom.morningstar.com/news/news-details/2023/Morningstar-Direct-Web-Services-Brings-Sophisticated-Investment-Data-Research-and-Calculation-APIs-to-Power-Firms-Digital-Platforms/default.aspx)).
  Sin plan gratis constatado.
- **Fintual:** `https://fintual.cl/api/conceptual_assets` es público (unos 4.665 activos), pero son
  fondos chilenos; el histórico pide Bearer. Descartado.

### Cripto sin clave

- **Kraken:** `https://api.kraken.com/0/public/Ticker?pair=XBTEUR` (clave `XXBTZEUR`) y
  `…/OHLC?pair=XBTEUR&interval=1440`. Los [límites](https://docs.kraken.com/api/docs/guides/spot-rest-ratelimits)
  documentados son de la API con clave.
- **Bitvavo:** `https://api.bitvavo.com/v2/ticker/price?market=BTC-EUR` →
  `{"market":"BTC-EUR","price":"54174"}`; velas en `/v2/BTC-EUR/candles?interval=1d`. Las
  [docs](https://docs.bitvavo.com/) no confirmaron límites ni términos.
- **Coinbase:** `https://api.exchange.coinbase.com/products/BTC-EUR/ticker` (10 req/s por IP,
  [límites](https://docs.cdp.coinbase.com/exchange/introduction/rate-limits-overview)) y
  `https://api.coinbase.com/v2/prices/BTC-EUR/spot`, sin autenticación
  ([precios](https://docs.cdp.coinbase.com/coinbase-app/track-apis/prices)).
- **Binance:** `https://api.binance.com/api/v3/ticker/price?symbol=BTCEUR` y el espejo solo de
  datos `data-api.binance.vision`
  ([FAQ](https://developers.binance.com/docs/binance-spot-api-docs/faqs/market_data_only)).
  Términos no leídos.
- **CoinPaprika:** `https://api.coinpaprika.com/v1/tickers/btc-bitcoin?quotes=EUR` y `/historical`
  diario. Las [docs](https://docs.coinpaprika.com/) no dan límites ni términos.
- **Bitpanda:** `https://api.bitpanda.com/v1/ticker` responde sin clave con 884 activos (cripto y
  metales, sin acciones ni ETF). La API legacy se apaga el 2027-01-31
  ([migración](https://docs.public.bitpanda.com/migrating-from-the-legacy-api)). No depender de él.
- **Con clave obligatoria:** CoinMarketCap Basic (15.000 créditos al mes,
  [precios](https://coinmarketcap.com/api/pricing/)), CoinCap v3 (v2 ya no resuelve) y
  CryptoCompare, ahora CoinDesk Data (401 «API key required»).
- _Interpretación:_ para BTC/ETH en EUR, Kraken o Bitvavo son un respaldo sin clave de CoinGecko.
  Para altcoins con id estable, CoinGecko sigue siendo más práctico.

### Divisas y bancos centrales

- **open.er-api.com:** una actualización al día; 429 y bloqueo de 20 min si se abusa; pide
  atribución ([docs](https://www.exchangerate-api.com/docs/free),
  [términos](https://www.exchangerate-api.com/terms)). Útil solo si faltan divisas fuera del BCE.
- **fawazahmed0/exchange-api:**
  `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.json`, CC0 y
  «No rate limits» ([repo](https://github.com/fawazahmed0/exchange-api)). Origen de datos no
  declarado y mantenedor único.
- **Banco de España:** CSV `https://www.bde.es/webbe/es/estadisticas/compartido/datos/csv/tc_1_1.csv`
  y API `https://app.bde.es/bierest/resources/srdatosapp/listaSeries?…`. Son los tipos del BCE:
  no aportan nada frente a Frankfurter o el BCE. Uso libre citando la fuente (términos leídos solo
  vía buscador).
- **FRED:** exige clave gratuita; las series de terceros con copyright solo para uso personal
  ([términos](https://fred.stlouisfed.org/docs/api/terms_of_use.html)). Innecesario.
- **exchangerate.host:** ahora exige clave de apilayer (401). Descartado.

### Brókeres

- **Trading 212:** la [API](https://docs.trading212.com/api) (beta) da cartera, pedidos, metadatos
  de instrumentos e historial, pero **no precios de mercado**. Sirve para importar posiciones, no
  cotizaciones.
- **Interactive Brokers:** el snapshot de la Web API distingue datos en tiempo real (con
  suscripción) y retrasados; 100 snapshots reales gratis al mes (fuentes vistas solo vía buscador:
  [disponibilidad](https://www.interactivebrokers.com/docs/web-api/v1/endpoints/market-data/market-data-availability.md)).
  Requiere cuenta y un gateway en marcha. No encaja en un servidor desatendido.
- **Degiro:** sin API oficial. [`degiro-connector`](https://github.com/Chavithra/degiro-connector)
  da precios y búsqueda con tus credenciales. Guardar las credenciales del bróker en el servidor
  es un riesgo. Descartado.
- **eToro:** API pública con claves de cuenta (`x-api-key`, `x-user-key`) según
  [api-portal.etoro.com](https://api-portal.etoro.com/). Precio y términos sin verificar.
- **Scalable Capital y Lightyear:** sin API pública constatada (fuentes secundarias).

## Repos de código abierto

Datos de `gh api repos/OWNER/REPO` y `releases/latest` el 2026-11-28. «Push» es el último push.

| Repo                                                                                              | Lenguaje    | ★      | Push / release                    | Licencia                 | Fuente por debajo                                                               | Para nosotros                                |
| ------------------------------------------------------------------------------------------------- | ----------- | ------ | --------------------------------- | ------------------------ | ------------------------------------------------------------------------------- | -------------------------------------------- |
| [portfolio-performance/portfolio](https://github.com/portfolio-performance/portfolio)             | Java        | 4,2k   | 2026-11-20 / 0.90.0 (2026-11-01)  | EPL-1.0                  | Yahoo, EODHD, Alpha Vantage, Finnhub, CoinGecko, Kraken, BCE… + feeds genéricos | **Referencia clave** + buscador ISIN público |
| [ghostfolio/ghostfolio](https://github.com/ghostfolio/ghostfolio)                                 | TypeScript  | 9,8k   | 2026-11-28 / 3.101.0              | AGPL-3.0                 | Yahoo, CoinGecko, EODHD, FMP, Alpha Vantage, Google Sheets, manual              | Referencia (no copiar: AGPL)                 |
| [wealthfolio/wealthfolio](https://github.com/wealthfolio/wealthfolio)                             | Rust        | 9,8k   | 2026-11-23 / v3.13.1              | AGPL-3.0                 | Yahoo, Börse Frankfurt, OpenFIGI, Finnhub, MarketData.app…                      | Referencia                                   |
| [we-promise/sure](https://github.com/we-promise/sure)                                             | Ruby        | 18,3k  | 2026-11-28 / v0.7.6-hotfix.2      | AGPL-3.0                 | Yahoo, EODHD, Tiingo, Twelve Data, Alpha Vantage, Binance…                      | Referencia                                   |
| [maybe-finance/maybe](https://github.com/maybe-finance/maybe)                                     | Ruby        | 54,2k  | 2025-07-24 / v0.6.0 (archivado)   | AGPL-3.0                 | Synth (API propia, ya irrelevante)                                              | Descartar                                    |
| [Mael-J/mstarpy](https://github.com/Mael-J/mstarpy)                                               | Python      | 123    | 2026-11-11 / v11.1.2 (2026-11-07) | MIT                      | Morningstar (endpoints no oficiales)                                            | **Portar lo mínimo a TS** / referencia       |
| [druzsan/justetf-scraping](https://github.com/druzsan/justetf-scraping)                           | Python      | 141    | 2026-11-13 / sin releases         | MIT                      | justETF (HTML y JSON)                                                           | Referencia (solo ETF)                        |
| [marq24/ha-justetf-live](https://github.com/marq24/ha-justetf-live)                               | Python      | 14     | 2026-11-26                        | —                        | justETF (websocket en vivo)                                                     | Referencia                                   |
| [gadicc/yahoo-finance2](https://github.com/gadicc/yahoo-finance2)                                 | TypeScript  | 819    | 2026-11-24 / v4.0.6 (2026-11-08)  | MIT                      | Yahoo                                                                           | Ya en uso                                    |
| [ranaroussi/yfinance](https://github.com/ranaroussi/yfinance)                                     | Python      | 26,0k  | 2026-11-26 / 1.8.0 (2026-11-03)   | Apache-2.0               | Yahoo                                                                           | Referencia (mismo origen)                    |
| [dpguthrie/yahooquery](https://github.com/dpguthrie/yahooquery)                                   | Python      | 921    | 2025-05-15 / v2.4.1               | MIT                      | Yahoo                                                                           | Descartar                                    |
| [alvarobartt/investpy](https://github.com/alvarobartt/investpy)                                   | Python      | 1,9k   | 2026-04-13 / 1.0.8 (2022-01)      | MIT                      | Investing.com (scraping)                                                        | Descartar (bloqueado por Cloudflare)         |
| [alvarobartt/investiny](https://github.com/alvarobartt/investiny)                                 | Python      | 442    | 2026-02-28 / v0.7.2 (2022-10)     | MIT                      | API interna de Investing.com                                                    | Descartar                                    |
| [OpenBB](https://github.com/OpenBB-finance/OpenBB)                                                | Python      | 75,8k  | 2026-11-25 / 2026-09-30           | AGPL-3.0 (según el repo) | Plugins: yfinance, FMP, Tiingo, Polygon, FRED… casi todos con clave             | Referencia (arquitectura de proveedores)     |
| [JerBouma/FinanceToolkit](https://github.com/JerBouma/FinanceToolkit)                             | Python      | 5,6k   | 2026-11-28 / v2.4.0 (2026-11-27)  | MIT                      | FMP (clave) + Yahoo                                                             | Descartar (fundamentales)                    |
| [JerBouma/FinanceDatabase](https://github.com/JerBouma/FinanceDatabase)                           | Python      | 9,7k   | 2026-11-28 / 2.5.2 (2026-11-14)   | MIT                      | CSV de metadatos, sin precios                                                   | Referencia (ISIN → tipo y categoría)         |
| [pydata/pandas-datareader](https://github.com/pydata/pandas-datareader)                           | Python      | 3,3k   | 2026-07-21 / v0.11.1 (2026-06-24) | BSD-3 (según el repo)    | Stooq, FRED, Tiingo…                                                            | Descartar (Stooq bloqueado, sin ISIN)        |
| [Chavithra/degiro-connector](https://github.com/Chavithra/degiro-connector)                       | Python      | —      | —                                 | —                        | Degiro (no oficial)                                                             | Descartar (credenciales del bróker)          |
| [fawazahmed0/exchange-api](https://github.com/fawazahmed0/exchange-api)                           | —           | —      | —                                 | CC0 (datos)              | Propia, servida por jsDelivr                                                    | Referencia (divisas)                         |
| [actualbudget/actual](https://github.com/actualbudget/actual)                                     | TypeScript  | 30,5k  | 2026-11-28 / v26.11.0             | MIT                      | Sin cotizaciones                                                                | Descartar                                    |
| [firefly-iii/firefly-iii](https://github.com/firefly-iii/firefly-iii)                             | PHP         | 25,4k  | 2026-11-28 / v6.7.12              | AGPL-3.0                 | Sin cotizaciones                                                                | Descartar                                    |
| Stooq: [wegar-2/pystooq](https://github.com/wegar-2/pystooq), `@dshtrading/connector-stooq` (npm) | Python / TS | 10 / — | 2026-09 / 0.9.1 (2026-11-26)      | —                        | Stooq                                                                           | Descartar (sin ISIN; Stooq bloqueado)        |
| [Quadra-Ryo/JustETF-Scraper-API](https://github.com/Quadra-Ryo/JustETF-Scraper-API)               | —           | 12     | 2024-10-17                        | —                        | justETF (scraping)                                                              | Descartar (inactivo)                         |
| [nfredrik/morningstar-fund-scraper](https://github.com/nfredrik/morningstar-fund-scraper)         | —           | 2      | 2025-05-24                        | —                        | Web de Morningstar                                                              | Descartar                                    |

`OpenBB-finance/OpenBB` redirige hoy a `openbq-org/OpenBB`, y la API lo devuelve con licencia
`NOASSERTION`. `pyjustetf` no existe ni en GitHub ni en PyPI. En npm no hay wrappers útiles:
`morningstar` (0.0.0, 2017) y `morningstar-node` (2016) están muertos,
`@highcharts/connectors-morningstar` es para Morningstar Direct (de pago) y para justETF solo hay
un nodo de n8n (`n8n-nodes-etf-data-extractor` 0.1.0). Las búsquedas `gh search repos` «isin quote
api», «morningstar fund nav scraper», «portfolio performance quote feed» y «fund nav isin» no
dieron resultados relevantes. «—» = dato no recogido.

### Portfolio Performance

- **Feeds** en [`online/impl/`](https://github.com/portfolio-performance/portfolio/tree/master/name.abuchen.portfolio/src/name/abuchen/portfolio/online/impl):
  Yahoo (y precio ajustado), EODHD, Alpha Vantage, Finnhub, Quandl, Twelve Data, Leeway, CoinGecko,
  Kraken, Binance, Bitfinex, MEXC, BCE, Eurostat HICP, AMFI y MFAPI (India), Credit Suisse, manual,
  y los genéricos `GenericJSONQuoteFeed`, `HTMLTableQuoteFeed` y `variableurl/`.
- **No hay feed nativo** de justETF, Morningstar, Onvista, Ariva, Lang & Schwarz, Tradegate ni
  Börse Frankfurt. Los fondos europeos se resuelven con los feeds genéricos: el usuario escribe una
  URL con macros (`{ISIN}`, `{WKN}`, `{TICKER}`, fechas; ver `variableurl/macros/ISIN.java`) y una
  ruta JSON o una tabla HTML. Las URLs concretas de justETF u Onvista viven en la ayuda y el foro, no
  en el código.
- **Yahoo:** `query1.finance.yahoo.com/v8/finance/chart/{ticker}` (`YahooFinanceQuoteFeed.java`)
  y búsqueda en `query2…/v1/finance/search` (`YahooSymbolSearch.java`).
- **`api.portfolio-report.net` está retirado:** `PortfolioReportQuoteFeed.java` fija
  `CUTOFF_DATE = 2025-11-20`. Lo sustituye `PortfolioPerformanceFeed.java` contra
  `api.portfolio-performance.info` (`/v1/quote/…`, `/v1/candle`), con token Bearer y plan
  «premium» para las cotizaciones.
- **Su buscador es público.** Probado hoy:
  `curl "https://api.portfolio-performance.info/v1/search?isin=IE00B4L5Y983"` → descripción y
  mercados con símbolo de Yahoo, MIC y divisa (`IWDA.AS`/XAMS, `EUNL.DE`/XETR, `IWDA.L`/XLON…).
  Con `IE00B03HD191` (fondo) devuelve `[]`. Acepta `q`, `isin` y `symbol`
  ([`PortfolioPerformanceSearchProvider.java`](https://github.com/portfolio-performance/portfolio/blob/master/name.abuchen.portfolio/src/name/abuchen/portfolio/online/impl/PortfolioPerformanceSearchProvider.java)).
  **Sin verificar:** si se permite el uso por terceros y sus límites.
- _Para nosotros:_ la idea de un feed genérico «URL con `{ISIN}` + ruta JSON» es lo que más
  conviene copiar en diseño (EPL-1.0 permite leer y reimplementar).

### Ghostfolio

- Proveedores en [`data-provider/`](https://github.com/ghostfolio/ghostfolio/tree/main/apps/api/src/services/data-provider):
  `yahoo-finance`, `coingecko`, `eod-historical-data`, `financial-modeling-prep`, `alpha-vantage`,
  `google-sheets`, `rapid-api` (solo Fear & Greed), `manual` y `ghostfolio` (su API de pago). En
  `data-enhancer/` usa Trackinsight y OpenFIGI.
- **Fondos europeos:** el proveedor Yahoo busca por ISIN y admite `MUTUALFUND`
  (`yahoo-finance.service.ts`), es decir, lo mismo que hace hoy finance-tracker. FMP tiene
  `/stable/search-isin` (de pago) y EODHD devuelve el ISIN en la búsqueda.
- **El parche para fondos sin ticker es `manual.service.ts`:** `scraperConfiguration` con `url`,
  `selector` y `headers`. Si la respuesta es JSON, el selector es un JSONPath; si no, un selector
  CSS con cheerio.
- AGPL-3.0: tomar solo la idea, no el código.

### Wealthfolio

- Proveedores en [`crates/market-data/src/provider`](https://github.com/wealthfolio/wealthfolio/tree/main/crates/market-data/src/provider):
  Yahoo, Börse Frankfurt, Alpha Vantage, Finnhub, AMFI, MarketData.app, MetalPriceAPI, MOEX,
  OpenFIGI y US Treasury.
- `boerse_frankfurt/mod.rs` usa `https://api.live.deutsche-boerse.com/v1` y
  `/tradingview/search?query=…`; solo acciones y bonos, no fondos.
- Yahoo con cookie de `fc.yahoo.com` y crumb, `v8/finance/chart` y `quoteSummary` (con
  `topHoldings` para ETF y fondos). No usa justETF ni Morningstar.

### mstarpy y justetf-scraping

- **mstarpy** (MIT, activo): `Funds(term=…)` busca por nombre o ISIN. Endpoints en
  [`security.py`](https://github.com/Mael-J/mstarpy/blob/master/mstarpy/security.py):
  `lt.morningstar.com/api/rest.svc/klr5zyak8x/security_details/{code}`,
  `api-global.morningstar.com/sal-service/v1/…` (con una `apikey` embebida, que no se probó),
  `www.morningstar.com/api/v2/search` y `us-api.morningstar.com/QS-markets/chartservice`. Solo el
  primero respondió hoy sin navegador (ver Morningstar arriba). Portar a TypeScript solo la llamada
  `timeseries_price` y, si hace falta, `security_details`: son un par de `fetch`.
- **justetf-scraping** (MIT): `performance-chart` en JSON y la ficha HTML. Solo ETF; para ETF ya
  basta Yahoo.

### Sure y Maybe

- **Maybe** está archivado y dependía de Synth.
- **Sure**, su fork vivo (AGPL), tiene proveedores en `app/models/provider/`: `yahoo_finance.rb`
  (URL configurable con `YAHOO_FINANCE_URL`), `eodhd.rb`, `tiingo.rb`, `twelve_data.rb`,
  `alpha_vantage.rb`, `mfapi.rb` y `binance_public.rb`. Ninguno resuelve fondos europeos por ISIN.

## Interpretación (b): llevar los datos a Stock Events sin Pro

- La API es Pro: «An active Stock Events Pro subscription is required to create and use API keys»
  ([ayuda API](https://stockevents.app/en/help/use-the-stock-events-api)). La
  [OpenAPI](https://stockevents.app/api/v1/openapi.yaml) lo repite.
- No es «a general market-data or symbol-search API». No hay endpoint de cotización; solo
  `holdings` calcula valores de las posiciones propias.
- Pro cuesta $49,99/año. El plan gratuito permite «Track up to 15 stocks» y una sola lista.
  «Custom Assets» (activos con precio propio) y «API Access» son Pro
  ([precios](https://stockevents.app/en/pricing),
  [listas](https://stockevents.app/en/help/create-multiple-watchlists)).
- **Vía gratuita: importar CSV o Excel** desde la app (Ajustes › Data › Import Transactions).
  - Columnas `Symbol, Date, Quantity, Price` y, opcionalmente, divisa, comisiones y `To Cash`.
    Ventas en negativo.
  - Las operaciones duplicadas se omiten.
  - El límite: «Transactions over your current watchlist spots limit will not be imported»
    ([importar](https://stockevents.app/en/help/import-transactions)).
  - La página no dice que importar sea Pro.
  - _Propuesta derivada:_ que finance-tracker exporte un CSV en ese formato con los símbolos ya
    mapeados (`targetSymbol` de `stockEvents.symbolMappings`). Sería gratis, manual y limitado a
    15 valores.
- «Connect» (sincronización con brókers) es un complemento de pago ($0,99/semana). No se encontró
  la lista de brókers.
- No hace falta «trasladar cotizaciones» a Stock Events, porque obtiene los precios por su cuenta.
  Solo los activos sin cotización (Custom Assets) necesitarían precio propio, y eso es Pro.
- **Sin verificar:** el formato de símbolos europeos e ISIN en Stock Events. El ejemplo oficial usa
  `MSF.F`; no hay documentación sobre ISIN.

## Riesgos

- **Yahoo puede cortar o endurecer el acceso**: cambios de esquema, crumb o consentimiento, 429.
  Mitigaciones que ya existen: caché de 120 s, enfriamiento tras 429 y último precio marcado
  `stale`. Mitigaciones que faltan: un respaldo con licencia adecuada para mostrar datos (EODHD como
  cierre diario) y actualizar `yahoo-finance2` a menudo.
- **Términos:** casi todas las opciones gratuitas son solo para uso personal y prohíben
  redistribuir. Si la app se abre a otros usuarios (hay `userId` y sincronización multiusuario),
  ninguna de estas licencias gratuitas lo cubre.
- **Twelve Data Basic como respaldo visible** probablemente incumple su licencia de no
  visualización.
- **Tiingo** es incompatible con guardar cotizaciones en el estado persistente.
- **Morningstar `lt`** depende de una clave pública no documentada (`klr5zyak8x`) y de términos que
  prohíben la extracción automatizada: si se integra, tratarlo como respaldo opcional con caché
  larga (el valor liquidativo es diario) y no como fuente única.
- **Fondos:** valor liquidativo diario. Un fondo con hora de ayer no está «retrasado», y conviene
  que `MARKET_QUOTE_STALE_MINUTES` no lo marque como fallo
  (ver [investment-portfolio-data-2026-10-18](investment-portfolio-data-2026-10-18.md)).

## Preguntas abiertas

1. ¿«Trasladar» se refería a la app (a) o a Stock Events (b)? Si es (b), ¿bastan 15 valores e
   importación manual?
2. ¿Cuántos instrumentos hay y de qué bolsas o fondos? Con eso se decide si EODHD Free (20 al día)
   alcanza como respaldo diario.
3. ¿Se acepta el riesgo de términos de Yahoo para uso personal, o se prefiere pagar un plan con
   licencia de visualización? Las referencias de la revisión anterior son EODHD EOD a ~€20/mes o
   Twelve Data Grow.
4. Pendiente de probar con cuenta gratuita (no se registró ninguna): cobertura real de EODHD para
   `SAN.MC`/BME y fondos europeos, y los 3 mercados de Twelve Data Basic.
5. ¿Qué fondos de la cartera real no tienen dato en Yahoo? Para esos, ¿se acepta Morningstar `lt`
   como respaldo, o se prefiere un precio manual o un «feed» configurable (URL con `{ISIN}` + ruta
   JSON, al estilo de Portfolio Performance y Ghostfolio)?
6. Pendiente de leer: términos de justETF, Lang & Schwarz, Tradegate, Börse Frankfurt, FT y los de
   uso de `api.portfolio-performance.info` por terceros, y si la CNMV publica el valor liquidativo
   diario en algún fichero.
