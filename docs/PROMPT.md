Você está trabalhando no projeto REAL:

C:\Users\Jorge\Desktop\Projetos\Ledur_Motorista\Web\firebase-table-viewer-mk-ii

==================================================
REGRA OPERACIONAL DESTA FASE
==================================================

A partir de agora, o ciclo obrigatório é:

PATCH
→ HOSTING
→ TESTE EM PRODUÇÃO
→ COMMIT
→ próximo PATCH

Portanto, ANTES de qualquer alteração desta tarefa, verificar o commit do ciclo anterior.

NÃO começar este patch sem fazer essa conferência.

==================================================
0. VERIFICAR COMMIT ANTERIOR
==================================================

Executar:

git status
git log -1 --oneline

Confirmar:

1. qual é o último commit;
2. se as alterações já publicadas no Hosting estão commitadas;
3. se o working tree está limpo.

Se houver alterações NÃO commitadas pertencentes ao patch anterior já publicado/testado:

- revisar o diff;
- confirmar que são somente alterações do ciclo anterior;
- NÃO misturar com este novo patch;
- criar primeiro o commit do ciclo anterior.

Depois disso:

git status

deve estar limpo antes de começar o novo patch.

Registrar no relatório:

COMMIT ANTERIOR:
- hash:
- mensagem:
- working tree antes do patch: LIMPO | NÃO LIMPO
- ação necessária:

==================================================
1. CONTEXTO ATUAL
==================================================

O CronoObra está funcionando em produção.

Fonte das obras:

monday-obras

Contratos permitidos:

12806288209
12808776050
12980608147
12998583588
12999477696

Catálogo de mestres:

monday-mestres

Estrutura:

monday-mestres/{mestreId}

{
  nome: string,
  cor: string
}

A cor é armazenada no Firestore sem "#".

Exemplo:

{
  nome: "DINE",
  cor: "376f55"
}

Na UI:

#376f55

As alocações continuam locais em:

cronoobra.alocacoes.v1

NÃO mover alocações para Firestore nesta tarefa.

==================================================
2. OBJETIVO DESTE PATCH
==================================================

Fazer apenas estas alterações visuais/funcionais:

A. remover o texto "Zoom";

B. remover o botão "Toggles";

C. colocar os controles hoje acessados por "Toggles" exatamente na região onde hoje aparece "Zoom";

D. ocultar visualmente:
   - Meses
   - Ano

mas preservar o código e funcionamento interno;

E. remover o texto:

"O catálogo de mestres é administrado em monday-mestres."

F. adicionar ao final da lista horizontal de mestres um botão compacto:

+

G. esse botão permite cadastrar um novo mestre diretamente em:

monday-mestres

H. adicionar ao calendário uma linha fina destinada ao ANO, acima da linha dos meses.

Não fazer redesign geral.

==================================================
3. PRIMEIRO AUDITAR A INTERFACE ATUAL
==================================================

Antes de alterar:

localizar:

- barra Filtros / Toggles / Obras / Mestres;
- área de Zoom;
- controles Dias / Semanas / Meses / Ano;
- implementação do botão Toggles;
- painel/menu atualmente aberto pelo botão Toggles;
- lista de mestres;
- cabeçalho do calendário;
- linha dos meses;
- linha das semanas;
- cálculo da largura das células;
- cálculo da virada de ano.

Não criar controles duplicados.

Reutilizar componentes e handlers atuais.

==================================================
4. REMOVER "ZOOM"
==================================================

Hoje existe algo semelhante a:

Zoom    Dias   Semanas   Meses   Ano

Remover APENAS o label:

Zoom

Não deixar espaço vazio desnecessário.

==================================================
5. MOVER OS TOGGLES
==================================================

Hoje existe na barra superior um botão:

Toggles

Esse botão deve desaparecer.

Os controles/conteúdo hoje disponibilizados por esse botão devem passar para a região onde anteriormente ficava o texto:

Zoom

Objetivo:

usar aquele espaço para os toggles diretamente.

IMPORTANTE:

Não duplicar estado.

Não criar um segundo sistema de toggles.

Reutilizar exatamente:

- estado;
- handlers;
- opções;
- comportamento

já existentes.

