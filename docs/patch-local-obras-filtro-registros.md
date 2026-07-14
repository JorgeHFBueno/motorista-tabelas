# Patch: Local das obras e filtro de registros

## Objetivo

Implementar dois ajustes na aplicação Web/React:

- reutilizar em cadastros de obras o mesmo campo `Local` usado em `/combustivel/novo`;
- adicionar em `/registros` o filtro visual `Saídas/Chegadas`, `Saídas`, `Chegadas`.

## Funcionamento anterior

Em `/combustivel/novo`, o campo `Local` era um `Autocomplete` do Material UI com `freeSolo`, usando `DESTINOS_OPTIONS` de `src/constants/combustivel.ts`. O texto digitado era salvo em `values.local` via `onInputChange`, sem obrigar que o valor existisse na lista, e no submit era normalizado com `trim()`.

Em `/cadastros` e `/cadastros/editar/obras`, o campo visual `Local` era um `TextField` simples. Ele salvava em `local`, enquanto `Sinônimo` era salvo em `aka`. O campo `descricao` não era usado nos formulários de obras.

Em `/registros`, os documentos eram carregados da coleção `atividades` pelo hook `useAtividade`. A página usava filtragem local em memória e o `DataGrid` para a listagem. O código já usava `tipo` para identificar movimentações e o botão `Ver checklist` era exibido somente quando `tipo` era `saida` e havia metadados de checklist. Não havia exportação ou PDF nessa página.

## Funcionamento implementado

Foi criado `src/components/LocalAutocomplete.tsx`, que encapsula o mesmo `Autocomplete` com:

- `freeSolo`;
- opções vindas de `DESTINOS_OPTIONS`;
- atualização por `onInputChange`;
- seleção por clique/teclado conforme comportamento nativo do MUI;
- apresentação, pesquisa, navegação e limpeza equivalentes ao campo de `/combustivel/novo`.

O componente foi reutilizado em:

- `src/pages/CombustivelNovoPage.tsx`;
- `src/components/CombustivelForm.tsx`;
- `src/components/ObrasSection.tsx`;
- `src/components/CadastroEditModal.tsx`.

Não foi criada segunda lista de localidades.

## Persistência de obras

No cadastro de obras, o formulário continua salvando:

- `nome`;
- `local`;
- `aka`;
- demais campos já existentes no fluxo.

Na edição de obras, o valor inicial vem de `editing?.local ?? ''`. Documentos antigos sem `local` abrem com campo vazio. O formulário não usa `descricao` como fallback de `local`.

O campo `Sinônimo` segue visualmente como `Sinônimo` e persiste em `aka`. O termo `aka` não foi exposto na interface.

## Validação do autocomplete

Como `/combustivel/novo` permite `freeSolo`, obras também permitem digitar e salvar uma localidade fora da lista. A restrição de escolha da lista não foi adicionada.

Obras continuam exigindo `local` preenchido, preservando a validação existente do cadastro/edição de obras. A normalização final continua sendo `trim()` antes de persistir.

## Filtro de registros

O filtro foi adicionado em `/registros` com os valores visuais exatos:

- `Saídas/Chegadas`;
- `Saídas`;
- `Chegadas`.

Os valores internos são:

- `todos`;
- `saida`;
- `chegada`.

A opção inicial é `Saídas/Chegadas`, preservando a listagem conjunta anterior.

## Identificação de saídas e chegadas

A diferenciação é feita pelo campo `tipo` dos documentos da coleção `atividades`.

Foi adicionada a função local `normalizarTipoRegistro`, que aplica `trim()`, `toLowerCase()`, normalização Unicode `NFD` e remoção de diacríticos. Com isso, variações como `saida`, `saída`, `Saida`, `SAIDA`, `chegada`, `Chegada` e `CHEGADA` são tratadas de forma segura sem modificar documentos existentes.

Registros com tipo desconhecido:

- aparecem em `Saídas/Chegadas`, preservando o comportamento anterior;
- não aparecem em `Saídas`;
- não aparecem em `Chegadas`.

## Integração com filtros, paginação e checklist

O filtro de tipo é aplicado localmente sobre os registros já carregados, seguindo o padrão atual da página.

A base filtrada é usada na aba Geral, nos gráficos e no resumo híbrido. Assim, o filtro de tipo intersecta com os filtros de período já existentes nas abas de gráficos e híbrido.

Ao trocar o tipo, a paginação controlada do `DataGrid` volta para a primeira página. O contador exibido reflete a base filtrada por tipo.

As mensagens vazias foram ajustadas para:

- nenhuma saída;
- nenhuma chegada;
- nenhum registro.

O botão `Ver checklist` continua dependente de saída reconhecida e metadados de checklist. A alteração não carrega subcoleções de checklist na listagem e não altera a rota `/registros/:atividadeId/checklist`.

## Exportações, PDF e índices

Não foi encontrada exportação ou geração de PDF em `src/pages/RegistrosPage.tsx`.

Como a filtragem de registros continua local, nenhum índice novo do Firestore é necessário.

## Arquivos modificados

- `src/components/LocalAutocomplete.tsx`;
- `src/pages/CombustivelNovoPage.tsx`;
- `src/components/CombustivelForm.tsx`;
- `src/components/ObrasSection.tsx`;
- `src/components/CadastroEditModal.tsx`;
- `src/pages/RegistrosPage.tsx`;
- `docs/patch-local-obras-filtro-registros.md`.

## Testes executados

- `npx.cmd tsc --noEmit`: passou.
- `node_modules\.bin\eslint.cmd src\components\LocalAutocomplete.tsx src\pages\CombustivelNovoPage.tsx src\components\CombustivelForm.tsx src\components\ObrasSection.tsx src\components\CadastroEditModal.tsx src\pages\RegistrosPage.tsx`: passou.
- `npm.cmd run build`: passou.

## Resultado do lint global

`npm.cmd run lint` foi executado e falhou por problemas já existentes fora do escopo, incluindo `dev-dist`, `functions`, `visual-identity-export` e vários arquivos não modificados. O lint focado nos arquivos alterados passou.

## Limitações conhecidas

Não há script de testes automatizados em `package.json`; portanto, não havia suíte `npm test` disponível para executar.

Não foi feita validação manual em navegador, Firestore real, desktop ou celular nesta execução.
