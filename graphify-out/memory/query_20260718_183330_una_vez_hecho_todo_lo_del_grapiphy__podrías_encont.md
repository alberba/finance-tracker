---
type: "query"
date: "2026-07-18T18:33:30.697609+00:00"
question: "Una vez hecho todo lo del grapiphy, podrías encontrar duplicidades que se pudiesen simplificar?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["getCategoriesForType()", "requestNamespace()", "getSnapshotValue()", "matchesInvestmentAsset()", "getInvestmentBuckets()", "round2()", "cssColor()", "json()"]
---

# Q: Una vez hecho todo lo del grapiphy, podrías encontrar duplicidades que se pudiesen simplificar?

## Answer

Consulta expandida desde el vocabulario del grafo: [shared, common, helpers, utilities, normalize, round, parse, format, build, clone, open, reset]. Duplicidades confirmadas y priorizadas: getCategoriesForType aparece idéntico en tres módulos; requestNamespace idéntico en dos rutas; getSnapshotValue y matchesInvestmentAsset repiten lógica; getInvestmentBuckets duplica el mismo algoritmo; cinco round2 implementan casi la misma política con pequeñas diferencias; cssColor y los diálogos de cálculo son duplicaciones de interfaz; los helpers json pueden parametrizar Cache-Control. No fusionar POST/onSubmit por nombre, addMonths por semántica distinta, ni los adaptadores computeInvestmentValue/computeAccountBalance.

## Outcome

- Signal: useful

## Source Nodes

- getCategoriesForType()
- requestNamespace()
- getSnapshotValue()
- matchesInvestmentAsset()
- getInvestmentBuckets()
- round2()
- cssColor()
- json()