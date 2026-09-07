# Contrato compartilhado de combustível

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
