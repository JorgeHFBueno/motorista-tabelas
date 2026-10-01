# Monday Sync: status do item pai

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
`color_mknqcdnw.text`. `raw.fim` continua vindo de `fim_mknaarxc`.

Somente o resultado da formula igual a `Obra Finalizada` pode projetar
`obras-v2/{obraV2Id}.status = FINALIZADA`; o dry-run nao realiza escritas.