Se atualmente o botão abre popover/menu:

transformar os controles essenciais desse menu em controles inline compactos naquela área.

Preservar comportamento funcional.

==================================================
6. OCULTAR "MESES" E "ANO"
==================================================

Os modos:

Meses
Ano

estão funcionando e devem continuar existindo no código.

Porém o usuário pediu para retirá-los da interface atual.

Portanto:

- NÃO apagar implementação;
- NÃO remover lógica;
- NÃO remover testes;
- NÃO quebrar esses modos.

Apenas ocultar os dois controles visualmente.

Devem permanecer visíveis:

Dias
Semanas

IMPORTANTE:

Se o estado salvo anteriormente estiver em "Meses" ou "Ano":

não deixar a UI presa em um modo sem botão visível.

Ao carregar a página, se o zoom atual for um modo oculto:

normalizar visualmente para "Semanas"

ou seguir a estratégia mais segura já existente.

Não apagar suporte interno aos modos ocultos.

==================================================
7. REMOVER TEXTO INFORMATIVO DOS MESTRES
==================================================

Remover completamente da interface o texto:

"O catálogo de mestres é administrado em monday-mestres."

Não deixar placeholder, espaço vertical ou margem desnecessária.

A lista de mestres deve ficar mais próxima do calendário.

==================================================
8. BOTÃO "+" NA LISTA DE MESTRES
==================================================

Hoje existe a lista visual:

AMILTON
ANTÔNIO
DILAMAR
DINE
EVERALDO
JEFE
RUDIMAR
TIAGO
VANDERLEI

Ao FINAL dessa lista, adicionar um botão compacto:

+

Visualmente deve parecer integrante da mesma barra.

Exemplo:

[AMILTON] [ANTÔNIO] ... [VANDERLEI] [+]

Não usar texto:

Adicionar mestre

na barra.

Apenas:

+

Pode usar:

title="Adicionar mestre"
aria-label="Adicionar mestre"

==================================================
9. CLIQUE NO "+"
==================================================

Ao clicar:

abrir um modal/popover simples para cadastrar um novo mestre.

Pedir SOMENTE:

Nome

Não pedir cor.

A cor deve ser gerada automaticamente.

A interface deve ser pequena e coerente com o CronoObra atual.

==================================================
10. VALIDAÇÃO DO NOME
==================================================

Aplicar:

trim

Rejeitar:

""
"   "

Não permitir nome duplicado considerando:

- case-insensitive;
- trim;
- normalização consistente de acentos.

Exemplo:

TIAGO
tiago
 Tiago

devem ser considerados o mesmo mestre.

Mostrar erro compreensível sem fechar a página.

==================================================
11. GERAÇÃO AUTOMÁTICA DE COR
==================================================

Ao criar novo mestre:

gerar automaticamente uma cor hexadecimal de 6 caracteres.

Exemplo:

3f6c92

Persistência no Firestore:

SEM "#".

CSS:

COM "#".

A nova cor:

- não pode repetir nenhuma cor existente em monday-mestres;
- não pode repetir outra cor gerada na mesma sessão;
- deve ser visualmente utilizável com o estilo atual;
- deve ser determinística ou selecionada por palette segura, conforme arquitetura atual.

Preferir reutilizar a lógica/palette que já existia quando mestres eram criados localmente, caso ela ainda exista e seja adequada.

Não alterar as cores dos mestres atuais.

==================================================
12. DOCUMENT ID DO NOVO MESTRE
==================================================

Criar um document ID estável derivado do nome.

Exemplo:

"JOÃO DA SILVA"
→
joao-da-silva

ou seguir exatamente a convenção já existente nos atuais:

dine
dilamar
jefe
vanderlei
rudimar
everaldo
amilton
antonio
tiago

Requisitos:

- lowercase;
- remover acentos;
- converter espaços/separadores adequadamente;
- ID determinístico;
- não usar ID aleatório se puder ser evitado.

Antes de criar:

confirmar que o document ID não existe.

Também conferir duplicidade pelo campo nome.

==================================================
13. WRITE NO FIRESTORE
==================================================

Nesta tarefa está AUTORIZADO escrever SOMENTE em:

monday-mestres

