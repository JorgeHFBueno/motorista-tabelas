# CronoObra / Monday — histórico e arquitetura

Documento canônico de manutenção, onboarding, auditoria e troubleshooting. A fonte de verdade desta documentação é o código atual e seus testes.

## Estado resumido

- MK6A: UI reativa para Status de LOTEs; a obra muda de seção sem recarregar a página.
- MK6B: projetor canônico Monday → `monday-obras`, idempotente e transacional.
- MK6C: OAuth 2.1, provisionamento administrativo e webhook automático validados no canário.
- O botão manual continua existindo como reconciliação/fallback; não é o mecanismo primário do fluxo automático.
- O scheduler está implementado no código, com cadência de 30 minutos. A publicação efetiva não é confirmada por este repositório.

## MK6D — Performance das visualizações

### MK6D.1 — Overlay de transição

As trocas exibem feedback antes da renderizacao pesada, bloqueiam controles e usam dois `requestAnimationFrame` antes e depois de aplicar o estado. A UX foi preservada.

### MK6D.2 — Instrumentação

Em desenvolvimento, o CronoObra usa React Profiler, contadores de renderizacao e DOM, medicoes de calculos e `PerformanceObserver` para long tasks. A API diagnostica DEV nao registra documentos ou dados pessoais e mantem no maximo 20 entradas:

- `window.__CRONO_PERF_LAST__`
- `window.__CRONO_PERF_HISTORY__`
- `window.__CRONO_PERF_PRINT__()`

### MK6D.3 — Grid diário

Antes, cada timeline criava 365 celulas e milhares de elementos: Semanas -> Dias levava cerca de 5879 ms, com Gantt em cerca de 5546 ms. Agora, o corpo tem uma timeline por linha, grade visual CSS e drop geometrico pelo eixo X; `dayCellsBody = 0`. A transicao medida ficou em aproximadamente 400-570 ms.

### MK6D.4 — Grid semanal

Antes, o corpo criava 53 celulas por timeline (318 no exemplo) e Dias -> Semanas levava cerca de 1756 ms. Agora, o corpo usa uma timeline com grade semanal CSS; `weekCellsBody = 0` e os 53 labels permanecem somente no header. A transicao medida ficou em aproximadamente 430-520 ms.

Arquitetura final: em DIAS, o header retem os labels necessarios e o body usa timeline unica + grade CSS + alocacoes/interacoes. Em SEMANAS, o header retem 53 labels e o body usa a mesma composicao. DnD, resize, alocacoes e scroll foram preservados; os visuais DIAS e SEMANAS foram validados manualmente.

## 1. Arquitetura atual

## MK6C.5 — Firestore Realtime UI

```text
Monday → webhook → projetor → monday-obras → onSnapshot → estado obras → classificação → UI
```

O CronoObra assina `monday-obras` enquanto a página está montada. O primeiro
snapshot substitui a leitura inicial; depois, `docChanges()` atualiza somente o
contrato-pai alterado e suas linhas de LOTE derivadas. O cleanup chama
`unsubscribe()` no unmount. Não há polling e o listener nunca executa
`mondaySync`, mutations Monday ou writes no Firestore.

O indicador do cabeçalho mostra `Conectando…`, `Ao vivo`, `Offline` ou
`Atualização indisponível`. Filtros, expansão de contratos, zoom, abas, drawers
e alocações persistidas permanecem independentes dos dados recebidos. Assim,
uma alteração externa no Monday aparece automaticamente na página aberta.

`mondaySync` continua exclusivamente como fallback administrativo e auditoria.

### Fontes e identidade

O item pai do Monday representa o contrato e cada subitem representa um LOTE. Em `monday-obras`, o documento é identificado pelo `parentItemId`; `raw.subitems[].id` é o `mondaySubitemId` usado pelo CronoObra. `obraV2Id` vincula o contrato local a `obras-v2`.

Coleções relevantes:

| Coleção | Papel |
| --- | --- |
| `monday-obras` | snapshot homologado lido pelo CronoObra |
| `obras-v2` | dados locais de obra, preservados pelo projetor |
| `monday-mestres` | catálogo de Mestres e cores |
| `monday-cronograma` | alocações persistidas do cronograma |
| `integrations-internal/monday/oauth-pending` | estados OAuth pendentes, com TTL |
| `integrations-internal/monday/locks/refresh` | lock curto de rotação do refresh token |

### A. CronoObra → Monday

