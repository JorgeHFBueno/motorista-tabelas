# Ledur Pré-Fabricados — Central do Cliente

Portal para clientes acompanharem suas obras (etapas, documentos, fotos, finanças e atendimento) e para a equipe Ledur administrar obras e cadastros.

## Stack

- Vite + React + TypeScript
- shadcn/ui + Tailwind CSS
- Firebase (projeto `ledur-clientes`): Auth, Firestore, Storage, Cloud Functions e Hosting

## Rodar localmente

Requer Node.js 20+. Rode os comandos dentro de `portal/`.

```sh
npm ci
npm run dev   # http://localhost:8080
```

A configuração do Firebase tem valores padrão em `src/config/firebaseConfig.ts`.
Para apontar para outro projeto, crie um `.env.local` com:

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

## Cloud Functions

Ficam em `functions/` (Node 22). O envio de e-mails usa o segredo `RESEND_API_KEY`, configurado no Firebase:

```sh
firebase functions:secrets:set RESEND_API_KEY
firebase deploy --only functions
```

## Deploy

Durante a transição, o portal ainda publica no projeto Firebase antigo (`ledur-clientes`),
de forma manual, a partir desta pasta:

```sh
npm run build
firebase deploy --only hosting
```

A migração para o projeto `app-motor-api` (site próprio e domínio
clientes.ledurprefabricados.com.br) é a próxima etapa.
