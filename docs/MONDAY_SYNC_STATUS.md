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

`raw.subcentroErp` não é assumido como chave única. Ele é o vínculo externo usado pela integração de medições descrita nesta evolução.

## Evolução CronoObra: medições ERP no saldo do contrato (2026-10-15)

### Objetivo e arquitetura

O campo **MEDIÇÕES** do `ContractBalanceModal` passou a consultar o ERP Elevor de forma controlada. Ao abrir o modal, o frontend solicita a atualização; a callable `syncMondaySerpMeasurements` consulta a Query 55, consolida o resultado, persiste o snapshot em `monday-serp/{idObra}` via Admin SDK e devolve o dado ao modal.

```text
ContractBalanceModal → syncMondaySerpMeasurements → ERP Query 55
        ↑                                             ↓
        └── monday-serp/{idObra} ← consolidação ←─────┘
```

O `idObra` usa preferencialmente `monday-obras.raw.id`, com o fallback legado do adaptador para o ID do documento. O `subcentroErp` vem exclusivamente de `monday-obras.raw.subcentroErp`; ele não é inferido pelo nome da obra nem convertido para número.

### Consulta e contrato ERP

A Function, na região `southamerica-east1` e runtime Node.js 20, fixa internamente `Query ID = 55` e `CentroCusto = "4"`. A requisição é `{"CentroCusto":"4","SubCentro":"<subcentroErp>"}`. O frontend não escolhe query, centro de custo, endpoint ou token. Esta integração não usa Query 53, datas, `LIKE` ou `CONTÉM`.

O retorno válido é um array de linhas com `qtd_notas` inteiro não negativo e `valor_bruto_servico` finito não negativo. Um array vazio e o `null` observado no ERP significam consulta bem-sucedida sem registros e são normalizados para zero. Objetos, strings, números, `NaN`, `Infinity` e campos financeiros inválidos continuam sendo erro de contrato ERP, sem serem transformados em zero. Para múltiplas linhas, os dois campos são somados.

Casos reais validados: o SubCentro `177` retornou HTTP 200, 7 notas e `1083888.83`, exibido como `R$ 1.083.888,83`; o SubCentro `212` retornou HTTP 200 com `null`, exibido como `R$ 0,00`.

### Snapshot Firestore e comportamento visual

O documento `monday-serp/{idObra}` (SERP = Subcentro de custo ERP) contém somente `idObra`, `subcentroErp`, `qtd_notas`, `valor_bruto_servico` e `atualizadoEm` (`Timestamp`). Campos auxiliares da resposta ERP, como empresa e códigos de centro/subcentro, não são persistidos.

O hover não chama ERP, Function nem grava no Firestore: ele usa apenas o estado já disponível e mostra o placeholder. No modal, a abertura dispara a consulta e pode mostrar o snapshot conhecido enquanto a atualização ocorre. Sem dado conhecido, MEDIÇÕES é `R$ --,--`; zero confirmado é `R$ 0,00`. Se a atualização falhar, um snapshot válido existente é preservado e o modal informa o erro. Sem `subcentroErp`, nenhuma consulta ou gravação é feita, o valor permanece `R$ --,--` e o modal informa a ausência do vínculo ERP. Os outros quatro campos do resumo continuam sem integração e exibem `R$ --,--`.

### Segurança, autorização e logs

A callable exige autenticação e conserva a semântica do CronoObra: `funcionarios/{uid}.ativo === true`, ou o perfil legado autorizado em `00-autorizados/{email}`. A escrita ocorre com Admin SDK. A Function usa o secret `ERP360_API_TOKEN`; seu valor, o cabeçalho `Authorization` e tokens Firebase não são registrados. Os eventos de manutenção incluem `monday-serp:start`, `authorized`, `request-valid`, `erp-start`, `erp-response`, `consolidated`, `firestore-written`, `done` e `failed`.

### Firestore Rules e estado da entrega

Foi preparada no código-fonte a regra de `monday-serp`: leitura para usuários autorizados e escrita de cliente negada. Ela ainda **não foi publicada**; o deploy de `firestore.rules` foi intencionalmente adiado para uma revisão consolidada das rules do projeto. A escrita de `syncMondaySerpMeasurements` usa Admin SDK e não depende dessas client rules.

Arquivos principais: `functions/mondaySerpMeasurements.ts`, `functions/index.ts`, `src/services/monday-serp.service.ts`, `ContractBalanceModal.tsx`, `WorkHoverActions.tsx`, o adaptador/modelos do CronoObra e `firestore.rules`. A integração de MEDIÇÕES, Function e frontend já haviam sido publicados e validados antes desta rodada; esta evolução registra a implementação e sua validação.
