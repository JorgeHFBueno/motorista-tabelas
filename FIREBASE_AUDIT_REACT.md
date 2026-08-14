# Auditoria Firebase — React

> Escopo: inspeção estática do código-fonte React, serviços, hooks, componentes, rotas, Cloud Functions, scripts administrativos e arquivos de configuração. Nenhum teste contra o projeto Firebase remoto foi executado. As regras existentes foram lidas apenas para contextualização; não foram alteradas. Controle de acesso no frontend **não é uma barreira de segurança para o Firestore**.

## 1. Resumo executivo

A aplicação usa Firebase Authentication (email/senha e tokens ID), Cloud Firestore, Cloud Storage (somente download), Analytics, persistência offline do Firestore e duas Cloud Functions HTTP com Firebase Admin SDK. Não foi encontrado uso executável de Realtime Database, embora exista `databaseURL` na configuração. Também não foram encontrados listeners Firestore em tempo real (`onSnapshot`), `collectionGroup` ou uploads/deletes no Storage.

Foram identificados **17 caminhos lógicos de coleção** (incluindo uma subcoleção e a coleção de metadados) e um caminho de Storage. O acesso é predominantemente global: várias telas listam coleções inteiras, e somente `users/{auth.uid}` é claramente por usuário. `00-autorizados/{email}` usa email normalizado como ID e como fonte principal dos perfis `adm1`/`adm2`; a custom claim `admin` é um mecanismo paralelo usado para ações destrutivas e pela API antiga de combustível.

Principais temas para regras futuras:

1. várias escritas diretas pelo cliente ocorrem em coleções globais e são liberadas na interface apenas por rota/perfil;
2. há IDs, campos e até nomes de campos fornecidos pela interface;
3. `03-combustivel` mistura acesso direto e Admin SDK, com modelos de propriedade diferentes;
4. as regras locais não possuem `match` para a maioria das coleções usadas pelo React — se forem as regras efetivamente implantadas, tais acessos diretos serão negados por padrão;
5. Cloud Functions usam Admin SDK e, portanto, não são limitadas por Firestore Rules; sua segurança depende do middleware/API.

## 2. Arquitetura Firebase encontrada

| Arquivo | Responsabilidade |
|---|---|
| `src/firebase.ts` | `initializeApp`; exporta `db` (Firestore), `storage` e `analytics`; habilita `enableIndexedDbPersistence`. Configuração vem de variáveis `VITE_FIREBASE_*`; valores sensíveis não são reproduzidos aqui. |
| `src/contexts/AuthContext.tsx` | Inicializa Auth via `getAuth(app)`; listener `onAuthStateChanged`; login, cadastro público, logout, leitura de claims e cálculo de `isAdmin`. |
| `src/services/*.ts`, `src/hooks/*.ts` | Abstrações de Firestore, Storage, autorização e APIs HTTP. |
| `src/pages/FrotaVeiculosPage.tsx`, `src/pages/FrotaVeiculoDetalhesPage.tsx`, `src/pages/CadastrosEditarPage.tsx` | Acessos Firestore diretos adicionais, inclusive caminhos/campos dinâmicos. |
| `functions/firebaseAdmin.ts` | Inicializa Admin SDK com credencial ambiente/default; exporta Admin Auth e Firestore. |
| `functions/api.ts` | API HTTP autenticada para CRUD de `03-combustivel`. |
| `functions/adminAuth.ts`, `functions/adminApi.ts` | Middleware por ID token + `adm2`; administração de Firebase Auth e `00-autorizados`. |
| `firebase.json` | Deploy de Functions, Firestore Rules, Storage Rules e rewrites `/api/**`. |
| `firestore.rules` | Regras locais observadas para `00-autorizados`, `atividades`/`checklist_saida` e `03-combustivel`. |
| `storage.rules` | Leitura de `checklists/saidas/{atividadeId}/{fileName}` por perfil autorizado; escrita negada. |
| `scripts/setAdmin.cjs` | Define/remove custom claim `admin` em um UID. |
| `scripts/backfillFornecedorNumeros.cjs` | Script administrativo/batch para fornecedores, índice numérico e contador. Não é fluxo normal do React. |

Serviços observados: App, Authentication, Firestore, Storage, Analytics, Functions e Hosting. Não há inicialização de Functions SDK no navegador; o frontend usa `fetch` para rewrites HTTP. Não há uso executável de Realtime Database, Messaging, Remote Config ou App Check.

## 3. Matriz de acesso Firestore

Legenda: ✅ observado; ❌ não observado. `Read` significa documento individual; `List` inclui consulta/coleção inteira. Transações e batch são detalhados depois.

