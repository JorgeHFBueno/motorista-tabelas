# Patch: checklist fotográfico em /registros

## Objetivo

Permitir que usuários autorizados visualizem o checklist fotográfico de registros de saída na aplicação Web/React, sem carregar subcoleções ou imagens na listagem principal de `/registros`.

## Funcionamento anterior

A página `/registros` era implementada em `src/pages/RegistrosPage.tsx` e carregava diretamente todos os documentos da coleção Firestore `atividades` por meio do hook `src/hooks/useAtividade.ts`.

Cada linha da grade usava o ID real do documento como `row.id`, vindo de `doc.id`. Não havia ação específica para checklist de saída nem rota de detalhe vinculada ao registro.

## Funcionamento implementado

A listagem de `/registros` ganhou a ação contextual `Ver checklist` para documentos com:

- `tipo === 'saida'`;
- e `checklistSaidaConcluido === true`, ou `checklistSaidaTotalItens > 0`, ou `checklistSaidaItensComAvaria > 0`.

A ação usa o ID real do documento de `atividades` e monta a URL com `encodeURIComponent`, preservando IDs com espaços e caracteres especiais. A nova tela decodifica o parâmetro antes de consultar o Firestore.

Registros antigos sem campos-resumo de checklist continuam aparecendo normalmente e não disparam leituras extras de subcoleção na tabela.

## Arquivos criados

- `src/pages/ChecklistSaidaPage.tsx`
- `src/services/checklistSaida.service.ts`
- `src/types/checklistSaida.ts`
- `storage.rules`
- `docs/checklist-saida-registros-patch.md`

## Arquivos modificados

- `src/App.tsx`
- `src/pages/RegistrosPage.tsx`
- `src/hooks/useAtividade.ts`
- `src/firebase.ts`
- `firebase.json`
- `firestore.rules`

## Rota criada

```text
/registros/:atividadeId/checklist
```

A rota fica dentro de `PrivateRoute`, portanto reutiliza autenticação e autorização já aplicadas às rotas privadas. Como `/registros` já é bloqueada para perfis `adm1` por `isAdm1RouteRestricted`, a rota filha também segue o mesmo mecanismo.

## Consultas Firestore

Na listagem:

```text
getDocs(collection(db, 'atividades'))
```

Na tela de detalhes:

```text
getDoc(doc(db, 'atividades', atividadeId))
getDocs(collection(db, 'atividades', atividadeId, 'checklist_saida'))
```

Não foram adicionados listeners em tempo real. A tela de detalhes faz leitura pontual do documento principal e uma leitura pontual da subcoleção.

## Recuperação das imagens

Cada item usa `downloadUrl` diretamente quando disponível.

Quando `downloadUrl` está ausente e `storagePath` está preenchido, a tela chama:

```text
getDownloadURL(ref(storage, storagePath))
```

A URL resolvida fica em cache local em memória durante a vida da página, indexada pelo próprio `downloadUrl` ou `storagePath`. A URL recuperada não é gravada automaticamente no Firestore.

Falhas de permissão, arquivo inexistente ou caminho inválido são tratadas no card do item com placeholder de imagem indisponível, sem derrubar a página.

## Interface

A nova página exibe:

- cabeçalho com botão para voltar a `/registros`;
- dados principais da saída: placa, data, km, destino, motivo, motorista, guincho e versão;
- cards de resumo calculados a partir da subcoleção carregada;
- agrupamento por etapa em acordeões;
- cards responsivos para itens, com status textual e visual;
- modal de imagem ampliada com título, etapa, status, observação e opção de abrir original.

Os status são mapeados assim:

- `ok`: OK;
- `avaria`: Avaria;
- `nao_aplicavel`: Não aplicável;
- `nao_informado`: Não informado.

Etapas conhecidas são ordenadas por prioridade e etapas desconhecidas são exibidas em ordem alfabética.

## Regras de segurança

`firestore.rules` foi atualizado para permitir leitura de:

- `00-autorizados/{email}` para o próprio usuário e para perfis autorizados;
- `atividades/{atividadeId}`;
- `atividades/{atividadeId}/checklist_saida/{itemId}`.

As leituras de `atividades` e `checklist_saida` exigem usuário autenticado com documento em `00-autorizados` contendo `adm1 === true` ou `adm2 === true`. Escrita foi negada nesses caminhos para a Web.

`storage.rules` foi criado para permitir leitura de:

```text
checklists/saidas/{atividadeId}/{fileName}
```

com o mesmo critério de perfil autorizado. Escrita foi negada. Os arquivos não foram tornados públicos.

`firebase.json` passou a apontar explicitamente para `firestore.rules` e `storage.rules`.

Nenhum deploy foi executado.

## Tratamento de registros antigos

Registros antigos sem campos-resumo de checklist permanecem compatíveis. A ação `Ver checklist` pode não aparecer nesses registros para evitar consulta individual por linha à subcoleção.

Se a rota for acessada diretamente para um documento existente com subcoleção vazia, a página mostra:

```text
Este registro não possui itens de checklist fotográfico.
```

## Validações executadas

Passou:

```text
node_modules\.bin\eslint.cmd src\pages\ChecklistSaidaPage.tsx src\pages\RegistrosPage.tsx src\hooks\useAtividade.ts src\services\checklistSaida.service.ts src\types\checklistSaida.ts src\firebase.ts
npm.cmd run build
```

Resultado do build: concluído com sucesso. O Vite manteve avisos já conhecidos de chunks grandes e Browserslist desatualizado.

Não passou por falta de configuração no projeto:

```text
npm.cmd run test
```

Resultado: `Missing script: "test"`.

O lint global também foi executado:

```text
npm.cmd run lint
```

Resultado: falhou por problemas preexistentes fora do escopo em `dev-dist`, `functions`, `visual-identity-export` e arquivos antigos. Os arquivos alterados neste patch foram validados separadamente com ESLint e passaram.

## Limitações conhecidas

- Não houve validação manual contra dados reais do Firestore/Storage neste ambiente.
- Registros antigos sem campos-resumo não exibem a ação na listagem, mesmo que possuam subcoleção, para evitar leituras em massa.
- A tela é somente leitura e não edita, exclui ou substitui imagens.
- As imagens não foram incluídas nos PDFs existentes.

## Melhorias futuras

- Inclusão opcional das imagens no PDF.
- Filtros por status do checklist.
- Exibição apenas de itens com avaria.
- Comparação entre checklists de saída e chegada.
- Compactação ou geração de miniaturas das imagens.
- Limpeza de arquivos órfãos no Firebase Storage.
