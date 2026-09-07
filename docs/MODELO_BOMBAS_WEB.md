# Modelo de bombas e entradas Web

## CONTRATO DE UNIDADES

| Grandeza | Escala | Exemplo real | Persistido |
|---|---:|---:|---:|
| Litros | ×10 | 87,3 L | 873 |
| Estoque | ×10 | 5.000 L | 50000 |
| Montante | ×10 | 49.253,9 L | 492539 |
| Preço total | ×100 | R$ 29.000,00 | 2900000 |
| Preço/litro snapshot | ×100 | R$ 5,80/L | 580 |
| Custo de abastecimento | ×100 | R$ 506,34 | 50634 |

Todo volume operacional do novo domínio de Bombas persistido no Firestore usa
Int64 ×10. Os campos são `estoqueAtual`, `montanteAtual`, `litrosComprados`,
`estoqueAntes`, `estoqueAposMovimento` e `montanteSnapshot`; a entrada em
`bombas/diesel_patio.ultimaEntrada.litrosComprados` segue a mesma unidade.

Entradas novas em `03-combustivel` e `bombas/diesel_patio.ultimaEntrada` usam
`schemaVersion: 2`. Dinheiro novo é Int64 ×100: `preco` é total em centavos e
`precoLitro` é snapshot em centavos por litro.

`precoLitro` é apenas informação de exibição, arredondada para centavos. A fonte
de verdade financeira é `preco` total junto com `litrosComprados` totais. O
custo oficial é:

```text
valorAbastecimentoCentavos = round(
  quantidadeAbastecidaX10 * precoCompraCentavos / litrosCompradosX10
)
```

Os fatores ×10 do volume se cancelam e o resultado já fica em centavos. Não se
deve calcular pelo `precoLitro` quando preço total e litros totais estiverem
disponíveis.

O formulário recebe reais e litros visuais; as conversões monetárias ficam
centralizadas em `reaisParaCentavos` e `centavosParaReais`. O snapshot por litro
é calculado com a quantidade visual e convertido para centavos.

## Compatibilidade e auditoria

`normalizeFuelMovement` conhece explicitamente o schema v2 e converte dinheiro
v2 de centavos para reais somente na leitura da UI. Documentos sem a nova
versão preservam a semântica monetária histórica, por exemplo `preco: 29000` e
`precoLitro: 5.8`. Registros legados usam `qa`, `diesel` e `lf`, que já são ×10.

Não há heurística por magnitude e não há migração automática. Documentos
antigos não são alterados.

`capacidadeLitros` é lido apenas como dado de bomba e não participa dos
cálculos. `folgaLitros` mantém a semântica legada e não entra no cálculo de
novas entradas. `ultimoFrentista` e `ultimoAbastecimento` continuam preservados.
