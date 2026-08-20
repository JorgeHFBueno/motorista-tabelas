# Auditoria e deploy das Firestore Security Rules

Data: 2026-08-20

## 1. Projeto Firebase

- Project ID confirmado: `app-motor-api`.
- React: `.firebaserc`, `.env` e `src/firebase.ts` apontam para `app-motor-api`.
- Flutter: `firebase.json`, `lib/firebase_options.dart` e `android/app/google-services.json` apontam para `app-motor-api`.
- CLI local do Web: Firebase CLI 13.35.1; `firebase use --non-interactive` retornou `app-motor-api` imediatamente antes do deploy.
- Não foi encontrada divergência de Project ID.

## 2. Rules canônicas

- Fonte canônica: `Web/firebase-table-viewer-mk-ii/firestore.rules`.
- Referência de deploy: `Web/firebase-table-viewer-mk-ii/firebase.json` -> `firestore.rules`.
- O Flutter precisa manter uma cópia local porque a Firebase CLI rejeita Rules fora da raiz indicada por seu `firebase.json`.
- Cópia técnica: `App/MotoristaV2_MKI/firestore.rules`.
- As duas cópias têm SHA-256 `BFD6F3D9B1870C3E0AABF7940606D58D8DC053C5EEF246F96729A02D1A423B8F`.
- O teste Flutter compara o conteúdo integral das duas cópias e falha em caso de divergência.
- Foram removidos os backups obsoletos `firestore.rules.app-v2.bak` e `firestore.rules.producao.bak`.

## 3. Coleções e operações encontradas

| Coleção/subcoleção | React/Web | Flutter/Android | Política resultante |
| --- | --- | --- | --- |
| `00-autorizados` | `get` direto; CRUD/list via Functions/Admin SDK | `get` próprio | próprio ou `adm2` em `get`; `adm1`/`adm2` em `list`; sem escrita cliente |
| `00-autorizados/{email}/fcmTokens` | não encontrada | `set` do token próprio | create/update próprio e token coerente com o ID; sem read/delete |
| `Versionamento/app` | não encontrada | `get` | leitura autenticada; sem escrita |
| `users` | `get` e `update` próprio | não encontrada | documento próprio; privilégios imutáveis |
| `veiculos` | list/get/query/create/update | list/get/query e update de km | leitura autorizada; administração `adm2`; motorista só altera km/timestamp |
| `01-placas` | create em componente legado sem rota confirmada | não encontrada | somente `adm2` lê/cria; update/delete negados |
| `obras` | list/query/create/update/delete | list/get/query | leitura autorizada; escrita `adm2` |
| `motoristas`, `motivos` | list | não encontrada | leitura autorizada; sem escrita cliente |
| `notas-categorias` | list/create/update/delete | não encontrada | CRUD `adm2` |
| `notas-fornecedores` | list/create/update/delete/transaction | não encontrada | CRUD `adm2` |
| `notas-fornecedores-numeros` | get/create/delete/transaction | não encontrada | CRUD `adm2` |
| `app-metadata/notas-fornecedores-numero` | get/set/update/transaction | não encontrada | read/create/update `adm2`; delete negado |
| `atividades` | list/query/get | list/query/create/set/batch/transaction | leitura ampla; create com autoria real e alvo próprio, salvo `adm1`/`adm2`; histórico imutável |
| `atividades/*/checklist_saida` | list/get | create/read em batch | leitura autorizada; create com autoria protegida; imutável |
| `atividades/*/checklist_chegada` | não encontrada | create/read em batch | create sem schema/versionamento rígido, com autoria protegida; imutável |
| `03-combustivel` | list/query/get/create/set/transaction; CRUD também via API/Admin SDK | list/query/create/transaction | leitura ampla; create compatível com legado e UIDs protegidos; update/delete com admin claim |
| `bombas` | list/get/update/transaction | list/get/update em transaction | motorista altera só quatro campos operacionais; `adm2` administra |
| `00-chamados` | não encontrada | list/query/create/update/transaction | leitura ampla; identidade/origem imutáveis em update; delete negado |
| `configuracoes` | não encontrada | get e set/update transacional por `adm2` | leitura autorizada; `adm2` cria/atualiza qualquer ID/schema; delete negado |
| `notificacoes` | não encontrada | create/get/list/update e polling | motorista opera a própria; `adm2` lista; campos críticos imutáveis |
| `notificacoes/*/leituras` | não encontrada | get/set por `adm2` | somente o próprio UID `adm2`; sem list/delete |
| `manutencoes` | list/query/create/update/delete | não encontrada | leitura/create `adm2`; update/delete com admin claim |
| `manutencoes-legado` | list/query/update/delete | não encontrada | leitura `adm2`/claim; update/delete com claim; create negado |
| `dev_obras_locais` | não encontrada | query/list/batch create por `adm2` | read/create `adm2`; update/delete negados |