| Coleção/Caminho | Read | List | Create | Update | Delete | Usuário envolvido | Perfil necessário observado |
|---|---:|---:|---:|---:|---:|---|---|
| `00-autorizados/{email}` | ✅ | ✅ | ✅ | ✅ | ❌ | email do token/Auth ou email administrado | leitura própria/`adm1`/`adm2` nas regras; writes via Function exigem `adm2` |
| `03-combustivel/{registroId}` | ✅ | ✅ | ✅ | ✅ | ✅ | email compõe ID em criação direta; API pode gravar `uid` | Auth para API; UI de lista exige `adm2`; delete/edição visual por claim `admin` |
| `bombas/{bombaId}` | ✅ | ✅ | ❌ | ✅ | ❌ | nome/email do Auth entra no log; não há owner | rota protegida; sem verificação específica no serviço |
| `veiculos/{veiculoId}` | ✅ | ✅ | ✅ | ✅ | ❌ | nenhum proprietário persistido | rota protegida; sem verificação específica no write |
| `01-placas/{placaId}` | ❌ | ❌ | ✅ | ❌ | ❌ | nenhum | componente em área protegida |
| `obras/{obraId}` | ❌ | ✅ | ✅ | ✅ | ✅ | nenhum | área protegida; frontend não testa `adm2` isoladamente |
| `motoristas/{motoristaId}` | ❌ | ✅ | ❌ | ❌ | ❌ | nenhum | usado por formulário de combustível |
| `motivos/{motivoId}` | ❌ | ✅ | ❌ | ❌ | ❌ | nenhum | usado por formulário de combustível |
| `notas-categorias/{categoriaId}` | ❌ | ✅ | ✅ | ✅ | ✅ | nenhum | área protegida |
| `notas-fornecedores/{fornecedorId}` | ✅¹ | ✅ | ✅ | ✅ | ✅ | nenhum | área protegida |
| `notas-fornecedores-numeros/{numero}` | ✅¹ | ❌ | ✅ | ✅ | ✅ | nenhum | transações do cadastro/edição |
| `app-metadata/notas-fornecedores-numero` | ✅¹ | ❌ | ✅² | ✅² | ❌ | nenhum | transação do cadastro; administrativo |
| `manutencoes/{manutencaoId}` | ✅ | ✅ | ✅ | ✅ | ✅ | motorista vem de formulário; sem owner UID | rota protegida; edição/delete genéricos só aparecem com claim `admin` |
| `manutencoes-legado/{manutencaoId}` | ✅ | ✅ | ❌ | ✅ | ✅ | nenhum | carregamento opcional; edição/delete visual por claim `admin` |
| `atividades/{atividadeId}` | ✅ | ✅ | ❌ | ❌ | ❌ | campos `motorista`; sem filtro por UID | `adm1` ou `adm2` pelas regras locais |
| `atividades/{atividadeId}/checklist_saida/{itemId}` | ❌ | ✅ | ❌ | ❌ | ❌ | campo lido `criadoPorUid` | `adm1` ou `adm2` pelas regras locais |
| `users/{uid}` | ✅ | ❌ | ❌ | ✅ | ❌ | `auth.uid` determina o documento | usuário autenticado no frontend; regra local não encontrada |

¹ leitura dentro de transação. ² `set(..., {merge:true})`, podendo criar ou atualizar.

Não há REALTIME LISTENER. Há TRANSACTION em fornecedores, bombas e combustível. Há BATCH WRITE somente no script administrativo de backfill.

## 4. Detalhamento por coleção

### `00-autorizados`

- **Caminhos:** `00-autorizados/{emailNormalizado}`; ID é `trim().toLowerCase()` do email.
- **Operações:** READ individual no React e middleware; LIST indireto via `db.getAll` para usuários do Auth; CREATE/UPDATE via Admin Function (`set`, incluindo merge).
- **Arquivos/funções:** `getAuthorizationProfile`, `hasAdm2Permission`, `adminAuthMiddleware`, handlers de `functions/adminApi.ts`.
- **Rotas:** todas as rotas privadas consultam perfil; `/cadastros/usuarios/novo` e `/cadastros/editar/usuarios` escrevem via API.
- **Campos lidos:** `nome`, `adm1`, `adm2`, `createdAt`, `updatedAt`.
- **Campos criados/atualizados:** `nome`, `adm1`, `adm2`, `createdAt`, `updatedAt`; flags incompatíveis são removidas com `FieldValue.delete()` na edição.
- **Autorização:** documento do solicitante é resolvido pelo email do token, não pelo UID. Middleware administrativo exige `adm2 === true`. Regras locais permitem `get` próprio ou por perfil e negam writes do SDK cliente.
- **Classificação:** ADMINISTRATIVA.
- **Relações:** email ↔ usuário do Firebase Auth; fonte de perfil de rotas e APIs.
- **[ATENÇÃO DE SEGURANÇA]** Email é identificador de autorização. Mudança de email no Auth não migra este documento no código analisado.
- **[ATENÇÃO DE SEGURANÇA]** `adm1` e `adm2` controlam navegação, mas a proteção efetiva de dados deve existir em Rules/API.

### `03-combustivel`

