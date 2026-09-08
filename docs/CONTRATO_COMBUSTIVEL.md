# Contrato compartilhado de combustível

## W-F2.1 — saída V2 e coexistência

A Web lê `03-combustivel` através de `normalizarMovimentoCombustivel()`, distinguindo explicitamente `schemaVersion: 2, tipo: entrada`, `schemaVersion: 2, tipo: saida` e documentos legados. `schemaVersion` não é obrigatório globalmente.

Saídas V2 usam `quantidadeAbastecida` (Int64 ×10), `valorAbastecimento` (Int64 ×100), leituras de montante/estoque, as identidades estruturadas `frentista`, `paraQuem` e `autorLancamento`, além de `obra` e `itemFrota`. Veículo usa `itemFrota.km` inteiro sem escala; máquina usa `itemFrota.horimetro` inteiro ×10. Horímetro nunca entra em métricas de KM.

`modalidadeAbastecimento` é `direto` ou `galao`. Galão continua sendo saída vinculada a `itemFrota`, mas pode não ter medidor; não exige `semKm: "Galao"`. `semKm` permanece opcional para legado/transitório.

Entradas V2 não são consumo e não participam de KM/L. Legados continuam sendo lidos por `qa/li/lf/diesel`, `placa`, `motorista`, `para_quem`, `obra/local`, `km` raiz e `semKm`, sem migração.

As Rules separam entrada V2, saída V2 e legado. Saída V2 valida `autorLancamento.uid == request.auth.uid` e estoque. A coerência por `getAfter()` foi avaliada no emulator, mas não adotada porque excede o orçamento de expressões quando combinada com o caminho legado; a atualização operacional da bomba continua limitada por `changedOnly` e não inclui `ultimaEntrada`. O caminho legado e seu débito técnico de autorização permanecem preservados.

## Unidades

- VOLUME: inteiro Firestore ×10; `50000` representa 5.000 L.
- DINHEIRO: inteiro Firestore ×100; `2900000` representa R$ 29.000,00.
- `schemaVersion: 2` identifica o contrato monetário novo.
- `precoLitro` é snapshot informativo ×100, não fonte de verdade.

## Entrada

```text
litrosComprados: 50000
preco: 2900000
precoLitro: 580
```

Isso representa 5.000 L, R$ 29.000,00 e R$ 5,80/L.

## Custo de abastecimento

A fonte financeira é `preco` + `litrosComprados`. Para 87,3 L:

```text
round(873 * 2900000 / 50000) = 50634 centavos = R$ 506,34
```

Os fatores ×10 de volume se cancelam. Documentos sem `schemaVersion` continuam
sendo lidos pelo contrato legado, sem conversão nova e sem heurística por
magnitude. A Web não migra documentos existentes.
