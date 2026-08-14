# Validação da nova versão das Firebase Security Rules

Data da validação: 2026-08-11  
Escopo: análise estática dos apps React e Flutter, implementação local de Firestore/Storage Rules e testes nos emuladores.  
Não realizado: deploy, acesso à produção, alteração de dados remotos ou alteração de código React/Flutter.

## Resultado executivo

- Firestore: 80/80 testes aprovados.
- Storage: 9/9 testes aprovados.
- Sintaxe/compilação: `firestore.rules` e `storage.rules` carregadas com sucesso pelos emuladores.
- Fluxos atômicos: batch real de checklist, transação de atividade/quilometragem e transação de combustível+bomba+veículo+chamado aprovados; variantes inválidas foram negadas atomicamente.
- Política final: default deny; acesso operacional condicionado a perfil ativo em `00-autorizados`; administração global por `adm2`; operações genéricas destrutivas de manutenção/combustível por custom claim `admin`.

## Arquivos analisados

- `FIREBASE_AUDIT_REACT.md` (integral).
- `App/MotoristaV2_MKI/FIREBASE_AUDIT_FLUTTER.md` (integral, no projeto irmão).
- `firestore.rules`, `storage.rules` e `firebase.json` anteriores.
- Código React/Functions e código Flutter relacionado às coleções, batches, transações, Auth, FCM e Storage.

## Rules antigas versus novas

### Firestore anterior

As Rules anteriores tinham somente:

- leitura de `00-autorizados/{email}` pelo próprio usuário ou por perfil `adm1`/`adm2`, sem escrita cliente;
- leitura de `atividades` e checklist apenas por `adm1`/`adm2`, sem escrita;
- `03-combustivel` legível/criável por qualquer autenticado, update pelo proprietário indicado no documento ou claim `admin`, delete por claim `admin`;
- nenhuma regra explícita para as demais coleções usadas pelos apps (negação implícita).

### Firestore novo

- Normaliza o claim de e-mail com `.lower()` antes do lookup do perfil.
- Exige documento em `00-autorizados` e `ativo != false` para dados operacionais.
- Distingue usuário operacional, `adm1`, `adm2` e custom claim `admin`.
- Define permissões explícitas por coleção e mantém `match /{document=**}` negando tudo que não foi reconhecido.
- Torna atividades/checklists históricos imutáveis no cliente.
- Limita veículo a quilometragem e bomba aos quatro campos do abastecimento para usuário comum.
- Restringe configurações/cadastros globais a `adm2`.
- Restringe autoria de checklist, combustível (quando UID existe), notificações, leituras e FCM tokens.
- Mantém Admin SDK fora do modelo de autorização das Rules.

### Storage anterior

- Apenas `adm1`/`adm2` podiam ler fotos de checklist.
- Toda escrita era negada.
- Não havia regra default deny explícita.

### Storage novo

- Qualquer perfil autorizado e ativo pode ler fotos de checklist.
- Perfil autorizado e ativo pode criar, sem sobrescrever, arquivos `image/*` de até 5 MiB.
- Update, delete, arquivos não-imagem, arquivos acima do limite, perfis ausentes/inativos e caminhos desconhecidos são negados.

## Permissões removidas ou endurecidas

- Autenticado sem perfil autorizado deixou de ler/criar combustível.
- Perfil `ativo=false` perdeu todo acesso operacional, inclusive Storage.
- Update direto de combustível por simples campo `uid` deixou de existir; update/delete genéricos agora exigem claim `admin`.
- Listagem de `00-autorizados` é negada a clientes, inclusive `adm2`.
- Escrita direta em `00-autorizados` é sempre negada ao SDK cliente.
- Update/delete de atividades e checklist são sempre negados ao cliente.
- Writes de motorista/motivo e deletes de veículos/bombas/chamados/configurações/notificações são negados.
- Notificação não pode trocar `motoristaUid`, `chamadoId`, `tipo` ou `destinatarioPerfil`.
- Leitura de notificações por usuário comum não pode ser listagem global.
- Storage não permite sobrescrita, update ou delete.

## Permissões mantidas por compatibilidade