- **Caminhos:** `03-combustivel/{dataLocal email}` em `saveCombustivel*`; IDs automáticos nos logs de bomba, manutenção externa e endpoint POST; `{idDaInterface}` em API e detalhe.
- **Operações:** READ individual (API/detalhe), LIST global (API), QUERY por `placa`, QUERY `orderBy(data desc), limit(1)`, CREATE, UPDATE merge via API, UPDATE/remoção de campo arbitrário pelo detalhe, DELETE via API/detalhe, CREATE em transação.
- **Arquivos/funções:** `combustivelFirestore.ts`, `combustivel.service.ts`, `bombasService.ts`, `functions/api.ts`, `useCombustivel`, `TabelaCombustivel`, páginas de Frota.
- **Rotas:** `/combustivel`, `/combustivel/novo`, `/frota`, `/frota/:placa`, `/bombas`.
- **Campos lidos:** `data`, `lf`, `qa`, `li`, `arla`, `diesel`, `motorista`, `para_quem`, `placa`, `local`, `motivo`, `observacao`, `obra`, `km`, `semKm`, `tipoPlaca`, `valor`, `uid`, e campos extras exportados dinamicamente.
- **Campos criados:** fluxo combustível: `data`, `tipoPlaca`, `li`, `lf`, `qa`, `arla`, `para_quem`, `motivo`, `local`, `placa`, `obra`, `motorista`, `observacao`, `km`, `semKm`, opcional `diesel`; log de bomba: `data`, `motivo`, `motorista`, `local`, `bombaId`, opcionais `diesel`, `lf`, `qa`; manutenção externa: `data`, `observacao`, `fornecedor`, `motorista`, `para_quem`, `placa`, `qa`; API POST: todo `req.body` mais `uid` do token.
- **Campos atualizados:** API aceita todo `req.body` com merge; detalhe permite qualquer `fieldPath`/valor e remoção de qualquer campo.
- **Filtros/ordenação:** `where('placa','==',{placa})`; `orderBy('data','desc')`; `limit(1)`.
- **Auth:** criação direta usa email apenas para formar o ID e não grava `uid`; API POST sobrescreve/adiciona `uid = token.uid`; API PUT permite claim `admin` ou `original.uid === token.uid`; DELETE exige claim `admin`.
- **Classificação:** MULTIUSUÁRIO (global com `uid` apenas em parte dos documentos).
- **Relações:** `placa` → `veiculos`; `obra` → `obras` por nome; `bombaId` → `bombas`; `motorista`/`para_quem` → pessoas por texto; manutenção externa duplica dados de `manutencoes` sem guardar seu ID.
- **[ATENÇÃO DE SEGURANÇA]** Leitura da coleção inteira pela API para qualquer token válido; sem filtro de proprietário.
- **[ATENÇÃO DE SEGURANÇA]** POST da API aceita campos arbitrários do corpo; apenas `uid` é forçado pelo servidor.
- **[ATENÇÃO DE SEGURANÇA]** Criação direta aceita dados de formulário e usa `setDoc(..., merge:false)`; ID previsível contém data e email.
- **[ATENÇÃO DE SEGURANÇA]** Criação direta não inclui `uid`, mas a edição da API compara `original.uid`; ownership é inconsistente.
- **[ATENÇÃO DE SEGURANÇA]** A tela de detalhe permite campo/valor/documento dinâmicos. A UI esconde isso sem claim `admin`, mas o handler não repete o teste antes do SDK call.
- **[ATENÇÃO DE SEGURANÇA]** Regras locais de update consultam `request.resource.data.uid`; documentos sem `uid` tendem a não satisfazer ownership.

### `bombas`

- **Caminhos:** `bombas/{bombaId}` e constante `bombas/diesel_patio`.
- **Operações:** LIST; READ individual; UPDATE em transação; pode gerar CREATE em `03-combustivel`.
- **Arquivos/funções:** `listBombas`, `updateBombaAndMaybeLog`, `getInitialLiValue`, `getAdm1MontanteReference`, `saveCombustivelAndUpdateDieselPatio`; rota `/bombas` e `/combustivel/novo`.
- **Campos lidos:** `nomeBomba`, `ativo`, `capacidadeLitros`, `estoqueAtual`, `montanteAtual`, `folgaLitros`, `ultimoAbastecimento`, `ultimoFrentista`.
- **Campos atualizados:** patch de interface (tipicamente `estoqueAtual`, `montanteAtual`, e qualquer campo editável da grade); no abastecimento: `montanteAtual`, `estoqueAtual`, `ultimoAbastecimento`, `ultimoFrentista`.
- **Auth:** nome/email do usuário vira `motorista` do log ou `ultimoFrentista`; não há owner UID.
- **Classificação:** ADMINISTRATIVA/GLOBAL.
- **Relações:** logs apontam por `bombaId`.
- **[ATENÇÃO DE SEGURANÇA]** IDs e patches vêm da grade; proteção observada é a rota privada, sem teste de perfil no serviço.

### `veiculos`

- **Caminhos:** `veiculos/{identificador}` na criação; `veiculos/{idDaInterface}` em update; query global.
- **Operações:** READ para detectar duplicidade/detalhe; LIST; QUERY; CREATE com `setDoc`; UPDATE.
- **Arquivos/rotas:** `veiculos.service.ts`, `CadastroVeiculoNovoPage` (`/cadastros/veiculos/novo`), páginas `/frota` e `/frota/:placa`, formulários de combustível.
- **Campos lidos:** `identificador`, `ativo`, `categoria`, `placa`, `extra`, `complemento`, `quilometragemInicial`, `quilometragemUltima`, `dataUltimaAtualizacao`.
- **Campos criados:** `ativo`, `categoria`, `identificador`, `quilometragemInicial`, `complemento`, `dataUltimaAtualizacao`, e `placa` ou `extra`.
- **Campos atualizados:** `ativo`, `quilometragemInicial`, `quilometragemUltima`, `placa` ou `extra`, `dataUltimaAtualizacao`.
- **Filtros/ordenação:** `where placa == {rota}` com fallback `where extra == {rota}`; `orderBy('placa')` ou `orderBy('extra')`. O filtro `ativo` é feito no cliente após LIST integral.
- **Classificação:** GLOBAL/ADMINISTRATIVA.
- **Relações:** `manutencoes.identificador` e `03-combustivel.placa` referenciam veículo.
- **[ATENÇÃO DE SEGURANÇA]** Update usa ID escolhido na interface e campos globais; não existe proprietário.