`04-backup` existe apenas como constante Flutter sem uso efetivo e permanece no `default deny`. Não foram encontradas operações `collectionGroup` nem listeners Firestore `snapshots/onSnapshot`; notificações usam polling. As Functions encontradas usam Admin SDK e não passam pelas Security Rules do cliente.

## 4. Mudanças nas Rules

- Removidas `categoriasVeiculoV2Validas`, `checklistVeiculoConfigValida` e `checklistVeiculoObrigatoriosValida`.
- Removidos `keys().hasOnly(...)`/`hasAll(...)` de schema completo, `size() <= 74`, `catalogoVersao == 'v2'` e dependências `getAfter(...)` do checklist.
- `changedOnly(...)` ficou apenas em recursos globais compartilhados: km/timestamp de `veiculos` e quatro campos operacionais de `bombas`.
- `didNotChange(...)` protege privilégios de `users`, identidade/origem de `00-chamados` e identidade/destino de `notificacoes`.
- `atividades` exige `criadoPorUid == request.auth.uid`; usuário comum só aponta `motoristaUid` para si e `adm1`/`adm2` podem registrar para terceiro mantendo autoria real.
- Combustível aceita payloads legados que omitem UIDs, mas bloqueia `uid`, `criadoPorUid` ou `motoristaUid` falsos quando enviados; `adm1`/`adm2` podem registrar para terceiro.
- Configurações deixaram de ter whitelist de IDs/schemas; somente `adm2` cria/atualiza e delete continua negado.
- Checklists aceitam campos e versões futuras, preservando autorização, autoria e imutabilidade.
- Consultas amplas reais foram preservadas e o `default deny` permanece.

## 5. Incompatibilidades e adaptações

Nenhuma incompatibilidade foi encontrada entre as novas Rules e os payloads/queries usados pelos dois clientes. Não foi necessário modificar código React, Flutter, UI, Functions ou models.

| Arquivo | Problema | Correção |
| --- | --- | --- |
| `App/MotoristaV2_MKI/firebase.json` | CLI não aceita referenciar Rules fora da raiz | mantida cópia local idêntica e criado teste antideriva; Web segue canônico |
| harness integrado do App | execução com Project ID demo fazia `storage.rules` consultar outro namespace Firestore | repetido localmente com `--project app-motor-api`; 41/41 passou; Storage não foi alterado |

Ressalvas preexistentes fora do patch: o lint global React contém 81 erros e 18 warnings em arquivos não alterados; o arquivo de teste alterado passa no ESLint isolado. A Rules de Storage do Web permite leitura por perfil inativo que ainda carregue `adm2`; isso foi documentado por teste, mas não alterado porque este trabalho é de Firestore.

## 6. Testes e validações

| Comando | Resultado |
| --- | --- |
| `npm.cmd run test:rules:firestore` (Web) | 106/106 Firestore, Emulator, sucesso |
| `npm.cmd run test:rules` (Web) | 115/115: 106 Firestore + 9 Storage, sucesso |
| `npx.cmd --yes firebase-tools@14.16.0 emulators:exec --only firestore --project demo-firebase-rules "node --test --test-concurrency=1 rules-tests/firestore.rules.test.js rules-tests/permission_denied_chegada_audit.rules.test.js"` (App) | 29/29 Firestore, sucesso |
| `npx.cmd --yes firebase-tools@14.16.0 emulators:exec --only firestore,storage --project app-motor-api "npm.cmd --prefix rules-tests test"` (App) | 41/41: 32 Firestore + 9 Storage, sucesso |
| `npm.cmd run build` (Web) | sucesso; somente warnings de chunk/Browserslist |
| `npm.cmd run lint` (Web) | falhou: 81 erros e 18 warnings preexistentes fora dos arquivos alterados |
| `node_modules\\.bin\\eslint.cmd tests\\rules\\rules.test.mjs` (Web) | sucesso, 0 problemas |
| `flutter analyze` (App) | sucesso, `No issues found` |
| `flutter test` (App) | 109/109, sucesso |

