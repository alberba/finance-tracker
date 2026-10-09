# Finance Tracker

Gestor de finanzas personales multiusuario. Los datos viven en D1 (modelo relacional, *sync v2*)
y el cliente trabaja offline-first contra una cola de comandos.

## Language

**Comando**:
Una intención de mutación sobre una entidad (`create` / `update` / `remove`) que el cliente
encola y el servidor aplica. Es la única vía de escritura.
_Avoid_: mutación, acción, evento

**Cola de comandos**:
El buffer local FIFO de comandos pendientes de confirmar por el servidor.
_Avoid_: outbox (en prosa; el módulo sí se llama así), buffer

**Proyección**:
La reconstrucción del estado que consume la UI a partir de las filas relacionales que devuelve
el bootstrap.
_Avoid_: hidratación, mapeo

**Id de correlación de migración**:
El identificador derivado de los datos v1 que permite reconocer una fila ya migrada. Sólo tiene
sentido para filas que vienen de v1; las entidades nuevas se identifican por su propio id.
_Avoid_: legacyId como identidad general

**Operación**:
La compra o venta que da contenido a un movimiento de inversión: símbolo, títulos, precio
unitario y comisión. Viaja siempre dentro del comando del movimiento, nunca por separado.
_Avoid_: trade suelto, detalle

**Plantilla de movimiento**:
El conjunto de datos que describe qué movimiento hay que crear: tipo, importe, categoría,
descripción, cuenta y, si es de inversión, la operación. Una regla recurrente es una plantilla
más un calendario; un movimiento pendiente es una plantilla más una fecha; un movimiento es una
plantilla ya ocurrida.
_Avoid_: borrador, payload

**Cuenta**:
Un sitio donde hay dinero, con un tipo: efectivo, inversión o pasivo. Las tres listas de la
interfaz son vistas filtradas de lo mismo.
_Avoid_: activo de inversión y pasivo como entidades propias

**Cursor de sincronización**:
La revisión hasta la que este dispositivo ha aplicado cambios. Sólo avanza al recibir cambios,
nunca al confirmarse un envío propio.
_Avoid_: versión, revisión (a secas)

**Celda de presupuesto**:
El importe presupuestado para una combinación de categoría, año y mes. Su identidad son esos
tres datos.
_Avoid_: entrada de presupuesto, budget entry

**Snapshot de patrimonio**:
La foto de todos los saldos en un mes concreto de un año concreto. Su identidad es (año, mes);
sin los saldos no es un snapshot.
_Avoid_: corte, balance mensual

**Regla recurrente**:
Una plantilla de movimiento más un calendario. Cada vencimiento genera un movimiento pendiente.
_Avoid_: automatización, programación

**Compra recurrente**:
Una regla recurrente cuya plantilla lleva una operación de compra. Es el nombre que recibe en
Inversión, no una entidad aparte.
_Avoid_: DCA, plan automático

**Suscripción**:
Un gasto periódico que se registra para analizar el gasto fijo. No genera movimientos por sí
misma.
_Avoid_: regla recurrente, cargo fijo

**Posición**:
Lo que se tiene ahora de un activo: títulos, valor, capital invertido y peso en la cartera.
_Avoid_: holding, activo (a secas)

**Cierre**:
Un punto de valoración de la cartera en una fecha. Sale de un snapshot de patrimonio o se añade
a mano.
_Avoid_: corte, foto de cartera

**Aporte**:
El dinero neto que entra en la cartera entre dos cierres; es negativo cuando se retira. Separa
la rentabilidad del ahorro.
_Avoid_: contribución, flujo

**Valor liquidativo**:
El valor de una participación de la cartera. Parte de 100 y solo cambia con la rentabilidad,
nunca con los aportes.
_Avoid_: NAV, precio de participación