### `01-placas`

- **Operação:** CREATE com ID automático em `CadastroVeiculoForm` (componente aparentemente legado/reutilizável).
- **Campos criados:** para normal `placa`, `km`, `extra:''`; para extra, `placa`, `km`, `extra` conforme payload montado pelo formulário.
- **Rota:** consumidor direto não foi localizado nas rotas atuais; `CadastroVeiculoNovoPage` usa o serviço `veiculos`, não este componente.
- **Classificação:** GLOBAL/ADMINISTRATIVA.
- **[ATENÇÃO DE SEGURANÇA]** Valores são de formulário e não há vínculo com `auth.uid`.

### `obras`

- **Operações:** LIST/QUERY, CREATE, UPDATE, DELETE.
- **Arquivos/rotas:** `useObras`, `obras.service.ts`, `ObrasSection`, `CadastrosEditarPage`; `/cadastros`, `/cadastros/editar/obras`, formulários de combustível.
- **Campos lidos:** `nome`, `local`, `aka`, `descricao`, `createdAt`.
- **Campos criados:** `nome`, `local`, `aka`, `createdAt`.
- **Campos atualizados:** `nome`, `local`, `aka`, `updatedAt`.
- **Ordenação:** `nome asc`, `createdAt desc` com fallback para `nome asc`. Duplicidade de `aka` é validada após listar documentos.
- **Classificação:** GLOBAL/ADMINISTRATIVA.
- **Relações:** combustível guarda `obra` por texto.
- **[ATENÇÃO DE SEGURANÇA]** Unicidade de `aka` é somente validação frontend e sujeita a concorrência.

### `motoristas` e `motivos`

- **Operações:** LIST integral, sem query Firestore; filtro `ativo === true` e ordenação por `nome` no cliente.
- **Arquivos/rotas:** `motoristas.service.ts`, `motivos.service.ts`; formulários em `/combustivel` e `/combustivel/novo`.
- **Campos lidos:** `nome`, `ativo`.
- **Writes:** nenhum encontrado.
- **Classificação:** GLOBAL (cadastros de referência).

### `notas-categorias`

- **Operações:** LIST/`orderBy(nome)`, CREATE, UPDATE, DELETE.
- **Arquivos/rotas:** `CadastroBasicoForm`, `CadastrosEditarPage`, páginas de Frota; `/cadastros`, `/cadastros/editar/categorias`, `/frota*`.
- **Campos lidos:** `nome`, `descricao`, `createdAt`, `updatedAt`.
- **Campos criados:** `nome`, `descricao`, `createdAt`.
- **Campos atualizados:** `nome`, `descricao`, `updatedAt`.
- **Classificação:** GLOBAL/ADMINISTRATIVA.
- **Relações:** `manutencoes.categoriaId`; snapshot textual em `categoriaNomeSnapshot`.
- **[ATENÇÃO DE SEGURANÇA]** CREATE/UPDATE/DELETE dependem apenas da área protegida no frontend.

### `notas-fornecedores`

- **Operações:** LIST integral, READ/UPDATE em transação, CREATE em transação, DELETE direto; batch administrativo também atualiza.
- **Arquivos/rotas:** `fornecedores.service.ts`, `CadastroBasicoForm`, `CadastrosEditarPage`, páginas de Frota; `/cadastros`, `/cadastros/editar/fornecedores`, `/frota*`.
- **Campos lidos:** `nome`, `descricao`, `numero`, `createdAt`, `updatedAt`.
- **Campos criados:** `nome`, `descricao`, `numero`, `createdAt`.
- **Campos atualizados:** `nome`, `descricao`, `numero`, `updatedAt`.
- **Ordenação:** `orderBy(nome)` em seletores; alocação de número lê toda a coleção.
- **Classificação:** GLOBAL/ADMINISTRATIVA.
- **Relações:** `manutencoes.fornecedorId`; snapshot `fornecedorNomeSnapshot`; índice em `notas-fornecedores-numeros`.
- **[ATENÇÃO DE SEGURANÇA]** Exclusão direta não remove o índice numérico/contador, podendo deixar referência órfã.

### `notas-fornecedores-numeros`

- **Caminho:** `notas-fornecedores-numeros/{numeroDecimal}`.
- **Operações:** READ/CREATE/UPDATE/DELETE em transação; CREATE/UPDATE em batch do script.
- **Campos:** `fornecedorId`, `numero`, `createdAt`, `updatedAt`, e no script `backfilledAt` ou `indexedAt`.
- **Classificação:** ADMINISTRATIVA.
- **Relações:** `fornecedorId` → `notas-fornecedores/{id}`.
- **[ATENÇÃO DE SEGURANÇA]** Integridade entre índice e fornecedor depende de transações nos fluxos específicos; delete genérico do fornecedor não participa delas.

### `app-metadata`

- **Caminho:** `app-metadata/notas-fornecedores-numero`.
- **Operações:** READ e `set merge` em transação; batch administrativo.
- **Campos:** `ultimoNumero`, `updatedAt`.
- **Classificação:** ADMINISTRATIVA.
- **[ATENÇÃO DE SEGURANÇA]** Contador global influencia IDs/números de fornecedores e não deve ser gravável como dado comum.

### `manutencoes`