Falhas intermediárias não foram ocultadas: a primeira execução combinada do Web revelou testes de Storage antigos que esperavam permissões diferentes do `storage.rules` existente; os testes foram corrigidos para descrever o ruleset real, sem alterar Storage. A primeira execução integrada do App com `--project demo-firebase-rules` terminou em 37/41 porque `storage.rules` usa `firestore.get(...)` e o harness fixa `app-motor-api`; repetida com IDs coerentes, terminou em 41/41.

Não há script de testes gerais React no `package.json`; os testes existentes são os de Rules. Não foi produzido APK/AAB.

## 7. Revisão de segurança

1. Motorista altera `00-autorizados`: **não**.
2. Motorista transforma a si mesmo em admin: **não**.
3. Motorista altera configuração global: **não**.
4. Motorista falsifica `criadoPorUid`: **não**.
5. Motorista cria atividade para outro motorista: **não**; `adm1`/`adm2` são a exceção confirmada.
6. Motorista reescreve atividade histórica: **não**.
7. Motorista exclui atividade: **não**.
8. Motorista altera campos administrativos de veículo: **não**.
9. Motorista altera campos administrativos da bomba: **não**.
10. Campo novo legítimo em atividade quebra automaticamente: **não**.
11. Campo novo legítimo no checklist quebra automaticamente: **não**.
12. Nova versão de checklist exige alterar Rules: **não**.
13. Nova configuração criada por `adm2` exige alterar Rules: **não**.
14. Coleção não declarada continua bloqueada: **sim**.

## 8. Deploy

- Ocorreu em `app-motor-api`.
- Comando: `node_modules\\.bin\\firebase.cmd deploy --only firestore:rules --project app-motor-api --non-interactive`.
- Resultado: `firestore.rules` compilou, foi enviado e liberado em `cloud.firestore`; CLI retornou `Deploy complete!`.
- Somente `firestore:rules` foi publicado. Hosting, Functions, Storage, Realtime Database e demais serviços não foram publicados.

## 9. Arquivos alterados

- `Web/firebase-table-viewer-mk-ii/firestore.rules`
- `Web/firebase-table-viewer-mk-ii/tests/rules/rules.test.mjs`
- `Web/firebase-table-viewer-mk-ii/FIREBASE_RULES_DEPLOY.md`
- `App/MotoristaV2_MKI/firestore.rules`
- `App/MotoristaV2_MKI/rules-tests/firestore.rules.test.js`
- removido: `App/MotoristaV2_MKI/firestore.rules.app-v2.bak`
- removido: `App/MotoristaV2_MKI/firestore.rules.producao.bak`

O Web `.firebase/hosting.ZGlzdA.cache` já estava modificado antes da auditoria e foi preservado como alteração alheia; não faz parte do patch nem do deploy.

## 10. Conclusão

**APROVADO COM RESSALVAS**.

As novas Firestore Rules são compatíveis com os fluxos auditados e passaram no Emulator e nas validações dos clientes. As ressalvas são exclusivamente a dívida preexistente do lint React e a política independente de Storage do Web, fora do escopo e não publicada.

## Correção pós-deploy — PERMISSION_DENIED em Chegada

### 1. Payload real de Chegada

O Android conectado executava exatamente o APK release `motorista_17-08_16-40pm.apk`, instalado em 2026-08-20 10:07:20. O SHA-256 do APK instalado e do artefato local é `F1A526EB48C81E6B5E2FF1D922D9F0D4FD6BB81EAE89A2D0CEB7E589BAE84C03`.

O `app.dill` gerado para esse release foi inspecionado. Em `SaidaPage._salvar()`, `FirebaseAuth.instance.currentUser` é armazenado em `user`; a UI passa `motoristaUid: user.uid` tanto para Chegada quanto para Saída. Ela passa `criadoPorUid: user.uid` somente a cada `ChecklistSaidaMetadata`.

O `batch.set(atividades/{atividadeId})` compilado no APK de 17/08 envia em Chegada:

```text
data, destino, local, km, motivo,
motorista = FirebaseAuth.currentUser.uid,
motoristaUid = FirebaseAuth.currentUser.uid,
placa, obra, obraId, tipo = "chegada",
checklistChegadaConcluido, checklistChegadaTotalItens,
checklistChegadaItensComAvaria, checklistChegadaCriadoEm,
checklistChegadaVersao, checklistCatalogoVersao,
checklistChegadaGuincho, tipoChecklist, categoriasChecklist,
itensChecklistObrigatorios, versaoConfiguracaoChecklist,
versaoConfiguracaoObrigatoriedade
```

