# Modelo de bombas e entradas Web

## Auditoria de unidades e legado

- `bombas.estoqueAtual` e `bombas.montanteAtual` continuam em décimos de litro (a interface converte com `unidadeBombaParaLitros`).
- `03-combustivel.litrosComprados` é canônico em litros reais. Apenas `qa` de documentos legados é convertido de décimos durante a normalização.
- `capacidadeLitros` não é usado em cálculo pela Web nem recebe conversão; permanece com a unidade e os valores existentes no Firestore. Este patch não presume nem altera sua unidade.
- `folgaLitros` é preservado. Hoje é lido por `getAdm1MontanteReference` como margem junto de `montanteAtual` para a referência do fluxo adm1; não entra no cálculo de novas entradas.
- `ultimoFrentista` e `ultimoAbastecimento` continuam preservados e são escritos pelo fluxo existente de abastecimento/saída.

## Conversões

`litrosParaUnidadeBomba(litros)` converte litros reais para a unidade interna da bomba (`litros * 10`). `unidadeBombaParaLitros(valor)` faz a conversão inversa. O resumo operacional da bomba e os novos eventos não usam décimos para `litrosComprados`.

## Compatibilidade

`normalizeFuelMovement` centraliza a leitura: novo schema usa `litrosComprados`, `responsavel`, `estoqueAposMovimento` e `montanteSnapshot`; registros antigos usam `qa`, `diesel`, `lf`, `precoTotal`, `precoPorLitro` e os campos de motorista. Nenhum registro antigo é migrado ou apagado.