- Leitura ampla de veículos, obras, atividades, combustível, bombas, chamados e configurações por perfil operacional ativo, pois os apps fazem queries/listagens globais.
- Atividade pode ser criada sem `motoristaUid`, pois o Flutter real grava autoria em `motorista`; exigir o novo campo quebraria saída/chegada/checklist.
- Combustível pode ser criado sem `uid`, pois fluxos React legados não incluem esse campo; se `uid` ou `motoristaUid` existir, precisa corresponder ao Auth UID.
- Chamado pode ser criado por qualquer autorizado sem vínculo rígido de `motorista`, porque os fluxos atuais passam esse valor como argumento e os modelos legados variam.
- Chamados preservam updates dos campos operacionais observados: `mntntInfrmd`, `montanteInicial`, `dfrncl`, `status`, `atualizadoEm`, `updatedAt`.
- Leitura global de combustível foi mantida devido às consultas de último registro e telas de histórico.
- `Versionamento/app` permanece legível por qualquer autenticado para não impedir a checagem inicial do app antes do perfil operacional.
- `users/{uid}.displayName` permanece atualizável pelo próprio UID para compatibilidade React.

## Testes executados

Comando local:

```text
npm run test:rules
```

Ferramentas: Firebase Emulator Suite (`firebase-tools` 13.35.1), `@firebase/rules-unit-testing` 4.0.1, Node test runner, Firestore Emulator e Storage Emulator com projeto exclusivamente demo `demo-firebase-rules`.

Cobertura Firestore (80 testes):

- não autenticado, autenticado sem perfil, normal, adm1, adm2, claim admin e inativo;
- lookup lowercase com claim de e-mail contendo maiúsculas;
- perfil próprio, listagem e writes de `00-autorizados`, incluindo FCM token próprio/estrangeiro/caminho não normalizado;
- veículos, atividades, checklist, combustível, bombas, chamados, configurações, notificações e leituras;
- obras, categorias, fornecedores, índice/metadata auxiliar, motoristas, motivos e manutenções;
- default deny;
- batches/transações Flutter completos, positivos e atomicamente negativos.

Cobertura Storage (9 testes):

- leitura e create de imagem autorizados;
- não-image e >5 MiB negados;
- overwrite/update e delete negados;
- perfil ausente e inativo negados;
- claim de e-mail com maiúsculas encontra perfil lowercase.

## Testes aprovados

- Execução final: 89/89.
- Firestore: 80/80.
- Storage: 9/9.
- Rules carregadas/compiladas pelos dois emuladores.

## Testes falhos

- Execução final: nenhum.
- Durante o desenvolvimento, o teste de overwrite do Storage identificou que apenas `allow create` não era suficiente no runtime testado. A regra foi endurecida com `resource == null`; a repetição passou.
- Uma execução inicial falhou por montagem incorreta do token simulado (`uid` em vez de `sub` implícito pelo helper). Era falha da suíte, não das Rules, e foi corrigida.

## Operações do React potencialmente quebradas

1. As páginas de frota leem `manutencoes`, `notas-categorias` e `notas-fornecedores`. Para usuário normal/adm1 essas leituras agora falham; somente `adm2` ou, em manutenção, claim `admin` pode ler. Se `/frota` for destinada a usuários comuns, o carregamento precisa ser segmentado ou a política revista.
2. Edição ampla de veículo em `FrotaVeiculosPage`/`FrotaVeiculoDetalhesPage` altera `ativo`, `quilometragemInicial`, placa/extra e outros campos. Funciona apenas para `adm2`; usuário comum só atualiza `quilometragemUltima` e `dataUltimaAtualizacao`.
3. Criação de manutenção e log auxiliar de combustível nas páginas de frota exige `adm2` para a manutenção. O registro de combustível pode ser criado por autorizado, mas a operação não é batch: uma falha na manutenção pode ocorrer depois de outra escrita já concluída no fluxo React.
4. CRUD de obras/categorias/fornecedores e suas transações de índice/contador funcionará apenas se o usuário for efetivamente `adm2`; proteção apenas pela rota não basta.
5. Editores genéricos de manutenção e combustível exigem custom claim `admin`; ser apenas `adm2` não concede update/delete genérico.
6. Qualquer acesso cliente não enumerado (incluindo coleções legadas desconhecidas) passa a falhar explicitamente.

## Operações do Flutter potencialmente quebradas

1. `AutorizadosRepository.findByEmail` usa `.doc(email)` sem `trim().toLowerCase()`. O lookup interno das Rules usa lowercase e foi testado, porém a leitura explícita feita pelo Flutter pode mirar um ID com capitalização divergente e retornar documento inexistente.
2. `NotificationService._saveToken` também usa `.doc(email)` sem normalização. Se `FirebaseAuth.currentUser.email` contiver maiúsculas, a gravação no caminho com maiúsculas será corretamente negada, pois FCM token só pode ficar sob o perfil lowercase correspondente.
3. Leitura/listagem de categorias e fornecedores por usuário Flutter comum não foi observada como fluxo operacional principal; se passar a existir, será negada porque a política solicitada reserva essas coleções a `adm2`.
4. `dev_obras_locais` permanece somente `adm2`; qualquer inicialização demo feita por usuário comum falhará.
5. Registros históricos existentes sem `motoristaUid` podem ser lidos, mas não passam a ter ownership retroativo. A compatibilidade foi mantida sem reescrever dados.