Esse Map não contém `criadoPorUid`, `criadoPor`, `para_quem`, `uid` nem `email`. A Saída do mesmo APK também envia `motoristaUid = user.uid`, mas não envia `criadoPorUid` no documento pai. Os itens de `checklist_saida/checklist_chegada` já enviavam `criadoPorUid = user.uid`.

O fonte atual, modificado depois daquele release, já envia no documento pai `motoristaUid`, `criadoPorUid`, `motorista`, `criadoPor` e `para_quem`. Não foi necessária correção no Flutter atual.

### 2. Predicado exato que falhava

A Rule publicada exigia:

```javascript
request.resource.data.get('criadoPorUid', '') == request.auth.uid
```

No APK instalado, `criadoPorUid` estava ausente. Portanto `get(..., '')` retornava `''`, e `'' == request.auth.uid` era falso. O Emulator reproduziu `PERMISSION_DENIED` na linha do `allow create` para o Map real de Chegada e também para o Map real de Saída.

`motoristaUid` não era o causador nesse APK: o valor salvo era exatamente `FirebaseAuth.instance.currentUser.uid`, igual a `request.auth.uid` no fluxo comum.

### 3. Por que os testes anteriores não detectaram

- Os 106/106 e 115/115 do Web construíam manualmente todas as atividades com `criadoPorUid` e `motoristaUid`.
- Os 29/29 e 41/41 do App usavam fixtures do fonte atual de 19/08, não o Map compilado no APK release de 17/08.
- O teste chamado de “payload real observado” também adicionava artificialmente `criadoPorUid: user.uid`, campo ausente no documento pai do APK instalado.
- Os testes unitários com `FakeFirebaseFirestore` exercitavam a serialização atual, mas não executavam Security Rules e não representavam o binário instalado.

Assim, os UIDs fictícios coincidiam e o campo obrigatório pela Rule sempre existia nos fixtures, escondendo a incompatibilidade retroativa.

### 4. Rule anterior

```javascript
allow create: if
  isAuthorized()
  && request.resource.data.get('criadoPorUid', '') == request.auth.uid
  && request.resource.data.get('motoristaUid', '') is string
  && request.resource.data.get('motoristaUid', '') != ''
  && (
    isAdmin()
    || request.resource.data.get('motoristaUid', '') == request.auth.uid
  );
```

### 5. Rule corrigida

```javascript
allow create: if
  isAuthorized()
  && request.resource.data.get(
    'criadoPorUid',
    request.auth.uid
  ) == request.auth.uid
  && (
    isAdmin()
    || request.resource.data.get(
      'motoristaUid',
      request.auth.uid
    ) == request.auth.uid
  );
```

Quando os campos são enviados, continuam presos ao UID autenticado. Quando ausentes em clientes legados, assumem o próprio UID apenas para a decisão de autorização. `adm1`/`adm2` continuam podendo registrar para terceiros. Update/delete de atividade continuam negados.

### 6. Testes adicionados

`rules-tests/permission_denied_chegada_audit.rules.test.js` agora cobre:

- Chegada comum com o Map exato do APK release, sem `criadoPorUid`;
- Saída comum com o Map exato do APK release;
- Chegada com o Map do fonte atual;
- falsificação de `criadoPorUid` por usuário comum;
- `motoristaUid` de terceiro por usuário comum;
- Chegada de `adm1` para terceiro;
- Saída de `adm2` para terceiro;
- `campoFuturo: "teste"`;
- legado sem `criadoPorUid` e sem `motoristaUid`;
- checklist, update de veículo e batch completo.

### 7. Resultados

- Pré-patch: 9/12 passaram; falharam Chegada release, Saída release e legado sem campos opcionais, todos com `PERMISSION_DENIED` no `allow create` de atividades.
- Pós-patch específico: 12/12 passaram.
- Firestore Rules canônicas: 106/106 passaram.
- Suíte integrada App: 49/49 passaram, sendo 40 Firestore e 9 Storage.
- `flutter analyze`: `No issues found`.
- `flutter test`: 109/109 passaram.
- `storage.rules`, Hosting e Functions não foram alterados.

### 8. Hash das Rules

As cópias Web e Flutter são idênticas. SHA-256:

`4B94BACDEDAC1D9C5EC6DDA3715D0BB829C5DF4D75C13E6D789593C547F48B2B`

### 9. Deploy corretivo

- Projeto reconfirmado pela CLI: `app-motor-api`.
- Comando: `node_modules\\.bin\\firebase.cmd deploy --only firestore:rules --project app-motor-api --non-interactive`.
- Resultado: compilação, upload e release concluídos; CLI retornou `Deploy complete!`.
- Somente `firestore:rules` foi publicado.