Para cadastrar novo mestre.

Payload permitido:

{
  nome: "<NOME>",
  cor: "<hex sem #>"
}

Não adicionar campos extras sem necessidade.

Não escrever em:

monday-obras
obras-v2
contratos-v2
monday-gestao-obras-raw

Não alterar Rules.
Não alterar Functions.

==================================================
14. ATUALIZAÇÃO IMEDIATA DA UI
==================================================

Após criar o mestre com sucesso:

- atualizar a lista imediatamente;
- não exigir F5;
- novo mestre deve aparecer antes do botão "+";
- manter ordenação atual da lista.

A lista atualmente parece alfabeticamente ordenada.

Confirmar a regra existente e preservá-la.

==================================================
15. ERRO DE CRIAÇÃO
==================================================

Se Firestore rejeitar o write:

- mostrar erro no modal/popover;
- NÃO inserir mestre fake localmente;
- NÃO fechar silenciosamente;
- NÃO criar divergência entre tela e banco.

==================================================
16. NOVA LINHA DE ANO NO CALENDÁRIO
==================================================

Adicionar uma faixa fina acima da linha dos meses.

Estrutura visual esperada:

┌─────────────────────────────────────────┐
│                  2026                   │  ← nova linha fina
├─────────────┬─────────────┬─────────────┤
│ SET         │ OUT         │ NOV         │  ← meses
├───┬───┬───┬─...
│S38│S39│S40│...

A linha de ano deve ser pequena.

Altura aproximada:

18–22 px

ou a menor altura coerente com a tipografia existente.

Não criar uma faixa grande.

==================================================
17. COMPORTAMENTO DA LINHA DE ANO
==================================================

O ano deve acompanhar corretamente o eixo temporal.

Exemplo em uma visão que cruza dezembro/janeiro:

┌───────────────────────┬────────────────────────┐
│         2026          │          2027          │
├───────────┬───────────┼───────────┬────────────┤
│ NOV       │ DEZ       │ JAN       │ FEV        │
...

Cada bloco de ano deve ocupar exatamente a largura correspondente às células/semanas daquele ano.

Não usar uma label fixa "2026".

Calcular com base no intervalo realmente renderizado.

==================================================
18. ALINHAMENTO
==================================================

A nova linha do ano deve:

- acompanhar scroll horizontal;
- acompanhar exatamente as semanas;
- respeitar a coluna fixa da esquerda;
- não deslocar cabeçalho;
- não quebrar sticky header;
- não quebrar bordas;
- funcionar em Dias;
- funcionar em Semanas;
- continuar estruturalmente compatível com Meses/Ano ocultos.

Preferir reutilizar o mesmo sistema de segmentos utilizado para os meses.

==================================================
19. ESTILO DO ANO
==================================================

Usar o estilo atual da grade.

Preferência:

- texto centralizado;
- fonte discreta;
- peso semelhante ao cabeçalho mensal;
- borda fina inferior/lateral;
- fundo equivalente ao cabeçalho.

Não introduzir nova paleta visual.

==================================================
20. NÃO ALTERAR
==================================================

Não mexer em:

- origem monday-obras;
- allowlist dos cinco contratos;
- coluna Contrato;
- persistência das alocações;
- cronoobra.alocacoes.v1;
- migração existente de mestreId;
- drag/drop;
- resize;
- regras de conflito;
- duração planejada;
- regras de calendário;
- contratos;
- LOTEs.

==================================================
21. TESTES DO PATCH
==================================================

Atualizar/adicionar testes para:

A. "Zoom" não renderiza.

B. botão "Toggles" não renderiza.

C. controles anteriormente ligados ao Toggles continuam funcionais inline.

D. Dias aparece.

E. Semanas aparece.

F. Meses não aparece na UI.

G. Ano não aparece na UI.

H. suporte interno a Meses/Ano continua existente.

I. texto:
"O catálogo de mestres é administrado em monday-mestres."
não renderiza.

J. botão "+" renderiza ao final dos mestres.

K. "+" abre criação.

L. nome vazio é rejeitado.

M. nome duplicado é rejeitado.

N. cor gerada não repete existente.

O. Firestore recebe:
nome
cor

P. cor gravada não possui "#".

