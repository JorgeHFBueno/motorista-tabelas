# Monday Sync — status

## Subcentro ERP

- Monday board: `8515762377` (item pai)
- Coluna: `Subcentro ERP`
- `columnId`: `text_mm847yy0`
- Tipo Monday: `text`
- Leitura API: `column_values.text`
- Destino Firestore: `monday-obras/{itemId}.raw.subcentroErp`
- Tipo Firestore: `string | null`

O campo é um identificador externo do ERP. Valores textuais não vazios são preservados exatamente como retornados pelo Monday: não há conversão numérica, e zeros à esquerda, letras, hífens e espaços não são normalizados. Um valor vazio (inclusive apenas espaços) é armazenado como `null`.

`raw.subcentroErp` faz parte da projeção oficial do `mondaySync`: campo ausente ou diferente é atualizado; campo igual, inclusive `null`, não gera alteração. O backfill pontual usa exclusivamente o field path `raw.subcentroErp`, não cria documentos e não escreve em `obras-v2`, Monday, `obraV2Id`, `sincronizacao` ou outros campos de `raw`.

Auditoria inicial em 2026-10-14: 44 itens no Monday e 66 documentos em `monday-obras`; os 44 IDs do Monday tinham documento correspondente. A coluna estava preenchida nos 44 itens, sem valores repetidos, e `raw.subcentroErp` estava ausente nos 44 documentos correspondentes. Os 22 documentos restantes não pertenciam mais ao conjunto atual do board e não foram alvo do backfill.

O backfill validado atualizou os 44 documentos existentes exclusivamente por `raw.subcentroErp`. A releitura pós-escrita confirmou os 44 valores como `string`, com correspondência exata ao Monday e sem alterações em `raw` fora desse campo, `obraV2Id`, `sincronizacao` ou `raw.subitems`. O segundo dry-run específico encontrou 0 pendências, 0 divergências e 0 writes projetados.

A futura query de integração com ERP não está implementada. Este campo não é assumido como chave única e não estabelece relacionamento com tabelas do ERP.
