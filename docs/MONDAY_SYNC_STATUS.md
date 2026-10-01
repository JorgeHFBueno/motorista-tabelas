# Monday Sync: status do contrato, lote e confirmações

`monday-obras/{mondayItemId}.raw.status` e' o status contratual do item pai. A fonte unica e':

- coluna Monday `f_rmula_mknbt1hr` (titulo `Status`, tipo `formula`);
- campo GraphQL `FormulaValue.display_value`.

`FormulaValue.text` e `FormulaValue.value` nao sao usados para esse campo. Quando
`display_value` esta vazio ou ausente, `raw.status` e' projetado como `null` e o
dry-run contabiliza o caso em `formulaStatusVazia`.

A coluna `color_mm7da26y` (titulo `Status 1`, tipo `status`) nao e' fallback e
nao e' fonte de `raw.status`. Ela representa outro conceito e nenhum novo campo
e' criado por esta sincronizacao.

O status de subitem permanece independente: `raw.subitems[].status` vem de
`color_mknqcdnw.text`. No Cronograma, linhas de LOTE usam exclusivamente esse
campo; se estiver ausente, a UI apresenta o estado neutro `Sem status`, sem
fallback para o status do contrato. `raw.fim` continua vindo de `fim_mknaarxc`.

Os dropdowns do item pai também são sincronizados exclusivamente pelo texto
exibido pelo Monday (vazio resulta em `null`):

- `raw.ordemInicio` <- `dropdown_mknrvr7q.text` (`Ordem de Início`);
- `raw.confirmacaoRecurso` <- `dropdown_mknqe4hf.text` (`Confir. Recurso`).

IDs internos e JSON bruto dos dropdowns não são persistidos.

Somente o resultado da formula igual a `Obra Finalizada` pode projetar
`obras-v2/{obraV2Id}.status = FINALIZADA`; o dry-run nao realiza escritas.
Antes de projetar essa escrita, a sincronização lê o status atual de `obras-v2`:
se já for `FINALIZADA`, o item é considerado sincronizado e não gera operação,
detalhe de alteração ou write idempotente. A sincronização nunca reabre obras.