```text
Usuário altera Status no CronoObra
  → subitemId + status de domínio
  → mondayUpdateSubitemStatus
  → Firebase Auth + funcionário ativo + adm2
  → board/coluna/label allowlisted
  → mutation Monday
  → releitura e confirmação
  → syncMondayParentToFirestore
  → monday-obras atualizado
  → UI atualiza e reclassifica sem F5
```

O token Monday permanece no backend. A mutation usa somente o `StatusLabel.id` controlado pelo backend.

### B. Monday → CronoObra automático

```text
Usuário altera algo no Monday
  → subscription Monday
  → mondayWebhook
  → challenge público ou JWT HS256 para evento real
  → normalização do evento e validação dos boards
  → resolução do parentItemId
  → syncMondayParentToFirestore(parentItemId)
  → monday-obras
  → CronoObra reflete o snapshot
```

O payload do webhook não é persistido como estado canônico: o backend relê o parent no Monday e projeta essa leitura.

### C. Reconciliação manual/fallback

```text
Botão Sincronizar Monday
  → mondaySync
  → preview (dry-run)
  → apply explícito
  → projetor MK6B
  → regras superiores de obras-v2, quando aplicáveis
```

Depois do MK6C, essa operação é fallback/reconciliação e diagnóstico, não o caminho normal de atualização.

## 2. IDs e configuração canônica

| Item | Valor |
| --- | --- |
| Firebase project | `app-motor-api` |
| Região Functions | `southamerica-east1` |
| Monday parent board | `8515762377` |
| Monday subitem board | `8615383923` |
| Status column | `color_mknqcdnw` |
| Parent formula/status | `f_rmula_mknbt1hr` |
| Monday API version | `2026-07` |
| Webhook | `https://southamerica-east1-app-motor-api.cloudfunctions.net/mondayWebhook` |
| OAuth callback | `https://southamerica-east1-app-motor-api.cloudfunctions.net/mondayOAuthCallback` |

Os IDs `parent=12808776050`, `subitem=13044433147` são exemplos de canário validados, não configuração hardcoded.

## 3. Modelo de Status

| Code | Label Monday | `StatusLabel.id` |
| --- | --- | ---: |
| `EM_ANDAMENTO` | Em andamento | 0 |
| `FINALIZADO` | Finalizado | 1 |
| `PARADA` | Parada | 2 |
| `PROXIMA_A_INICIAR` | Próxima a Iniciar | 3 |
| `REVISAR_ESCOPO` | Revisar escopo | 4 |
| `NAO_INICIADA` | Não iniciada | 5 |

`StatusLabel.id` é o identificador estável usado na escrita; não é posição visual/index. A leitura aceita `StatusValue.index`, depois `value.index` e, quando necessário, resolve o label contra o schema da coluna. `StatusValue.index` pode ser `null`; label desconhecido bloqueia a mutation.

## 4. Projetor canônico MK6B

Implementação: `functions/mondayProjector.ts`.

`normalizeMondayParent` é pura e transforma a resposta Monday em representação canônica. `buildMondayManagedPatch` gera apenas o patch Monday-owned. `syncMondayParentToFirestore` relê o parent, compara semanticamente e grava em transação. A comparação normaliza propriedades de objetos, remove `undefined` e evita writes por diferenças de serialização.

Resultados: `UPDATED` ou `NO_CHANGE`, com `changedReasons` e `changedFields`.

### Monday-owned

O projetor gerencia os campos importados do Monday em `raw`: `id`, `nome`, `status` da fórmula, `ordemInicio`, `confirmacaoRecurso`, `numeroContrato`, `ano`, `empresa`, `inicio`, `fim` e `subitems`. Cada subitem mantém `id`, `nome` e `status`. Também atualiza os metadados `sincronizacao.itemId`, `boardId`, `apiVersion` e `mondayUpdatedAt`.

### Local-owned

Campos de nível superior já existentes, como `obraV2Id`, `semObraV2`, vínculos locais e campos desconhecidos, não entram no patch. O projetor não escreve `obras-v2`. A transação lê o documento atual antes de aplicar o patch, evitando perder atualizações locais concorrentes.

### `STATUS_FORMULA_ATUALIZAR`

O motivo surge quando `raw.status` diverge de `FormulaValue.display_value` da coluna `f_rmula_mknbt1hr`. A atualização pontual antiga do subitem corrigia `raw.subitems[].status`, mas não projetava a fórmula/status do parent. O projetor canônico corrige ambos; a segunda execução retorna `NO_CHANGE`.

## 5. `mondaySync`

