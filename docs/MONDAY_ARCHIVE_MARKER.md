# Marcador de arquivamento Monday

Para a triagem administrativa de contratos efetivamente arquivados no Monday, o único marcador permitido é o campo raiz `obras-v2["monday-obras"]` com o valor `"FIM"`.

Ele indica que o vínculo histórico do contrato com o Monday foi encerrado por arquivamento. Não define o status operacional da obra, não autoriza excluir ou desativar `obras-v2`, nem altera outras tabelas.

Antes de cada aplicação, a auditoria confirma o estado `archived` na API do Monday, valida o vínculo 1:1 por `obraV2Id`, verifica conflitos do marcador e produz um backup externo restaurável. A escrita transacional, quando autorizada, atualiza apenas esse field path.

Auditoria de 2026-10-14: a marcação não foi aplicada porque um dos candidatos ausentes do board ativo estava no estado `deleted`, e não `archived`. O manifesto com IDs e backup permanece fora do Git; nenhuma exclusão de `monday-obras` foi realizada.

## Aplicação autorizada — 2026-10-14

A auditoria confirmou 21 contratos `archived`: 12 com vínculo válido em `obras-v2` e 9 sem vínculo. O item `13192396801` (`Criar elemento`) estava `deleted` e foi excluído desta operação.

Os 12 marcadores aplicados foram:

- `10906615091` → `Reu9ln2lRecu93lF7jqp`
- `8515762501` → `dth2ObLKnrTEEZTgcsL8`
- `8515762543` → `uHNDm4RtBwMq4NgXvzHY`
- `8516313260` → `e9KlYgEBjcC5JV6aq4Uy`
- `8516314290` → `jvfTDSGHYNWTGtdOfAgA`
- `8516318255` → `IiJrEI96YAgoeiNQczYr`
- `8516320655` → `GJq1nUZ6VZbJEm6H3LMT`
- `8516323077` → `0yccUBxl61PefqK34MRm`
- `8516328100` → `QCV3p4LX1vbRKbOQsaEl`
- `8516332398` → `uBnMA9Ji1RVpFN5AEstq`
- `8516333168` → `90x76oUZFGv9h6YwdIzf`
- `9949341983` → `taZFxCSUGRMqL92e5vTE`

## Exclusão autorizada — 2026-10-15

A revalidação imediatamente anterior à execução confirmou 66 documentos em `monday-obras`, 44 itens ativos no board `8515762377`, 21 itens no estado `archived` e o item `13192396801` no estado `deleted`. A interseção entre os 22 IDs da allowlist e os itens ativos foi zero. Não havia subcoleções nos documentos-alvo, vínculos `obraV2Id` duplicados, vínculos inesperados no item deleted ou dependências operacionais diretas não tratadas.

Uma única transação Firestore excluiu exclusivamente os 22 documentos abaixo de `monday-obras`; não houve atualizações em `monday-obras`, `obras-v2` ou no Monday:

- Archived: `10906615091`, `8515762501`, `8515762543`, `8516313260`, `8516314290`, `8516318255`, `8516320655`, `8516323077`, `8516328100`, `8516332398`, `8516333168`, `8516342380`, `8669506834`, `9017904278`, `9017928389`, `9017938942`, `9017952922`, `9932195460`, `9944630557`, `9949215988`, `9949341983`.
- Deleted: `13192396801`.

A validação posterior confirmou 44 documentos restantes e correspondência integral com os 44 itens ativos, sem IDs antigos presentes e sem perda de itens ativos. Os 12/12 marcadores `obras-v2["monday-obras"] = "FIM"` foram preservados, assim como o status operacional e os demais campos dessas obras; nenhum documento em `obras-v2` foi excluído ou atualizado. Os 44 valores existentes de `raw.subcentroErp` também foram preservados, sem alteração. Nenhum novo backup foi criado e o backup anterior não foi alterado.

Na etapa de marcação de 2026-10-14, cada transação revalidou o vínculo e atualizou exclusivamente `obras-v2["monday-obras"]` para `"FIM"`. A releitura pós-escrita confirmou os 12 marcadores, preservou os demais campos e o status operacional, e a auditoria idempotente posterior projetou zero writes. Naquela etapa, nenhum documento foi excluído.
