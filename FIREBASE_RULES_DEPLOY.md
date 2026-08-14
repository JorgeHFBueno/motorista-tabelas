# Relatório de Deploy das Firestore Security Rules

## Projeto Firebase

- **Project ID confirmado:** `app-motor-api`
- **Método usado para confirmar:** `firebase use` retornou `app-motor-api`; `firebase projects:list` marcou `app-motor-api` como projeto atual; `.firebaserc` associa o alias `default` a `app-motor-api`; `.env` do app React define `VITE_FIREBASE_PROJECT_ID=app-motor-api`; os workflows Firebase do repositório também apontam para `app-motor-api`.
- **Alias Firebase:** `default`

## Validação pré-deploy

- **Teste executado:** `npm run test:rules:firestore`
- **Aprovados:** 80/80
- **Falhos:** 0
- **Compilação:** concluída com sucesso pelo emulador e confirmada novamente pela Firebase CLI durante o deploy.
- **Diff validado:** `git diff -- firestore.rules` confirmou o arquivo pendente previamente validado; `git diff -- storage.rules` não apresentou alterações.

## Deploy

- **Comando exato executado:** `firebase.cmd deploy --only firestore:rules --project app-motor-api --non-interactive`
- **Alvo publicado:** `firestore:rules` (`firestore.rules` em `cloud.firestore`)
- **Resultado da Firebase CLI:** sucesso (`Deploy complete!`); `firestore.rules` compilado e liberado. A CLI emitiu apenas o aviso não bloqueante `Unused function: isAdm1` e não reportou erros.

## Componentes NÃO publicados

- **Storage:** NÃO
- **Hosting:** NÃO
- **Functions:** NÃO

## Estado final

O deploy das Firestore Security Rules foi concluído com sucesso no projeto `app-motor-api`. Nenhum dado do Firestore foi alterado manualmente.