`functions/mondaySync.ts` lê o board pai com paginação, cria um plano e oferece `dry-run` e `apply`. O apply chama o projetor compartilhado para cada parent alterado. O sync também detecta itens novos/ausentes, detalha LOTEs e mantém a regra superior de finalização de `obras-v2`: quando o status de fórmula é `Obra Finalizada`, pode atualizar uma obra vinculada para `FINALIZADA`; nunca reabre uma obra e não finaliza sem `obraV2Id`.

O dry-run não escreve Monday nem Firestore. O apply exige uma decisão explícita do usuário. O sync continua útil para reconciliação, correção de divergências e descoberta de itens; não substitui o webhook.

## 6. `mondayUpdateSubitemStatus`

Contrato HTTP autenticado:

```json
{ "subitemId": "...", "novoStatus": "PARADA", "dryRun": false }
```

O backend rejeita campos extras, fixa board/coluna e valida parent board, Status atual e allowlist. Fluxo:

1. lê subitem e parent;
2. retorna `NO_CHANGE` sem mutation se o Status já for o alvo, mas ainda projeta o parent;
3. retorna `DRY_RUN` sem writes quando solicitado;
4. executa uma única mutation com `{ index: StatusLabel.id }`;
5. relê e verifica o Status;
6. projeta o parent confirmado.

Resultados: `UPDATED`, `NO_CHANGE`, `DRY_RUN`. Erros controlados incluem `INVALID_REQUEST`, `SUBITEM_NOT_FOUND`, incompatibilidade de boards, `STATUS_COLUMN_MISSING`, `UNKNOWN_CURRENT_STATUS`, `POST_WRITE_VERIFICATION_FAILED` e `SNAPSHOT_UPDATE_FAILED`.

Se Monday foi atualizado e o snapshot falhar, não há rollback automático nem segunda mutation; o resultado informa `SNAPSHOT_UPDATE_FAILED` e `mondayUpdated: true`. `NO_CHANGE` também pode reparar um snapshot antigo.

## 7. OAuth 2.1

App Monday: `Automato das Tabelas`. O fluxo usa `mondayOAuthStart` e `mondayOAuthCallback`, com scopes `boards:read`, `webhooks:read` e `webhooks:write`.

- PKCE S256 com verifier aleatório;
- `state` aleatório, armazenado como SHA-256;
- pending store em Firestore;
- TTL de 10 minutos e consumo transacional de uso único;
- callback em `MONDAY_OAUTH_REDIRECT_URI`;
- exige Firebase Bearer, funcionário ativo e `adm2` no start.

Diferenças importantes:

- Client ID: identificador público do app, em `MONDAY_OAUTH_CLIENT_ID` (`defineString`);
- Client Secret: segredo do app, em `MONDAY_OAUTH_CLIENT_SECRET`;
- Signing Secret: segredo usado para validar JWT dos webhooks;
- Access Token: temporário, usado no backend e não persistido;
- Refresh Token: armazenado e rotacionado no Secret Manager.

## 8. Secrets e Secret Manager

Names usados pelo código, sem valores:

- `MONDAY_API_TOKEN`;
- `MONDAY_SIGNING_SECRET`;
- `MONDAY_OAUTH_CLIENT_SECRET`;
- `MONDAY_WEBHOOK_REFRESH_TOKEN`;
- `MONDAY_OAUTH_CLIENT_ID` não é secret.

O refresh token não é usado via `defineSecret` como leitura funcional do token: `GoogleSecretManagerTokenStore` lê `versions/latest` pela API do Secret Manager e grava a rotação com `addVersion`. Access tokens não são persistidos. O runtime precisa dos papéis mínimos Secret Manager Secret Accessor e Secret Manager Secret Version Adder.

## 9. CORS do OAuth Start

`mondayOAuthStart` aceita somente:

- `https://app-motor-api.web.app`;
- `https://app-motor-api.firebaseapp.com`.

OPTIONS responde 204 e não exige auth. O POST/GET real exige Bearer Firebase e `adm2`. Não usar wildcard em produção.

## 10. `mondayWebhook`

URL: `https://southamerica-east1-app-motor-api.cloudfunctions.net/mondayWebhook`.

O endpoint é público no nível de invocação para o Monday alcançar. Challenge é público e apenas ecoado. Eventos reais exigem JWT HS256, assinatura com `MONDAY_SIGNING_SECRET`, `exp` válido e audience igual à URL canônica quando o claim existir. Board e parent board são allowlisted.

### Evento canário validado

```text
subscription: change_subitem_column_value
payload event.type: update_column_value
normalizedKind: SUBITEM_COLUMN_VALUE_CHANGED
```