Q. novo mestre aparece após criação.

R. falha Firestore não cria mestre fantasma.

S. linha do ano renderiza.

T. ano correto é exibido.

U. virada 2026 → 2027 cria dois segmentos corretos.

V. largura dos segmentos acompanha o eixo temporal.

W. testes anteriores continuam passando.

==================================================
22. PATCH
==================================================

Faça as alterações necessárias.

Evite refatoração não relacionada.

Ao terminar o PATCH:

mostrar:

- arquivos alterados;
- resumo do diff;
- testes unitários relevantes, se executados durante desenvolvimento.

MAS NÃO COMMITAR AINDA.

Lembre:

PATCH → HOSTING → TESTE → COMMIT.

==================================================
23. HOSTING
==================================================

Após finalizar o patch:

executar build conforme fluxo já utilizado pelo projeto.

Depois publicar SOMENTE Hosting.

Não deployar:

Functions
Rules

Não fazer commit antes do Hosting.

==================================================
24. TESTE EM PRODUÇÃO
==================================================

Depois do Hosting:

abrir a versão publicada e testar.

Confirmar visualmente:

1. "Zoom" sumiu;
2. "Toggles" sumiu;
3. toggles inline estão no local correto;
4. só Dias/Semanas aparecem;
5. texto informativo dos mestres sumiu;
6. botão "+" aparece após VANDERLEI;
7. criar um mestre de teste funciona;
8. novo mestre aparece imediatamente;
9. F5 mantém o mestre porque ele veio do Firestore;
10. cor não repete;
11. linha do ano aparece;
12. ano está alinhado aos meses;
13. scroll horizontal mantém alinhamento;
14. calendário continua funcionando;
15. alocações continuam persistindo;
16. console sem erro crítico.

IMPORTANTE:

Se criar mestre especificamente para teste em PRODUÇÃO:

usar um nome explicitamente autorizado/útil.

NÃO criar lixo como:
TESTE123
AAA
XPTO

Se não houver nome real autorizado para cadastrar, teste o fluxo até antes da confirmação final do write.

==================================================
25. TESTES AUTOMATIZADOS
==================================================

Após o Hosting/teste visual:

executar:

npm.cmd run test:cronograma

Registrar:

PASS
FAIL

Não corrigir lint legado fora deste escopo.

==================================================
26. COMMIT SOMENTE DEPOIS DA HOMOLOGAÇÃO
==================================================

Somente após:

- Hosting concluído;
- produção validada;
- testes PASS;

fazer:

git status
git diff

Confirmar que não há:

- artefatos acidentais;
- credenciais;
- caches;
- arquivos de build indevidos;
- mudanças fora do escopo.

Então criar UM commit para este patch.

Mensagem sugerida:

feat: refine cronograma controls and master management

ou equivalente coerente com o padrão do repositório.

Depois:

git status

deve ficar limpo.

==================================================
27. NÃO COMEÇAR OUTRO PATCH
==================================================

Após o commit:

PARE.

Não iniciar nenhuma melhoria adicional.

O próximo prompt começa novamente verificando esse commit.

==================================================
28. RELATÓRIO FINAL
==================================================

STATUS:
SUCESSO | PARCIAL | BLOQUEADO

COMMIT ANTERIOR:
- hash:
- mensagem:
- estava limpo antes do patch:

PATCH:
- Zoom removido:
- Toggles inline:
- Meses oculto:
- Ano oculto:
- texto monday-mestres removido:
- botão +:
- criação mestre Firestore:
- linha do ano:

MESTRE NOVO:
- nome testado:
- documentId:
- cor:
- persistiu Firestore:

CALENDÁRIO:
- linha ano:
- virada de ano:
- alinhamento:
- scroll:

HOSTING:
- executado:
- projeto:
- URL:

TESTE PRODUÇÃO:
- resultado:
- console:

TESTES:
- total:
- PASS:
- FAIL:

COMMIT DESTE PATCH:
- hash:
- mensagem:
- working tree final:

FUNCTIONS:
NÃO ALTERADAS

FIRESTORE RULES:
NÃO ALTERADAS

FIRESTORE WRITES:
somente monday-mestres para criação autorizada de mestre