- **Operações:** LIST integral na frota; QUERY por `identificador`; READ individual; CREATE; UPDATE/remoção de campo arbitrário; DELETE.
- **Arquivos/rotas:** `FrotaVeiculosPage.tsx`, `FrotaVeiculoDetalhesPage.tsx`, painel genérico `ManutencaoDetailPanel`; `/frota`, `/frota/:placa`.
- **Campos lidos/criados:** `identificador`, `tipoVeiculo`, `categoria` (legado), `categoriaId`, `categoriaNomeSnapshot`, `valor`, `quantidade`, opcional `km`, `fornecedorId`, `fornecedorNomeSnapshot`, `motorista`, `descricao`, `nota`, `status`, `data`.
- **Filtros/ordenação:** `where identificador == {veiculo.id}` + `orderBy data desc`; fallback sem ordenação. A visão geral faz LIST integral.
- **Campos atualizados:** qualquer `fieldPath` e valor selecionados no painel; qualquer campo pode ser removido.
- **Classificação:** GLOBAL/ADMINISTRATIVA.
- **Relações:** `identificador` → veículo; `categoriaId` → categoria; `fornecedorId` → fornecedor.
- **[ATENÇÃO DE SEGURANÇA]** Leituras globais expõem manutenções de toda a frota.
- **[ATENÇÃO DE SEGURANÇA]** Create aceita IDs/snapshots/valores do formulário sem owner UID.
- **[ATENÇÃO DE SEGURANÇA]** Edição e delete arbitrários são escondidos por custom claim `admin`, mas a chamada SDK depende das Rules.

### `manutencoes-legado`

- **Operações:** QUERY opcional por `identificador`; READ individual; UPDATE/remoção de campo e DELETE pelo mesmo painel genérico.
- **Campos lidos:** `data`, `categoria`, `categoriaId`, `categoriaNomeSnapshot`, `valor`, `km`, `quantidade`, `fornecedor`, `fornecedorId`, `fornecedorNomeSnapshot`, `motorista`, `descricao`, `nota`, `status`, além de campos dinâmicos do documento.
- **Rota:** `/frota/:placa`, carregada quando o usuário habilita o filtro legado.
- **Classificação:** GLOBAL/ADMINISTRATIVA.
- **[ATENÇÃO DE SEGURANÇA]** Dados legados também podem ser mutados/excluídos pelo painel genérico.

### `atividades`

- **Caminhos:** `atividades/{atividadeId}` e subcoleção `atividades/{atividadeId}/checklist_saida/{itemId}`.
- **Operações:** LIST integral de atividades; READ individual; LIST integral da subcoleção.
- **Arquivos/rotas:** `useAtividade` → `/registros`; `checklistSaida.service.ts` → `/registros/:atividadeId/checklist`.
- **Campos lidos em atividade:** `data`, `destino`, `km`, `motivo`, `motorista`, `placa`, `tipo`, `checklistSaidaConcluido`, `checklistSaidaTotalItens`, `checklistSaidaItensComAvaria`, `checklistSaidaCriadoEm`, `checklistSaidaVersao`, `checklistSaidaGuincho`.
- **Campos lidos em item:** `itemId`, `titulo`, `etapa`, `status`, `observacao`, `fotoObrigatoria`, `storagePath`, `downloadUrl`, `criadoEm`, `criadoPorUid`, `ordem`.
- **Classificação:** atividades MULTIUSUÁRIO (campos de pessoa, sem filtro); checklist POR DOCUMENTO-PAI/MULTIUSUÁRIO.
- **Relações:** `placa` → veículos; `storagePath` → Storage; `criadoPorUid` → Auth UID.
- **[ATENÇÃO DE SEGURANÇA]** A listagem não restringe por motorista/UID e lê registros de todos os usuários autorizados.
- **[ATENÇÃO DE SEGURANÇA]** `downloadUrl` pode contornar a necessidade de resolver o caminho via SDK se for URL persistente/tokenizada.

### `users`

- **Caminho:** `users/{auth.uid}`.
- **Operações:** READ individual e UPDATE `displayName` após alteração de email no Auth.
- **Arquivo/consumidor:** `usePerfil` → `PerfilDialog`, acessível pelo Header.
- **Campos lidos:** documento inteiro (schema não tipado). Campo atualizado: `displayName`, contendo o novo email.
- **Classificação:** POR USUÁRIO.
- **Relações:** ID = Firebase Auth UID.
- **[ATENÇÃO DE SEGURANÇA]** O hook altera primeiro o email do Auth e depois o documento; falha intermediária pode dessincronizar dados.
- **[ATENÇÃO DE SEGURANÇA]** Não há migração correspondente de `00-autorizados/{emailAntigo}`.

## 5. Perfis e níveis de acesso

- **Motorista:** perfil inferido quando `00-autorizados` não existe ou não tem flags; ao cadastrar explicitamente, grava `adm1:false`. Contudo, `PrivateRoute` exige `adm1 || adm2`; portanto um Motorista sem flag verdadeira não entra nas rotas privadas deste React.
- **Adm1:** `00-autorizados/{email}.adm1 === true`. Só pode navegar para `/` e `/combustivel/novo`; recebe trava adicional de “montante” lido de `bombas/diesel_patio` ou último combustível. Essa trava é somente frontend.
- **Adm2:** `00-autorizados/{email}.adm2 === true`. Acessa as demais rotas privadas e é exigido pelo middleware da API de administração de usuários.
- **Admin (custom claim):** `token.admin === true`, carregada por `getIdTokenResult`; controla botões de edição/delete genéricos e delete da API de combustível. É independente de `adm1`/`adm2`. O script `setAdmin.cjs` gerencia essa claim.