Os batches/transações de checklist, atividade/quilometragem e abastecimento atuais foram simulados e aprovados integralmente para usuário autorizado.

## Confirmação do lookup de e-mail

O lookup efetivo implementado é:

```text
00-autorizados/{request.auth.token.email.lower()}
```

e não o valor cru `00-autorizados/{request.auth.token.email}`. A suíte provou que um claim `User@Example.COM` acessa o perfil `user@example.com` tanto no Firestore quanto no Storage.

O projeto React normaliza IDs administrativos com `trim().toLowerCase()`. Já o Flutter não normaliza nos dois pontos citados acima. Portanto existe possibilidade concreta de divergência de capitalização no código, embora o comportamento real do provedor Auth para as contas existentes não tenha sido consultado (produção não foi acessada). Nenhuma migração ou alteração estrutural de dados foi feita silenciosamente.

## Cloud Functions / Admin SDK

- As Functions HTTP administrativas e de combustível usam Admin SDK e não dependem de Firestore Rules.
- O trigger de push e a remoção de tokens inválidos também usam Admin SDK.
- Os writes administrativos em `00-autorizados` continuam possíveis pelo backend, embora sejam sempre negados ao SDK cliente.
- Nenhum teste tentou representar Admin SDK como cliente autorizado, pois isso produziria uma premissa incorreta.

## Pontos que ainda precisam de confirmação

- Se todos os e-mails retornados pelo Firebase Auth real estão lowercase; confirmar sem mudar dados antes de liberar as Rules.
- Se a tela React `/frota` deve ser acessível a usuário comum/adm1 apesar de depender de categorias, fornecedores e manutenções administrativas.
- Se `adm1` possui alguma capacidade administrativa pretendida não descrita nas auditorias.
- Se atividades devem ganhar futuramente `motoristaUid` obrigatório; hoje o Flutter grava `motorista`.
- Se todo combustível novo pode passar a exigir `uid`; hoje há criação React legítima sem UID.
- Se chamado novo deve exigir `motorista == auth.uid`; dados/modelos atuais ainda usam campos legados e valores especiais.
- Limite definitivo e política de retenção das fotos; foi adotado 5 MiB como limite local explícito.
- Se documentos legados possuem campos/tipos não cobertos pelos modelos auditados.

## Recomendações para a segunda fase de endurecimento

1. Normalizar e-mail no Flutter antes de qualquer caminho `00-autorizados/{email}` e adicionar teste de integração Auth→perfil→FCM.
2. Adicionar `motoristaUid` obrigatório e imutável a atividades novas após atualizar ambos os apps e planejar dados legados.
3. Tornar `uid` obrigatório em todo combustível criado por cliente; encaminhar criações legadas React pela API/Admin SDK.
4. Validar schemas, tipos, enums, timestamps e conjuntos de chaves permitidas em creates/updates, além de apenas autoria/campos alterados.
5. Restringir queries globais e separar visões administrativas de operacionais, principalmente manutenção, combustível e notificações.
6. Mover criação/atualização complexa de chamados/notificações para backend idempotente, reduzindo autoria e conteúdo controlados pelo cliente.
7. Revisar a atomicidade do fluxo React manutenção+combustível e transformar em Function ou batch compatível.
8. Avaliar App Check, retenção de fotos e validação adicional de extensão/path após estabilizar os clientes.
9. Executar a suíte em CI para toda alteração de Rules, sempre com project ID demo.

## Warnings da validação local

- `npm install` reportou 48 vulnerabilidades transitivas (5 low, 18 moderate, 21 high, 4 critical); não foi executado `npm audit fix` para evitar alterações fora do escopo.
- O Firebase CLI 15 exigia Java 21; a suíte foi fixada em `firebase-tools` 13.35.1, compatível com o Java 17 instalado.
- Node emitiu aviso de depreciação transitiva de `punycode`.
- O Firestore Emulator registra `SIGKILL` durante o encerramento coordenado do `emulators:exec`; o comando final encerrou com código 0 e todos os testes passaram.

## Declaração de segurança operacional

Não foi feito deploy. Não houve acesso a produção, alteração de dados Firebase, execução de scripts administrativos, chamada de Cloud Functions remotas ou alteração de código React/Flutter.
