# Ledur Pré-Fabricados — Central do Cliente

Site do cliente (dono da obra) para acompanhar o contrato: progresso, saída e chegada da equipe, documentos, fotos, parcelas, atendimento e notícias. A equipe trabalha na WEB principal (área do adm2).

Contrato: The Manuscript, `03_APLICACAO_WEB/16_PORTAL_DO_CLIENTE.md`, `01_FIRESTORE/COLECOES/portal.md` e `users.md`.

## Stack

- Vite + React + TypeScript, shadcn/ui + Tailwind CSS
- Firebase do projeto `app-motor-api`: Auth, Firestore e Storage. As Rules ficam na raiz do repositório (`firestore.rules`, `storage.rules`).

## Rodar localmente

Requer Node.js 20+. Rode os comandos dentro de `portal/`.

`.env` (fora do git) com a configuração web do `app-motor-api`:

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

```sh
npm ci
npm run dev            # http://localhost:8081
```

Com os emuladores da raiz (`firebase emulators:start --only auth,firestore,storage --project app-motor-api`) e um `.env.emulador` com `VITE_USE_FIREBASE_EMULATORS=true`:

```sh
npm run dev:emulador
```

## Pendente

- `functions/` é o código antigo das Functions do portal (projeto `ledur-clientes`), mantido só como referência: elas serão reescritas no `functions/` da raiz.
- Publicação: segundo site de Hosting do `app-motor-api` (domínio clientes.ledurprefabricados.com.br), configurado na raiz.
