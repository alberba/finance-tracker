# Una cuenta no es un activo y no lleva símbolo

Una cuenta de inversión es un sitio donde hay dinero (Trade Republic, Bitvavo, Crypto…). Lo que se
tiene dentro son instrumentos (BTC, ETH, XDWH…), y de cada uno una posición: cuenta × instrumento
con sus títulos, precio medio, valor, capital invertido, ganancia y peso. Una cuenta con BTC y ETH
no tiene «un símbolo»: tiene dos posiciones.

Hasta ahora la vista trataba la cuenta como un activo con un único símbolo, el del primer
instrumento vinculado o el del último movimiento. Con dos instrumentos en la cuenta, uno
«desaparecía» de la pantalla aunque sus movimientos siguieran sumando al valor. Podíamos haber
elegido el instrumento principal de cada cuenta; elegimos quitar el símbolo de la cuenta y calcular
las posiciones a partir del State (`src/domain/investment/positions.ts`), porque así una cuenta
puede tener cualquier número de instrumentos y, más adelante, un instrumento estar en varias
cuentas.

El valor de la cuenta, el patrimonio y la rentabilidad no cambian: siguen saliendo del cierre
mensual más los movimientos posteriores. Las posiciones son un reparto de esa cuenta, no otra
fuente de valor. Una posición con cotización vale títulos × precio; las demás se reparten, en
proporción a lo invertido, lo que las cotizadas dejan del valor de la cuenta.
