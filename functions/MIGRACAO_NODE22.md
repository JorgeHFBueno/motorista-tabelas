# Migração das Cloud Functions: Node 20 → Node 22

Prazo: o Node 20 é desativado no Cloud Functions em **2026-10-30**. Pendência de origem:
`ledur-the-manuscript/_AUDITORIA/PENDENCIAS_TECNICAS_CONSOLIDADAS.md` (Node 20 deprecated).

> Nota temporária, que acompanha esta mudança. Depois do deploy, registrar o resultado em The Manuscript e apagar este arquivo.

## O que mudou

| Item | Antes | Depois |
| --- | --- | --- |
| `firebase.json` → `functions.runtime` | `nodejs20` | `nodejs22` |
| `functions/package.json` → `engines.node` | `20` | `22` |
| `firebase-functions` | `^4.9.0` | `^7.4.0` |
| `firebase-admin` | `^12.7.0` | `^13.10.0` |
| `@types/express` (devDependency) | (vinha transitivo, 4.x) | `^4.17.25` explícito |

- **Código-fonte das funções: nenhuma alteração.** Todas as funções já usavam a API v2
  (`firebase-functions/v2/https`, `v2/scheduler`, `params`, `logger`). Não existe import v1,
  `functions.config()` nem `runWith` (removidos no v7).
- `@types/express` passou a ser explícito porque o `firebase-functions` 7 traz `@types/express` 5,
  que era içado para a raiz e tipava as nossas apps como Express 5. Em runtime as apps continuam
  em **Express 4.21** (rotas sem mudança); o tipo agora bate com o runtime.
- `firebase-admin` ficou no 13.x (aceita Node ≥ 18) para os testes locais, que rodam em Node 20,
  continuarem representativos. O 14.x exige Node ≥ 22: atualizar quando o ambiente local estiver em Node 22.

## Validação feita (local, Node 20.20.2)

- `npx tsc` (build das functions): sem erros.
- Testes `functions/test/*.test.mjs`: **114/114 passaram**. Repetido em 2026-10-19 após integrar o `main` (Friday): build ok e 114/114.
  - No Windows com Node 20, `npm test` falha antes de rodar: `node --test test/*.test.mjs` não expande o glob.
    Isso já acontecia antes desta mudança. Com Node 22 local o glob é expandido pelo próprio Node.
    Rodar os testes por um shell que expanda o glob (Git Bash): `node --test test/*.test.mjs`.
- `lib/index.js` carregado com o SDK novo: as 25 funções exportam manifesto `gcfv2` com região,
  segredos e `invoker` iguais ao código.
- Web `npm run build` (raiz): passou (`built in 2m 32s`). Só os avisos de tamanho de chunk que já existiam.
- **Não validado:** execução real no runtime Node 22 do Google, que só acontece no deploy.

## Inventário das funções (25, todas v2)

| Função | Gatilho | Região | Segredos | Observação |
| --- | --- | --- | --- | --- |
| `api` | HTTPS (`onRequest`, Express) | us-central1 (padrão) | — | rewrite `/api/**` |
| `adminApi` | HTTPS (`onRequest`, Express) | us-central1 (padrão) | — | rewrite `/api/admin/**` |
| `mondaySync` | HTTPS (`onRequest`) | southamerica-east1 | MONDAY_API_TOKEN | rewrite `/api/monday-sync` |
| `mondayStatusAudit` | HTTPS (`onRequest`) | southamerica-east1 | MONDAY_API_TOKEN | |
| `mondayUpdateSubitemStatus` | HTTPS (`onRequest`) | southamerica-east1 | MONDAY_API_TOKEN | `invoker: public` |
| `mondayWebhook` | HTTPS (`onRequest`) | southamerica-east1 | MONDAY_API_TOKEN, MONDAY_SIGNING_SECRET | `invoker: public`, recebe webhooks do Monday |
| `mondayWebhookProvision` | HTTPS (`onRequest`) | southamerica-east1 | MONDAY_OAUTH_CLIENT_SECRET, MONDAY_WEBHOOK_REFRESH_TOKEN | |
| `mondayOAuthStart` | HTTPS (`onRequest`) | southamerica-east1 | — | |
| `mondayOAuthCallback` | HTTPS (`onRequest`) | southamerica-east1 | MONDAY_OAUTH_CLIENT_SECRET | |
| `mondayLinkObraV2` | HTTPS (`onRequest`) | southamerica-east1 | — | rewrite `/api/monday-link-obra-v2` |
| `mondayReconcileScheduled` | Agendada (`onSchedule`, every 30 minutes, America/Sao_Paulo) | southamerica-east1 | MONDAY_API_TOKEN | publicada em 2026-10-19 já em `nodejs22` (deploy só dela, autorizado); fora das etapas abaixo |
| `syncMondaySerpMeasurements` | Callable (`onCall`) | southamerica-east1 | ERP360_API_TOKEN | ERP Elevor |
| `getVehicleErpCosts` | Callable (`onCall`) | southamerica-east1 | ERP360_API_TOKEN | ERP Elevor |
| `manuscriptListTree` | Callable (`onCall`) | southamerica-east1 | MANUSCRIPT_GITHUB_* (3) | The Manuscript |
| `manuscriptGetDocument` | Callable (`onCall`) | southamerica-east1 | MANUSCRIPT_GITHUB_* (3) | The Manuscript |
| `manuscriptSearch` | Callable (`onCall`) | southamerica-east1 | MANUSCRIPT_GITHUB_* (3) | The Manuscript |
| `manuscriptGetBacklinks` | Callable (`onCall`) | southamerica-east1 | MANUSCRIPT_GITHUB_* (3) | The Manuscript |
| `manuscriptGetDocumentGraph` | Callable (`onCall`) | southamerica-east1 | MANUSCRIPT_GITHUB_* (3) | The Manuscript |
| `manuscriptGetDocumentHistory` | Callable (`onCall`) | southamerica-east1 | MANUSCRIPT_GITHUB_* (3) | The Manuscript |
| `provisionKioskCredential` | Callable (`onCall`) | us-central1 | — | Kiosk (admin) |
| `revokeKioskQr` | Callable (`onCall`) | us-central1 | — | Kiosk (admin) |
| `getKioskCredentialStatus` | Callable (`onCall`) | us-central1 | — | Kiosk (admin) |
| `setKioskPin` | Callable (`onCall`) | us-central1 | — | Kiosk (admin) |
| `setKioskPinEnabled` | Callable (`onCall`) | us-central1 | — | Kiosk (admin) |
| `kioskAuthenticatePin` | Callable (`onCall`) | us-central1 | — | Kiosk (login por PIN); **a versão publicada vem do `MotoristaV2_MKI`**: fora deste deploy |