O tipo da subscription não é necessariamente o `event.type` recebido no payload. Para `update_column_value`, o código exige board `8615383923`, `parentItemBoardId=8515762377` e resolve o parent por `parentItemId`. Eventos de parent usam `itemId`/`pulseId` e o board pai.

Evidência operacional registrada:

- subscription final: `646540228`;
- event: `change_subitem_column_value`;
- board: `8515762377`;
- canário subitem: `13044433147`;
- canário parent: `12808776050`;
- POST 200;
- `rawEventType: update_column_value`;
- `normalizedKind: SUBITEM_COLUMN_VALUE_CHANGED`.

Fluxo confirmado: Monday → webhook → projetor → Firestore → CronoObra, sem sincronização manual.

## 11. Provisionamento de webhook

Implementação: `functions/mondayWebhookProvision.ts`. A UI envia somente o modo; board, evento, URL e payload são fixos no backend. A rota exige autenticação/`adm2` e usa OAuth para obter access token.

| Modo | Operação |
| --- | --- |
| `AUDIT` | lê webhooks da app no board fixo |
| `ENSURE_CANARY` | cria somente se não houver equivalente |
| `CLEANUP_CANARY_DUPLICATES` | preserva o menor ID numérico, remove os demais e relê |
| `RECREATE_CANARY` | exige exatamente um, remove, confirma ausência, cria e confirma um novo |

Equivalência usa `app_webhooks_only: true`, board fixo, evento `change_subitem_column_value` e URL canônica quando disponível. Como a API pode devolver `config` sem URL, board + evento identificam com segurança o canário; URL fornecida, quando presente, precisa ser a canônica.

Regra de idempotência: zero equivalentes → `CREATED`; um → `ALREADY_EXISTS`; mais de um → `DUPLICATES_DETECTED`. Cleanup sempre faz releitura final.

## 12. Scheduler

`functions/mondayReconcileScheduled.ts` implementa `mondayReconcileScheduled` como `onSchedule`, região `southamerica-east1`, timezone `America/Sao_Paulo`, cadência `every 30 minutes`, usando o projetor MK6B. Lê o board uma vez, projeta cada parent e contabiliza `UPDATED`, `NO_CHANGE` e `ERROR`; não executa mutation Monday e não escreve `obras-v2`.

Estado de publicação: implementado localmente; publicação efetiva não confirmada no código/configuração auditados. Não declarar “publicado” sem evidência de deploy.

## 13. UI administrativa e UI reativa

Controles administrativos visíveis a `adm2`:

- `Autorizar Monday` → `mondayOAuthStart`;
- `Auditar webhooks` → `AUDIT`;
- `Criar webhook canário` → `ENSURE_CANARY`;
- `Limpar webhooks duplicados` → `CLEANUP_CANARY_DUPLICATES`;
- `Recriar webhook canário` → `RECREATE_CANARY`;
- `Sincronizar Monday` → `mondaySync` dry-run e apply explícito.

Os quatro controles de provisionamento são ferramentas administrativas de rollout, não operações normais do cronograma. Podem ser ocultados/reduzidos após estabilização.

Na UI, o estado canônico é `obras`; `separarObrasPorSituacao` deriva seções e contadores. O update usa `mondaySubitemId` e `updateObraStatusByMondaySubitemId`; os retornos confirmados `UPDATED`, `NO_CHANGE` e o caminho `SNAPSHOT_UPDATE_FAILED` atualizam a sessão sem F5. A identificação visual ainda é `V-1.665 · MK6A`, embora o backend esteja em MK6C.

## 14. Troubleshooting / runbook

### OAuth retorna `invalid client_id param`

Client Secret foi usado como Client ID. Usar o Client ID correto em `MONDAY_OAUTH_CLIENT_ID` e manter o Client Secret somente em `MONDAY_OAUTH_CLIENT_SECRET`.

### `mondayOAuthStart` retorna 503 / `oauth_client_unavailable`

O Client ID não está disponível no runtime. Conferir `defineString('MONDAY_OAUTH_CLIENT_ID')` e a configuração da função.

### CORS bloqueia OAuth Start

Conferir origem exata, OPTIONS 204 e Bearer somente no POST/GET real. Não liberar wildcard.

### Webhook retorna HTTP 401

Conferir `MONDAY_SIGNING_SECRET`, assinatura HS256, `exp`, audience e URL canônica. Causa histórica: audience ausente ou comparação contra `undefined`.

### `EVENT_NOT_SUPPORTED`

