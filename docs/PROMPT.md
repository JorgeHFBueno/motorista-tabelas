# GIT — Organizar, documentar, commitar e fazer push de TODAS as alterações válidas

## CONTEXTO

Repositório atual:

- branch: `main`
- remote: `origin`
- upstream: `origin/main`
- estado atual: `main` está `ahead 34`
- staging atual: vazio

A auditoria anterior encontrou alterações de múltiplos assuntos no mesmo workspace.

Há mudanças relacionadas a:

### CronoObra / Monday
- `src/features/cronograma-obras/**`
- `src/services/mondayOAuth.ts`
- `src/services/mondaySubitemStatusService.ts`
- `src/services/mondayWebhookProvisionService.ts`
- `functions/monday*.ts`
- `functions/test/monday*.test.mjs`
- `tests/monday-*.test.ts`
- `docs/CRONOOBRA_HISTORICO_E_ARQUITETURA.md`
- partes relacionadas de `functions/index.ts`
- partes relacionadas de `functions/mondaySync.ts`
- partes relacionadas de `package.json`

### Relatório veicular / Frota
- `src/pages/FrotaVeiculoDetalhesPage.tsx`
- `src/services/vehicle-report-core.ts`
- `src/services/vehicle-report-pdf.ts`
- `src/services/vehicle-report.service.ts`
- `functions/vehicleReport.ts`
- `functions/test/vehicleReport.test.mjs`
- `tests/vehicle-report-core.test.ts`

### Rules / testes / documentação geral
- `firestore.rules`
- `tests/rules/rules.test.mjs`
- `README.md`
- `docs/PROMPT.md`

### Arquivos locais/temporários detectados
- `backups/pre-relatorio-periodo-sem-q46-20261001-000000/**`
- `.tmp-*`
- `.firebase/hosting.ZGlzdA.cache`

## OBJETIVO

NÃO parar apenas porque há alterações de assuntos diferentes.

Organizar o estado atual da melhor forma possível em commits coerentes e, ao final, fazer push de TUDO que for válido e versionável.

A tarefa deve terminar com:

- todas as alterações legítimas documentadas;
- todos os arquivos legítimos commitados;
- temporários/artefatos locais fora dos commits;
- working tree limpa ou apenas com arquivos deliberadamente ignorados;
- todos os commits locais enviados para `origin/main`;
- sem force push;
- sem secrets.

IMPORTANTE:

O repositório já está `ahead 34`.

O push final deverá enviar também esses commits locais já existentes, além dos novos commits criados nesta tarefa.

Isso é INTENCIONAL.

---

## 1. AUDITORIA COMPLETA

Executar:

```bash
git status --short
git status -sb
git branch --show-current
git branch -vv
git remote -v
git log --oneline --decorate --graph -40
```

Depois:

```bash
git diff --stat
git diff
```

Classificar TODAS as alterações pendentes por domínio funcional.

Não interromper a tarefa só porque existem múltiplos domínios.

---

## 2. SEGURANÇA — OBRIGATÓRIO

Antes de qualquer staging, procurar por:

- `.env`
- `.env.*`
- `.secret.local`
- tokens
- Client Secret
- Signing Secret
- refresh token
- access token
- Firebase ID token
- chaves privadas
- credenciais
- dumps com dados sensíveis

Pode haver NOMES como:

- `MONDAY_SIGNING_SECRET`
- `MONDAY_OAUTH_CLIENT_SECRET`
- `MONDAY_WEBHOOK_REFRESH_TOKEN`

Isso é permitido.

NÃO pode haver valores reais.

Se encontrar secret real em arquivo rastreável:

1. remover o valor do arquivo;
2. preservar apenas referência/configuração segura;
3. garantir que o arquivo sensível esteja ignorado;
4. NÃO commitar o secret;
5. continuar a tarefa.

Não parar apenas para pedir confirmação se a correção segura for óbvia.

---

## 3. TEMPORÁRIOS / BACKUPS / CACHE

Não commitar artefatos locais sem valor de código-fonte.

Por padrão, excluir:

- `.tmp-*`
- `.firebase/hosting.ZGlzdA.cache`
- artefatos de build;
- logs;
- caches;
- arquivos de execução local.