Rotas públicas: `/login`, `/signup`, `/acesso-negado`. Todas as outras estão sob `PrivateRoute`. `/signup` cria usuário Auth diretamente, mas esse usuário não ganha documento `00-autorizados` e, portanto, não passa no guard privado. Não foi localizado `RequireAuth` alternativo.

## 6. Fluxo de autenticação e autorização

```text
Firebase Authentication (email/senha)
        ↓ onAuthStateChanged
currentUser: uid, email, displayName
        ├── getIdTokenResult → custom claim admin → ações destrutivas/edição genérica
        ├── email normalizado → 00-autorizados/{email}
        │                         ├── adm1 → somente home + novo combustível
        │                         └── adm2 → demais rotas + API admin
        └── uid → users/{uid} (perfil pessoal) e token das APIs HTTP
```

Métodos Auth encontrados:

- login: `signInWithEmailAndPassword`; a tela converte identificador numérico em `{identificador}@example.com`;
- cadastro público: `createUserWithEmailAndPassword` em `/signup`;
- cadastro administrativo: `adminAuth.createUser` nas Cloud Functions;
- logout: `signOut`;
- listener: `onAuthStateChanged`;
- token/claims: `getIdToken`, `getIdTokenResult`, `verifyIdToken`;
- alteração de email e senha: `updateEmail`, `updatePassword`; reautenticação com `EmailAuthProvider.credential` + `reauthenticateWithCredential`;
- administração: `listUsers`, `getUser`, `updateUser({disabled})`, `deleteUser`, `setCustomUserClaims`.

Não foi encontrado fluxo de recuperação de senha (`sendPasswordResetEmail`).

## 7. Operações administrativas

- cadastrar/editar/desabilitar/excluir usuários Auth e cadastrar/alterar `00-autorizados` (API exige `adm2`);
- definir/remover custom claim `admin` pelo script;
- cadastrar/editar/excluir obras, categorias e fornecedores;
- cadastrar/editar veículos;
- alterar bombas e registrar alinhamento/abastecimento;
- cadastrar manutenções e abastecimentos externos;
- editar/remover campos ou excluir documentos de combustível/manutenções pela claim `admin` na UI;
- executar backfill batch de números/índices/contador de fornecedores.

Observação: várias dessas operações parecem administrativas pelo contexto e impacto, mas o código de rota permite a qualquer perfil que passe em `PrivateRoute` e não seja bloqueado como `adm1` (na prática `adm2`) chegar às telas. Isso não substitui autorização server-side.

## 8. Pontos de atenção para Firestore Rules

1. **[ATENÇÃO DE SEGURANÇA]** Controle frontend (`PrivateRoute`, botões ocultos, trava de montante) não protege Firestore.
2. **[ATENÇÃO DE SEGURANÇA]** As regras locais só cobrem três famílias; as demais chamadas diretas dependem de regras implantadas diferentes ou falharão por negação padrão.
3. **[ATENÇÃO DE SEGURANÇA]** Cloud Functions com Admin SDK ignoram Firestore Rules; validar middleware, campos permitidos e ownership é indispensável na API.
4. **[ATENÇÃO DE SEGURANÇA]** `03-combustivel` é listado integralmente por qualquer token válido na API.
5. **[ATENÇÃO DE SEGURANÇA]** API POST de combustível espalha `req.body`; API PUT faz merge de `req.body` sem allowlist.
6. **[ATENÇÃO DE SEGURANÇA]** Criações diretas de combustível não gravam `uid`; API de ownership espera esse campo.
7. **[ATENÇÃO DE SEGURANÇA]** Writes de combustível podem armazenar UID diferente/ausente em fluxos distintos; somente o POST da API força UID do token.
8. **[ATENÇÃO DE SEGURANÇA]** A interface de detalhe aceita coleção dentre três opções, doc ID e field path oriundos do estado/interface, com update/delete genérico.
9. **[ATENÇÃO DE SEGURANÇA]** `00-autorizados` usa email como autoridade; alteração de email não sincroniza o documento.
10. **[ATENÇÃO DE SEGURANÇA]** Perfis `adm1`/`adm2` e claim `admin` são sistemas paralelos e podem divergir.
11. **[ATENÇÃO DE SEGURANÇA]** Coleções globais de frota, manutenção, cadastros e bombas não armazenam owner UID.
12. **[ATENÇÃO DE SEGURANÇA]** Muitas listas são integrais; filtros `ativo`, busca e agregações ocorrem no cliente.
13. **[ATENÇÃO DE SEGURANÇA]** IDs de update/delete vêm diretamente de linhas selecionadas/rota/parâmetros.
14. **[ATENÇÃO DE SEGURANÇA]** Valores financeiros, quilometragem, quantidade, status, relações e timestamps podem vir do formulário.
15. **[ATENÇÃO DE SEGURANÇA]** Fornecedor, índice numérico e contador exigem consistência multi-documento; delete direto não limpa dependências.
16. **[ATENÇÃO DE SEGURANÇA]** `app-metadata/notas-fornecedores-numero` é configuração global sensível a concorrência/manipulação.
17. **[ATENÇÃO DE SEGURANÇA]** Unicidade de obra/fornecedor inclui verificações frontend; não deve ser tratada como garantia de segurança/integridade.
18. **[ATENÇÃO DE SEGURANÇA]** Atividades/checklists são lidos sem filtro por UID, incluindo `criadoPorUid` e referências de imagens.
19. **[ATENÇÃO DE SEGURANÇA]** URLs de download persistidas em documentos podem ter semântica diferente da autorização Storage em cada acesso.
20. **[ATENÇÃO DE SEGURANÇA]** `users/{uid}` atualiza email em campo `displayName`; o schema e as Rules efetivamente implantadas precisam ser confirmados.
21. **[ATENÇÃO DE SEGURANÇA]** `/signup` é público e cria contas Auth sem autorização Firestore associada.
22. **[ATENÇÃO DE SEGURANÇA]** A regra local de delete de combustível acessa `request.auth.token.admin` sem checagem explícita de `request.auth != null`; confirmar comportamento/testes de regras.
23. **[ATENÇÃO DE SEGURANÇA]** CORS das Functions está aberto (`cors()` / `origin:true`); autenticação ainda é exigida, mas origem não restringe clientes.
24. **[ATENÇÃO DE SEGURANÇA]** Persistência IndexedDB mantém cache local de dados Firestore no navegador após leitura.

