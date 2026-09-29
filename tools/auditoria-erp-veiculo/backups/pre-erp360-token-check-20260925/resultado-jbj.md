# Auditoria experimental ERP — JBJ-4J22

## Status

**BLOQUEADO — ERP_API_CONTRACT_MISSING**

O repositório não contém informação verificável para executar a API ERP. Nenhuma chamada de rede foi iniciada e as queries 46 e 47 não foram executadas.

Informações ausentes: URL base, endpoint de consulta, método HTTP, mecanismo de autenticação e estrutura de resposta das queries 46 e 47. Nenhuma credencial foi lida ou registrada.

## Request canônico preparado

```json
{
  "DataInicial": "2025-01-01",
  "DataFinal": "2026-09-25",
  "Placa": "JBJ4J22"
}
```

A placa foi normalizada explicitamente de `JBJ-4J22` para `JBJ4J22`; não há busca parcial.

## Resultado ERP

Não disponível: respostas, identificação de subcentro, `placa_nota`, transferências, totais, meses, contas, fornecedores e comparações dependem da resposta da API.

## Baseline preservada (sem nova consulta ao Firestore)

| Item | Valor |
| --- | ---: |
| Diesel Firebase | R$ 94.398,82 |
| Manutenções Firebase | R$ 9.768,48 |
| Firebase total | R$ 104.167,30 |
| ERP anterior — 2025 | R$ 25.882,33 |
| ERP anterior — 2026 | R$ 18.594,16 |
| ERP anterior — total | R$ 44.476,49 |

## Totais experimentais

| Total | Valor |
| --- | ---: |
| Firebase | R$ 104.167,30 |
| Firebase + Query 46 | Não calculado |
| Firebase + Query 47 | Não calculado |
| Firebase + Query 46 + Query 47 | Não calculado |

**EXPERIMENTAL — POSSÍVEL DUPLA CONTAGEM ERP.**

## Garantias desta etapa

- DataInicial: `2025-01-01`.
- DataFinal: `2026-09-25`.
- Placa enviada: `JBJ4J22`.
- Nenhuma operação foi enviada ao ERP, Firebase ou Firestore.
- Sem writes no Firebase, sem alteração da aplicação Web, `/frota` ou Firebase Rules e sem deploy.