Para `backups/pre-relatorio-periodo-sem-q46-20261001-000000/**`, auditar antes.

Se for backup local de segurança e não fizer parte do histórico versionado do projeto:

NÃO commitar.

Se necessário, adicionar padrão ao `.gitignore`.

Não apagar backup do disco sem necessidade.

Apenas mantê-lo fora do Git.

---

## 4. DOCUMENTAR O ESTADO ANTES DOS COMMITS

Criar ou atualizar documentação somente quando isso trouxer valor real.

Não criar documentação redundante.

Garantir especialmente que:

`docs/CRONOOBRA_HISTORICO_E_ARQUITETURA.md`

esteja atualizado com o estado validado do CronoObra/Monday.

Para relatório veicular, Rules ou outras alterações:

usar documentação existente se necessário.

Se `docs/PROMPT.md` for apenas scratch/prompt temporário sem valor permanente:

avaliar e excluir do commit.

Se for documentação deliberada do projeto:

commitar no grupo apropriado.

---

## 5. SEPARAR EM COMMITS COERENTES

Criar quantos commits forem necessários.

Preferência de organização:

### COMMIT A — CronoObra / Monday

Incluir apenas mudanças relacionadas a:

- UI CronoObra;
- status/iniciar;
- DEV menu;
- OAuth;
- webhook;
- projector;
- mondaySync;
- mondayUpdateSubitemStatus;
- provisioning;
- documentação CronoObra;
- testes Monday/CronoObra;
- partes necessárias de `functions/index.ts` / `package.json`.

Mensagem sugerida:

```text
feat: finalize cronograma monday sync
```

### COMMIT B — Relatório veicular

Incluir:

- FrotaVeiculoDetalhesPage;
- vehicle-report services;
- Function vehicleReport;
- testes correspondentes;
- documentação diretamente relacionada.

Mensagem sugerida:

```text
feat: update vehicle report period flow
```

Adaptar se o diff real indicar nome melhor.

### COMMIT C — Firestore Rules / testes

Se `firestore.rules` e `tests/rules/rules.test.mjs` tiverem uma alteração funcional coerente:

```text
test: align firestore rules coverage
```

ou mensagem melhor conforme diff real.

Se Rules fizerem parte claramente de outro commit funcional:

podem ir junto dele.

### COMMIT D — Docs / housekeeping

Somente se houver mudanças reais e independentes em:

- README;
- documentação geral;
- `.gitignore`;
- limpeza de arquivos versionados indevidamente.

Mensagem possível:

```text
docs: refresh project documentation
```

ou:

```text
chore: clean local artifacts from git
```

Não criar commit vazio.

---

## 6. STAGING EXPLÍCITO

Não usar `git add .` cegamente.

Usar staging por grupos de arquivos.

Após cada staging:

```bash
git diff --cached --stat
git diff --cached
```

Confirmar que o commit não mistura assuntos sem necessidade.

Depois commitar.

---

## 7. TESTES POR DOMÍNIO

Antes de cada commit funcional relevante, executar os testes adequados.

### CronoObra / Monday

Executar:

```bash
npm run test:cronograma
```

Executar também a suíte Functions relevante.

Executar build frontend e Functions conforme a estrutura real.

### Vehicle report

Executar:

- testes de `vehicleReport`;
- testes `vehicle-report-core`;
- build relevante.

### Rules

Executar testes de Rules se o ambiente suportar.

Se algum teste não puder rodar por dependência externa/emulador indisponível:

documentar claramente.

Não fingir PASS.

Se houver erro real de código:

corrigir antes do commit.

---

## 8. NÃO PARAR POR ALTERAÇÕES “NÃO RELACIONADAS”

A instrução desta tarefa é diferente da anterior.

Agora você DEVE tratar também as alterações de outros domínios.

Portanto:

- não parar ao encontrar alterações de Frota;
- não parar ao encontrar Rules;
- não parar ao encontrar docs;
- não parar ao encontrar múltiplos conjuntos.

Organizar em commits separados e continuar.

---

## 9. COMMITS LOCAIS JÁ EXISTENTES