## 9. Mapa resumido do banco

```text
Firestore
├── 00-autorizados
│   └── {emailNormalizado}
├── 01-placas
│   └── {placaIdAuto}
├── 03-combustivel
│   └── {registroId}
├── atividades
│   └── {atividadeId}
│       └── checklist_saida
│           └── {itemId}
├── app-metadata
│   └── notas-fornecedores-numero
├── bombas
│   ├── diesel_patio
│   └── {bombaId}
├── manutencoes
│   └── {manutencaoId}
├── manutencoes-legado
│   └── {manutencaoId}
├── motoristas
│   └── {motoristaId}
├── motivos
│   └── {motivoId}
├── notas-categorias
│   └── {categoriaId}
├── notas-fornecedores
│   └── {fornecedorId}
├── notas-fornecedores-numeros
│   └── {numero}
├── obras
│   └── {obraId}
├── users
│   └── {auth.uid}
└── veiculos
    └── {veiculoId/identificador}

Storage
└── checklists/saidas/{atividadeId}/{fileName}  (padrão autorizado nas rules)
    └── leitura real também aceita qualquer storagePath armazenado no item
```

## 10. Inventário de consultas

| Coleção | Campo | Operador/ordem | Valor | Arquivo/função |
|---|---|---|---|---|
| `00-autorizados` | ID do doc | `get` | email normalizado atual | `getAuthorizationProfile`, `hasAdm2Permission`, `adminAuthMiddleware` |
| `00-autorizados` | IDs | `getAll` | emails dos usuários Auth | `functions/adminApi.ts` GET users |
| `03-combustivel` | — | LIST | todos | `functions/api.ts` GET `/combustivel` |
| `03-combustivel` | ID | `get` | parâmetro da API/interface | API e detalhe de frota |
| `03-combustivel` | `placa` | `==` | placa da rota/veículo | `FrotaVeiculoDetalhesPage.loadCombustivel` |
| `03-combustivel` | `data` | `orderBy desc` | — | detalhe e `getInitialLiValue`/`getAdm1MontanteReference` |
| `03-combustivel` | — | `limit(1)` | — | funções de referência de montante |
| `veiculos` | `placa` | `==` | parâmetro `/frota/:placa` | `FrotaVeiculoDetalhesPage.loadVeiculo` |
| `veiculos` | `extra` | `==` | fallback da rota | mesma função |
| `veiculos` | `placa` ou `extra` | `orderBy` | conforme aba | `FrotaVeiculosPage.loadVeiculos` |
| `obras` | `createdAt` | `orderBy desc` | — | `useObras.loadObras` |
| `obras` | `nome` | `orderBy asc` | — | `useObras`, `listObrasNames`, edição |
| `notas-categorias` | `nome` | `orderBy asc` | — | cadastros e frota |
| `notas-fornecedores` | `nome` | `orderBy asc` | — | cadastros e frota |
| `manutencoes` | — | LIST | todos | `FrotaVeiculosPage` |
| `manutencoes` | `identificador` | `==` | ID do veículo | `fetchManutencoes` |
| `manutencoes` | `data` | `orderBy desc` | combinado acima | `fetchManutencoes` |
| `manutencoes-legado` | `identificador` | `==` | ID do veículo | `fetchManutencoes` |
| `manutencoes-legado` | `data` | `orderBy desc` | combinado acima | `fetchManutencoes` |
| `atividades` | — | LIST | todos | `useAtividade` |
| `atividades/{id}/checklist_saida` | — | LIST | todos do pai | `getChecklistSaidaItens` |
| `motoristas`, `motivos`, `bombas`, `veiculos` | — | LIST | todos | serviços correspondentes |

Fallbacks sem `orderBy` existem para combustível e manutenções quando o índice/ordenação falha. Não há `where` por `auth.uid` em nenhuma query Firestore do React.

## 11. Inventário de writes

