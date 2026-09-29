# Auditoria ERP — JBJ4J22

**SUCESSO** — execução exclusivamente read-only.

## Consultas

| Query | HTTP | Content-Type | Linhas | Campos do primeiro registro |
| --- | ---: | --- | ---: | --- |
| 46 | 200 | application/json; charset=utf-8 | 66 | ano, cod_empresa, cod_subcentro, conta, conta_descricao, despesa, empresa, mes, natureza, qtd_lancamentos, receita, subcentro, valor_resultado |
| 47 | 200 | application/json; charset=utf-8 | 32 | ano, cliente_fornecedor, cod_cliente_fornecedor, cod_empresa, cod_natureza, cod_nota, cod_subcentro, conta, conta_descricao, data_emissao, empresa, mes, natureza, numero_nota, placa_nota, subcentro, tipo_movimento, transferencia, valor_nota, valor_rateio, valor_resultado |

## Q46 × Q47

| Métrica | Q46 | Q47 |
| --- | ---: | ---: |
| Despesas | R$ 44.875,49 | R$ 10.815,99 |
| Receitas | R$ 1,58 | R$ 12.018,78 |
| Resultado | -R$ 44.873,91 | R$ 1.202,79 |
| Lançamentos / notas | 98 | 30 |

## Comparação com baseline (despesa)

| Consulta/período | Consulta | Baseline | Diferença | % |
| --- | ---: | ---: | ---: | ---: |
| Q46 2025 | R$ 25.882,33 | R$ 25.882,33 | R$ 0,00 | 0,00% |
| Q46 2026 | R$ 18.993,16 | R$ 18.594,16 | R$ 399,00 | 2,15% |
| Q46 Total | R$ 44.875,49 | R$ 44.476,49 | R$ 399,00 | 0,90% |
| Q47 2025 | R$ 7.536,94 | R$ 25.882,33 | -R$ 18.345,39 | -70,88% |
| Q47 2026 | R$ 3.279,05 | R$ 18.594,16 | -R$ 15.315,11 | -82,37% |
| Q47 Total | R$ 10.815,99 | R$ 44.476,49 | -R$ 33.660,50 | -75,68% |

Detalhamento anual, mensal, por conta, fornecedor, empresa e subcentro: resultado-jbj.json.

- Token presente no ambiente: SIM; credencial exposta: NÃO; segredo persistido no projeto: NÃO.
- .env rastreado: NÃO; .gitignore protege .env: NÃO.
- Total 4 é **EXPERIMENTAL — POSSÍVEL DUPLA CONTAGEM ERP**.