A branch está `ahead 34`.

Auditar rapidamente esses commits para garantir que não exista algo obviamente sensível ou acidental.

Não reescrever o histórico existente apenas por estética.

Não fazer squash/rebase interativo sem necessidade.

Esses commits deverão ser enviados no push final.

---

## 10. ATUALIZAÇÃO DO REMOTO ANTES DO PUSH

Antes do push:

```bash
git fetch origin
git status -sb
git branch -vv
```

Se `origin/main` NÃO avançou:

continuar normalmente.

Se houver commits remotos novos e a branch estiver ahead + behind:

preferir:

```bash
git rebase origin/main
```

NÃO usar merge automático apenas para resolver push rejeitado.

Durante rebase:

- resolver conflitos com base no código atual;
- preservar funcionalidades;
- rodar testes relevantes após resolução.

Se surgir conflito realmente ambíguo:

usar o contexto do código/testes/documentação para resolver da forma mais conservadora.

A instrução é concluir a tarefa, não parar preventivamente.

---

## 11. PUSH

Depois que:

- todos os commits válidos foram criados;
- working tree está limpa;
- testes relevantes passaram;
- branch está atualizada em relação ao remoto;

executar:

```bash
git push origin main
```

ou simplesmente:

```bash
git push
```

se upstream já estiver correto.

NÃO usar:

- `--force`
- `--force-with-lease`

---

## 12. SE O PUSH FOR REJEITADO

Se houver rejeição por branch remota avançada:

1. `git fetch origin`
2. `git rebase origin/main`
3. resolver conflitos;
4. rodar testes;
5. `git push`

Continuar até concluir.

Não usar force push.

Se houver falha de autenticação de Git:

tentar o mecanismo de autenticação já configurado no ambiente.

Se realmente não houver credencial utilizável:

reportar como único bloqueador externo.

---

## 13. VALIDAR ESTADO FINAL

Ao final executar:

```bash
git status
git status -sb
git log --oneline --decorate -15
git rev-list --left-right --count origin/main...HEAD
```

Esperado:

```text
0 0
```

ou equivalente indicando branch alinhada.

Working tree:

limpa.

Arquivos locais ignorados podem permanecer no disco.

---

## 14. RELATÓRIO FINAL DETALHADO

Retornar:

### STATUS

`SUCESSO / BLOQUEADO EXTERNO`

### BRANCH

- branch:
- remote:
- upstream:
- ahead inicial:
- ahead final:
- behind final:

### COMMITS CRIADOS

Para cada commit:

- hash curto;
- mensagem;
- domínio;
- principais arquivos.

### COMMITS PRÉ-EXISTENTES

- quantidade enviada no push:
- observações relevantes:

### ARQUIVOS NÃO COMMITADOS

Listar apenas os deliberadamente excluídos:

- backups;
- cache;
- temporários;
- secrets ignorados.

Explicar por quê.

### TESTES

#### CronoObra
- resultado:

#### Functions Monday
- resultado:

#### Vehicle Report
- resultado:

#### Rules
- resultado:

#### Builds
- resultado:

### SEGURANÇA

- secrets encontrados no Git: NÃO
- tokens commitados: NÃO
- `.env` commitado: NÃO

### PUSH

- destino:
- resultado:
- commits enviados:
- force usado: NÃO

### ESTADO FINAL

- working tree limpa:
- branch alinhada com `origin/main`:
- `origin/main...HEAD`:
- repositório em dia:

---

# CRITÉRIO DE CONCLUSÃO

A tarefa só termina quando:

1. todas as mudanças válidas estiverem commitadas;
2. mudanças de domínios diferentes estiverem separadas da melhor forma possível;
3. temporários/backups/caches estiverem fora dos commits;
4. nenhum secret estiver versionado;
5. todos os commits locais, inclusive os 34 já existentes, tiverem sido enviados para `origin/main`;
6. `main` estiver alinhada com `origin/main`;
7. working tree estiver limpa ou apenas com arquivos deliberadamente ignorados.

Não parar apenas para pedir confirmação sobre separação de commits.
Tome a melhor decisão técnica e conclua.
