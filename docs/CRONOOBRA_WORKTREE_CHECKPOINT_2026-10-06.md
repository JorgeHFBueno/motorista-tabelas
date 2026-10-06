# CronoObra — Worktree Checkpoint 2026-10-06

## 1. Baseline

- Branch: `main`.
- Commit anterior: `06dbe80` — `fix: repair CronoObra child rows and daily grid`.
- O baseline contém a correção visual das linhas filhas e da grade diária. Este checkpoint preserva o trabalho realtime que ficou fora daquele commit.

## 2. Objetivo

Consolidar a atualização em tempo real da projeção `monday-obras`, seus testes e a documentação técnica, sem misturar caches, prompts de execução ou saídas geradas.

## 3. Arquivos preservados

### `src/features/cronograma-obras/data/source/rawFirestoreCronogramaDataSource.ts`

- Finalidade: fonte Firestore da página CronoObra.
- Alteração: adiciona `subscribe`, baseado em `onSnapshot`, convertendo `docChanges()` de `monday-obras` para contratos adaptados; mantém `carregar` para a leitura inicial e reexporta a reconciliação incremental.
- Relação: origem raw → modelo de contrato e LOTEs do CronoObra.
- Estado: concluído no escopo deste checkpoint; requer validação visual e operação real do listener.
- Impacto: a página pode receber alterações externas sem polling; não escreve no Firestore.
- Deploy: necessário para disponibilizar a alteração frontend, mas não executado neste checkpoint.

### `src/features/cronograma-obras/data/source/mondayObrasRealtime.ts`

- Finalidade: aplicar mudanças de documentos-pai a um `Map` de contratos.
- Alteração: `added`/`modified` substituem somente o contrato afetado; `removed` elimina o contrato e seus LOTEs derivados.
- Estado: concluído e coberto por teste de reconciliação.
- Riscos: depende de a página manter o estado canônico e de o listener ser desmontado corretamente.

### `tests/cronograma-integration.test.ts`

- Finalidade: validar a fonte realtime read-only, cleanup e reconciliação de contratos/LOTEs.
- Estado: teste válido de integração estática/domínio.

### `tests/monday-sync-ui.test.ts`

- Finalidade: garantir que o fluxo administrativo de sincronização continue aguardando a convergência do listener realtime.
- Estado: teste válido de contrato da UI.

### `docs/CRONOOBRA_HISTORICO_E_ARQUITETURA.md`

- Finalidade: histórico canônico de manutenção.
- Alteração: registra o fluxo MK6C.5 `Monday → webhook → projetor → monday-obras → onSnapshot → UI`.
- Estado: documentação válida e concluída.

## 4. Realtime / Monday

- Origem: coleção Firestore `monday-obras`, projetada a partir do Monday.
- Listener: `onSnapshot(collection(...))` em `RawFirestoreCronogramaDataSource.subscribe`.
- Atualização: `docChanges()` adapta cada contrato alterado; a reconciliação troca apenas o pai afetado.
- Batching: o callback recebe o lote de mudanças produzido pelo snapshot; não há escrita ou polling.
- Status: a adaptação existente deriva o status do contrato e dos LOTEs; o teste verifica reclassificação.
- Webhook, OAuth e scheduler: não foram alterados neste conjunto restante.
- Functions/região/secrets: não foram alterados; nenhum valor secreto é necessário no código commitado.

## 5. Pendências conhecidas

- Validação visual em uma página autenticada ainda depende do ambiente de execução.
- Deploy do frontend não foi realizado.
- A suíte CronoObra já possui 11 falhas conhecidas de expectativas antigas de integração/Monday; elas não foram mascaradas nem removidas.

## 6. Testes

- `npx.cmd tsc --noEmit`: executado com sucesso no worktree que contém o listener.
- Suíte CronoObra: executada anteriormente; 40 passaram e 11 falharam nas expectativas preexistentes.
- `git diff --check`: executado sem erros de whitespace.
- Não há evidência de falha nova causada pela reconciliação realtime além das expectativas antigas registradas.

## 7. Arquivos removidos

- `.firebase/hosting.ZGlzdA.cache`: cache gerado, sem valor de fonte.
- `.tmp-cronograma-tests/cronograma-integration.test.js`: saída intermediária do esbuild/teste.
- `.tmp-cronograma-tests/cronograma-obras.test.js`: saída intermediária do esbuild/teste.
- `docs/PROMPT.md`: instrução operacional da sessão, não documentação de produto.

## 8. Segurança

- Nenhum secret, token, bearer credential ou chave privada foi encontrado no conjunto preservado.
- Secrets não foram commitados.
- Tokens não foram documentados.
- Arquivos sensíveis ficaram fora do Git.

## 9. Próximo ponto seguro

Revisar a integração visual do indicador de conexão e executar uma validação autenticada da página. Depois, publicar o frontend somente após confirmação do comportamento do listener e decidir como tratar as 11 expectativas antigas da suíte.
