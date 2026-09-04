# Modelo de bombas e entradas Web

## Unidade de volume canônica

Todo volume operacional do novo domínio de Bombas persistido no Firestore usa **Int64 ×10**: 1 unidade armazenada representa 0,1 litro.

| Litros visuais | Unidade persistida |
|---:|---:|
| 0,1 L | 1 |
| 1 L | 10 |
| 1,5 L | 15 |
| 10 L | 100 |
| 5.000 L | 50000 |

Os campos canônicos são `estoqueAtual`, `montanteAtual`, `litrosComprados`, `estoqueAntes`, `estoqueAposMovimento` e `montanteSnapshot`. `bombas/diesel_patio.ultimaEntrada.litrosComprados` segue a mesma unidade. A UI trabalha em litros visuais e converte somente nas fronteiras pelos helpers `litrosParaUnidadeBomba` e `unidadeBombaParaLitros`.

`precoLitro` é calculado usando a quantidade visual: `preco / unidadeBombaParaLitros(litrosComprados)`, nunca dividindo diretamente pelo inteiro persistido ×10.

Uma entrada aumenta `estoqueAtual` e não altera `montanteAtual`; a soma é feita integralmente em unidades ×10.

## Compatibilidade e auditoria

`normalizeFuelMovement` conhece explicitamente o schema novo e retorna volumes na unidade persistida para a UI converter. Registros legados usam `qa`, `diesel` e `lf`, que já são ×10, e permanecem somente com compatibilidade de leitura. Documentos intermediários ambíguos não são detectados heurísticamente nem migrados.

`capacidadeLitros` é lido apenas como dado de bomba e não participa dos cálculos da Web. Como há produção existente e sua unidade não foi comprovada, este patch não altera seu valor ou unidade; a normalização fica para etapa própria com migração planejada.

`folgaLitros` mantém a semântica legada: é usado por `getAdm1MontanteReference` como margem junto de `montanteAtual` e não entra no cálculo de novas entradas. Não foi alterado.

`ultimoFrentista` e `ultimoAbastecimento` continuam preservados pelo fluxo existente.