## Produção × este repositório (conferido em 2026-10-19)

`firebase functions:list` mostrou 33 funções em produção, e este repositório exporta 25. A comparação usou os rótulos `firebase-functions-hash`: funções publicadas juntas compartilham o mesmo hash. Resultado:

| Situação | Funções | Tratamento |
| --- | --- | --- |
| Publicadas a partir deste repositório | as 23 das etapas abaixo | migram neste deploy |
| No código, sem deploy até 2026-10-19 | `mondayReconcileScheduled` | publicada em 2026-10-19 (`nodejs22`), por decisão separada, para levar criação/renomeação/exclusão de LOTEs a `monday-obras` a cada 30 min |
| Mesmo nome, mas a versão publicada vem do `MotoristaV2_MKI` | `kioskAuthenticatePin` | **não publicar daqui**: a versão de produção tem o PIN de administrador (`mode: "admin"`, `kioskAdminConfig`) e a deste repositório não; migrar pelo `MotoristaV2_MKI` |
| Publicadas a partir do `MotoristaV2_MKI` | `kioskAuthenticateQr`, `kioskSessionEvent`, `provisionKioskAdminPin` | migrar pelo `MotoristaV2_MKI`, que ainda usa `engines.node: 20` e `firebase-functions ^6` |
| Publicada sem código versionado | `manuscriptGetGlobalGraph` (Manuscript V5) | versionar o V5 e então republicar em Node 22 |
| Publicada sem código localizado | `novaNotificacao` (trigger Firestore, **Node 18**) | localizar a origem e decidir entre migrar ou remover |
| Extension do Firebase | `ext-firestore-bigquery-export-*` (3 em Node 20) | atualizar a Extension (`firebase ext:update` ou console); não é deploy de Functions |

**Nunca rode `firebase deploy --only functions` (completo) a partir deste repositório.** O CLI tentaria apagar as 5 funções publicadas que não estão aqui, e ainda publicaria a `kioskAuthenticatePin` deste repositório. O mesmo vale no sentido inverso para o `MotoristaV2_MKI`, que também exporta `provisionKioskCredential` e `revokeKioskQr`.

Isso inclui o script `npm --prefix functions run deploy` (`functions/package.json`), que roda o deploy completo.

## Deploy seletivo (só com aprovação)

Rode a partir da raiz do repositório, **com este commit no checkout**, depois de `npm --prefix functions ci`. O `predeploy` já faz o build. Cada deploy cria uma revisão nova em Node 22; para voltar atrás, volte o commit e republique a mesma função.

Ordem sugerida, da menor para a maior exposição:

1. Canário (leitor interno do The Manuscript):
   ```bash
   firebase deploy --project app-motor-api --only functions:manuscriptListTree,functions:manuscriptGetDocument,functions:manuscriptSearch,functions:manuscriptGetBacklinks,functions:manuscriptGetDocumentGraph,functions:manuscriptGetDocumentHistory
   ```
   Abra o The Manuscript no app e confira os logs antes de seguir.
2. ERP Elevor:
   ```bash
   firebase deploy --project app-motor-api --only functions:getVehicleErpCosts,functions:syncMondaySerpMeasurements
   ```
3. Monday (OAuth, sincronização e auditoria), sem a agendada:
   ```bash
   firebase deploy --project app-motor-api --only functions:mondayOAuthStart,functions:mondayOAuthCallback,functions:mondayWebhookProvision,functions:mondaySync,functions:mondayStatusAudit,functions:mondayLinkObraV2
   ```
4. Monday (endpoints públicos):
   ```bash
   firebase deploy --project app-motor-api --only functions:mondayWebhook,functions:mondayUpdateSubitemStatus
   ```
5. Kiosk administrativo (publicado a partir daqui), sem `kioskAuthenticatePin`:
   ```bash
   firebase deploy --project app-motor-api --only functions:provisionKioskCredential,functions:revokeKioskQr,functions:getKioskCredentialStatus,functions:setKioskPin,functions:setKioskPinEnabled
   ```
6. APIs Express principais:
   ```bash
   firebase deploy --project app-motor-api --only functions:api,functions:adminApi
   ```

Depois de cada etapa, `firebase functions:list` deve mostrar `nodejs22` nas funções daquela etapa.

## Pendências fora do escopo

- `npm audit` em `functions/`: 19 alertas, quase todos transitivos (`protobufjs`, `form-data`, `@grpc/grpc-js`, `jws`, `path-to-regexp`/`body-parser`/`qs` do Express 4). Tratar à parte.
- Subir `firebase-admin` para 14.x quando o ambiente local estiver em Node 22.
- Avaliar migrar as apps de Express 4 para 5. O `firebase-functions` 7 já usa Express 5 internamente.