Inspecionar `event.type` real do payload. A subscription `change_subitem_column_value` pode entregar `update_column_value`.

### AUDIT encontra webhook, mas cleanup encontra zero

A API pode omitir `config.url`. A equivalência atual usa também `app_webhooks_only`, board e evento; não filtre somente por URL.

### Criar webhook gera duplicatas

Executar AUDIT, conferir board/evento/URL e usar a regra de equivalência. Se houver mais de um, usar cleanup; ele preserva o menor ID e relê após deletar.

### Webhook não chega

Conferir existência de exatamente uma subscription canária, URL, logs de `mondayWebhook`, JWT/audience e board context. Não confundir `mondayWebhookProvision` com o receiver `mondayWebhook`.

### Status não atualiza

Conferir board `8615383923`, coluna `color_mknqcdnw`, label allowlisted, parent board `8515762377` e releitura pós-mutation. `SNAPSHOT_UPDATE_FAILED` significa que Monday pode ter sido atualizado; não repetir mutation automaticamente.

## 15. Segurança — checklist

- [ ] Token Monday nunca vai ao frontend.
- [ ] Client Secret, Signing Secret e refresh token nunca são retornados.
- [ ] Operações administrativas exigem Firebase Auth, funcionário ativo e `adm2`.
- [ ] Board, evento, coluna e URL são fixos no backend.
- [ ] GraphQL arbitrário e IDs/targets vindos do cliente são proibidos.
- [ ] Payload do webhook não é estado canônico; sempre reler via projetor.
- [ ] `obras-v2` permanece isolada do projetor.
- [ ] Refresh token é rotativo no Secret Manager.
- [ ] Logs não incluem tokens ou payloads sensíveis.

## 16. Como adicionar um evento webhook

1. Confirmar o `WebhookEventType` da subscription.
2. Descobrir o `event.type` real entregue.
3. Adicionar a normalização interna correspondente.
4. Validar board e `parentItemBoardId`.
5. Resolver `parentItemId` somente por identidade confiável.
6. Chamar `syncMondayParentToFirestore`.
7. Adicionar testes de auth, boards, resolução e projeção.
8. Provisionar com idempotência, sem duplicatas.
9. Validar um canário real e seus logs.
10. Só então expandir para produção.

Nunca assumir que event da subscription é igual ao `event.type` do payload.

## 17. Histórico MK

- MK1: cronograma inicial e estrutura de planejamento.
- MK2–MK5: integração Monday, contratos, LOTEs, agrupamento, Mestres, DnD/resize, status e persistência das alocações.
- MK6A: Status do LOTE com UI reativa, estado canônico `obras`, reclassificação sem F5 e contadores derivados.
- MK6B: normalização compartilhada, patch mínimo Monday-owned, transação, idempotência e correção de `STATUS_FORMULA_ATUALIZAR`.
- MK6C: OAuth 2.1, refresh token rotativo, provisionamento seguro, webhook automático e reconciliação agendada implementada.

Este histórico resume arquitetura; não inventa datas ou commits.

## 18. Próximos passos

### MK6C / operação

- expandir subscriptions relevantes após novos canários;
- confirmar/publicar o scheduler;
- renomear `Sincronizar Monday` para `Reconciliar com Monday` quando apropriado;
- atualizar a identificação visual de MK6A para MK6C;
- reduzir controles administrativos após rollout.

### Infraestrutura

Node.js 20 está no `functions/package.json`. O alerta operacional registrado é que Node.js 20 será desativado em `2026-10-30`; tratar como prioridade de manutenção. `firebase-functions` atual no código: `^4.9.0`. Esta tarefa não faz upgrade.

## 19. Auditoria final contra o código

- [x] Names das Functions e região conferidos em `functions/index.ts`.
- [x] Boards, coluna, fórmula e API version conferidos nas Functions e testes.
- [x] Scopes, redirect URI, PKCE, state e TTL conferidos em `mondayOAuth.ts`.
- [x] Secrets conferidos sem valores.
- [x] Modos de provisionamento conferidos no frontend, backend e testes.
- [x] Evento real `update_column_value` e normalização conferidos em `mondayWebhook.ts` e testes.
- [x] Scheduler conferido; implementação local confirmada, publicação não confirmada.
- [x] Botões e versão visual conferidos em `CronogramaObrasPage.tsx`.
- [x] Suíte Functions executada: build OK, 91 testes pass, 0 falhas.
- [x] Não houve deploy, alteração de Functions/frontend/Rules, mutation real no Monday ou alteração de secrets.