| Coleção | Função/arquivo | Dados e origem | `auth.uid` participa? | Validação/manipulabilidade |
|---|---|---|---:|---|
| `00-autorizados` | register/update em `functions/adminApi.ts` | nome/perfil do formulário; timestamps servidor | token identifica solicitante, alvo por email | middleware `adm2`; servidor normaliza perfil, mas alvo vem do request/Auth |
| `03-combustivel` | `saveCombustivel` | formulário normalizado; ID data+email | ❌ | valida tipos parcialmente; usuário controla valores |
| `03-combustivel` + `bombas/diesel_patio` | `saveCombustivelAndUpdateDieselPatio` | formulário + estoque anterior | ❌ no documento | transação; QA/LF e demais dados vêm da UI |
| `03-combustivel` | `updateBombaAndMaybeLog` | campos derivados do patch da bomba | ❌ | patch/ID da interface |
| `03-combustivel` | API POST | `req.body` + UID forçado | ✅ | corpo arbitrário, UID sobrescrito |
| `03-combustivel` | API PUT | `req.body`, merge | usado para autorização | corpo arbitrário; ID da URL |
| `03-combustivel` | API DELETE | ID da URL | claim admin | delete protegido por claim no servidor |
| `03-combustivel` | páginas de Frota | espelho de abastecimento externo | ❌ | formulário; duas escritas não atômicas |
| `bombas` | `updateBombaAndMaybeLog` | `patch` da DataGrid | ❌ | validação de existência; campos do patch manipuláveis |
| `veiculos` | `createVeiculo` | formulário normalizado | ❌ | checa ID existente; `setDoc` completo |
| `veiculos` | páginas de Frota | ativo, KMs, placa/extra, timestamp | ❌ | valida números no frontend; ID da linha |
| `01-placas` | `CadastroVeiculoForm` | placa/extra/km | ❌ | validação frontend |
| `obras` | `useObras.addObra` | nome/local/aka | ❌ | unicidade `aka` por LIST frontend |
| `obras` | edição/delete genéricos | formulário/ID da linha | ❌ | confirmação/validação frontend |
| `notas-categorias` | `CadastroBasicoForm` e edição/delete | nome/descrição/timestamps | ❌ | valores e ID da interface |
| `notas-fornecedores` + índice + metadata | funções transacionais | formulário + número calculado | ❌ | transação; LIST prévio fora da transação para máximo/usados |
| `notas-fornecedores` | delete genérico | ID da linha | ❌ | não remove índice associado |
| `manutencoes` | páginas de Frota | relações, valores, data, status e textos do formulário | ❌ | validação frontend; IDs relacionais manipuláveis |
| `manutencoes*`/`03-combustivel` | painel de detalhe | field path, valor ou deleteField | ❌ | UI exige claim admin, SDK recebe alvo dinâmico |
| `users/{uid}` | `usePerfil.updateEmail` | novo email gravado em `displayName` | ✅, no path | reautenticação disponível, mas não forçada dentro da função |
| fornecedores/índice/metadata | script backfill | dados existentes e números calculados | Admin SDK | operação manual privilegiada em batches |

Contagem estática: **39 instruções primitivas de escrita Firestore** no fonte (`src`, `functions`, `scripts`, excluindo `functions/lib` gerado), contando cada `set/update/delete/add` em transação/batch separadamente. A contagem não equivale a 39 fluxos de usuário: uma transação pode executar várias instruções e uma instrução pode ser chamada repetidamente. Há ainda writes de Authentication (criar, atualizar, excluir usuários e claims).

## 12. Itens não conclusivos

## Pontos que precisam de confirmação

1. Se `firestore.rules` e `storage.rules` desta cópia são exatamente as versões implantadas. Com as regras Firestore locais, a maioria das coleções não tem `allow` e seria negada por padrão.
2. O schema real e a população atual das coleções; campos dinâmicos/legados podem existir além dos acessados explicitamente.
3. Se `CadastroVeiculoForm`/`01-placas`, `useAdm2Authorization` e o endpoint genérico POST/DELETE de usuários ainda são alcançados por algum consumidor fora das rotas analisadas.
4. O formato concreto de cada `storagePath`. O código aceita o caminho salvo no documento; as rules mostram apenas `checklists/saidas/{atividadeId}/{fileName}`.
5. Se documentos de `03-combustivel` antigos contêm `uid`, e quais foram criados por API versus SDK direto.
6. Se `uid`, `admin`, `adm1` e `adm2` possuem convenção operacional externa não documentada no repositório.
7. Se usuários “Motorista” deveriam usar este React. A UI descreve esse perfil, mas `PrivateRoute` rejeita quem não tenha `adm1` nem `adm2`.
8. Se alterações de email são permitidas operacionalmente e como `00-autorizados/{email}` deve ser migrado.
9. Se deletes de fornecedor devem remover índice numérico e atualizar contador; o fluxo atual não permite concluir a intenção.
10. Quais campos a grade de bombas efetivamente torna editáveis em produção e se há documentos além de `diesel_patio`.
11. Não foi possível validar índices compostos existentes; o código possui fallbacks quando queries ordenadas falham.
12. A auditoria não avaliou dados reais, IAM, configuração do console, providers Auth habilitados, App Check, logs, deploys ou contas de serviço.

---

**Resultado de cobertura:** busca global realizada em `src/`, `functions/`, `scripts/`, configurações e regras, excluindo dependências, builds e código compilado duplicado. Não foram encontrados `onSnapshot`, `collectionGroup`, uploads, deletes de Storage ou recuperação de senha. Apenas este relatório foi criado pela auditoria.
