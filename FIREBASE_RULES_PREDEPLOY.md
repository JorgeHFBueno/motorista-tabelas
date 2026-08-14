# Firebase Rules — validação pré-deploy

Data: 2026-08-11  
Escopo: validação local. Nenhum deploy, acesso à produção, alteração de dados Firebase ou alteração dos apps React/Flutter foi realizado nesta tarefa.

## Estado das Rules

- **Firestore Rules:** nova versão preservada em `firestore.rules`, com perfil ativo em `00-autorizados`, papéis `adm2`/claim `admin`, restrições por coleção e default deny.
- **Storage Rules:** versão anterior restaurada exatamente a partir de `HEAD:storage.rules`.
- `git diff -- storage.rules` não produz saída e `storage.rules` não aparece em `git status`: não existem outras mudanças de Storage pendentes.
- `git diff -- firestore.rules` confirma a nova política (547 inserções e 24 remoções em relação ao `HEAD`). Nenhum erro objetivo foi encontrado; `firestore.rules` não foi alterado nesta tarefa.

## Testes Firestore

Comando executado:

```text
npm run test:rules:firestore
```

- Emulador iniciado: somente Firestore, com project ID demo `demo-firebase-rules`.
- Testes executados: **80**.
- Testes aprovados: **80**.
- Testes falhos: **0**.
- Compilação das Rules: aprovada pelo Firestore Emulator.
- Batch realista de atividade + itens de checklist + atualização de quilometragem: aprovado.
- Variante inválida do batch: negada atomicamente, sem escrita parcial.
- Transação de atividade + quilometragem: aprovada.
- Transação de combustível + bomba + veículo + chamado: aprovada.
- Variante com UID de combustível divergente: negada atomicamente.
- Nenhum teste ou emulador de Storage foi executado nesta etapa.

## Compatibilidade React

### Combustível

- `PrivateRoute` exige perfil `adm1` ou `adm2`.
- `adm1` é encaminhado ao fluxo `/combustivel/novo`; `adm2` alcança lista e criação.
- As Rules permitem leitura/criação operacional por perfil ativo. Update/delete direto genérico exige custom claim `admin`; operações via Cloud Functions/Admin SDK não dependem das Rules.
- Compatibilidade preservada para criação React sem `uid`; quando `uid` é enviado, deve corresponder ao UID autenticado.

### Frota

Rotas em `src/App.tsx`:

- `/frota`: linha 66.
- `/frota/:placa`: linha 67.

Política de navegação atual:

- **user normal:** não acessa. `PrivateRoute.tsx:41` exige `profile.adm1 || profile.adm2`.
- **adm1:** não acessa. `adm1RouteAuthorization.ts:1` permite a adm1 somente `/` e `/combustivel/novo`; as rotas de frota são redirecionadas para `/` por `PrivateRoute.tsx:53-61`.
- **adm2:** acessa ambas as rotas.
- **custom claim admin:** não é exigida para acessar a tela. A claim isolada também não concede navegação: o usuário ainda precisa passar pelo perfil adm1/adm2, e adm1 é bloqueado na frota. Na prática, o acesso é adm2.
- A claim `admin` é usada para ações genéricas de edição/exclusão nos painéis de detalhe (`AuthContext.tsx:71`, `FrotaVeiculoDetalhesPage.tsx:248,1222`). Adm2 sem a claim pode navegar, ler e criar manutenção, mas não recebe update/delete genérico.

Comparação com as novas Rules:

- `notas-categorias`: adm2.
- `notas-fornecedores`: adm2.
- `manutencoes`: leitura/create adm2; update/delete genérico claim admin.
- `manutencoes-legado`: leitura adm2/admin; update/delete claim admin.

**Conclusão:** a combinação é compatível com a navegação real atual, pois somente adm2 chega às telas e adm2 possui todas as leituras usadas por elas. As ações genéricas mostradas apenas com claim `admin` também coincidem com as Rules. Atenção apenas operacional: conceder claim `admin` a um perfil normal não abre a rota; e remover o bloqueio de frota para user/adm1 no futuro exigirá revisar essas permissões.

### Cadastros

- As rotas de cadastro ficam sob `PrivateRoute`; adm1 é bloqueado fora de `/` e `/combustivel/novo`, logo o acesso atual efetivo é adm2.
- Obras, veículos, categorias, fornecedores, índice e metadata exigem adm2 nas Rules, compatível com essa navegação.
- Motoristas/motivos continuam somente leitura para cliente; não foi encontrado write cliente legítimo nas auditorias.

### Manutenção

- A frota consulta `manutencoes`, `manutencoes-legado`, categorias e fornecedores.
- Adm2 pode ler/criar manutenção.
- Update/delete genérico exige claim `admin`, em acordo com os controles visuais do detalhe.
- User normal e adm1 não chegam à tela pela navegação atual.

### Usuários

- Administração de Firebase Auth e `00-autorizados` é feita pelas APIs/Functions com Admin SDK.
- Writes diretos do cliente em `00-autorizados` permanecem negados, como desejado.
- Cloud Functions/Admin SDK ignoram Firestore Rules, portanto o fluxo administrativo não depende de permissões cliente.

## Compatibilidade Flutter

### Saída

- Criação de atividade e atualização de `quilometragemUltima`/`dataUltimaAtualizacao` foram simuladas juntas e aprovadas.

### Chegada

- A transação de atividade + quilometragem foi aprovada.

### Checklist

- O batch de atividade + múltiplos itens + veículo foi aprovado.
- `criadoPorUid` divergente é negado e invalida o batch inteiro.
- Update/delete históricos permanecem negados.

### Combustível

- Create autorizado e vínculo de `uid` quando presente foram aprovados.
- A transação completa com bomba, veículo e chamado foi aprovada.
- Update/delete direto para usuário comum continuam negados; claim admin foi validada.

### Bombas

- Usuário operacional pode alterar somente `montanteAtual`, `estoqueAtual`, `ultimoAbastecimento` e `ultimoFrentista`.
- Adm2 pode fazer manutenção administrativa.

### Chamados

- Create e updates dos campos operacionais foram aprovados.
- `motorista`, `tipo` e `data` são imutáveis em update; delete é negado.

### Notificações

- Create próprio, get próprio e update preservando identidade foram aprovados.
- Listagem global é adm2; leituras usam o UID autenticado.
- `motoristaUid`, `chamadoId`, `tipo` e `destinatarioPerfil` não podem ser trocados.

### Configurações

- Leitura operacional aprovada.
- Escrita somente adm2, limitada aos três IDs conhecidos e com `atualizadoPor == auth.uid`.

## Normalização de e-mail no Flutter

Os dois pontos foram reconfirmados sem alterar o Flutter:

1. `App/MotoristaV2_MKI/lib/repositories/autorizados_repository.dart`
   - função `findByEmail`: linha 12;
   - usa `.doc(email)` na linha 15;
   - não aplica `trim().toLowerCase()`.
2. `App/MotoristaV2_MKI/lib/services/notification_service.dart`
   - função `_saveToken`: linha 53;
   - usa `.collection('00-autorizados')` na linha 55 e `.doc(email)` na linha 56;
   - não aplica `trim().toLowerCase()`.

As Rules procuram o perfil usando `request.auth.token.email.lower()`, e os IDs administrativos do projeto são lowercase. Portanto a normalização no Flutter continua necessária para eliminar a possibilidade de o SDK mirar `00-autorizados/{email}` com capitalização divergente. Nenhum patch Flutter foi feito agora.

## Pendências

- **Normalização Flutter:** aplicar `trim().toLowerCase()` em `AutorizadosRepository.findByEmail` e `NotificationService._saveToken` numa tarefa separada, com testes Flutter.
- **Frota:** compatível com a navegação atual somente porque o acesso efetivo é adm2. Se user normal ou adm1 passarem a acessar `/frota`, as leituras de categorias, fornecedores e manutenções serão negadas pelas Rules e a política precisará ser revista.
- Confirmar antes do deploy que todos os perfis destinados à frota possuem `adm2` ativo.
- Não há pendência de Storage nesta mudança: o arquivo foi restaurado e seu diff está vazio.

## Arquivos modificados

Resultado relevante exato de `git status --short` após a restauração:

```text
 M dev-dist/sw.js
 M firestore.rules
 M package-lock.json
 M package.json
 M src/components/CombustivelRouteGuard.tsx
 M src/components/PrivateRoute.tsx
 M src/main.tsx
 M src/pwa/pwaClient.ts
 M vite.config.ts
?? FIREBASE_AUDIT_REACT.md
?? FIREBASE_RULES_VALIDATION.md
?? tests/
```

`storage.rules` não aparece porque foi restaurado. `FIREBASE_RULES_PREDEPLOY.md` passa a ser mais um arquivo novo após a criação deste relatório.

As mudanças React listadas já estavam presentes no working tree antes desta tarefa e foram apenas inspecionadas; nenhum código React foi editado agora. O projeto Flutter está fora deste repositório Git, foi acessado somente para leitura e nenhum arquivo Flutter foi alterado.

## Confirmação operacional

- Deploy realizado: **NÃO**.
- Dados Firebase alterados: **NÃO**.
- Produção acessada: **NÃO**.
- `firestore.rules` alterado nesta tarefa: **NÃO**.
- `storage.rules` restaurado: **SIM**.
