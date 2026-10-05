# React + TypeScript + Vite

## Sincronização oficial do Monday

`/api/monday-sync` é uma Function v2 restrita a usuários ativos com `funcionarios/{uid}.perfis.adm2 === true`. Ela consulta o board `8515762377` exclusivamente no servidor e requer o Secret `MONDAY_API_TOKEN`; o token nunca é enviado ao frontend, Firestore ou logs. `dry-run` não escreve nada; `apply` relê Monday e Firestore, recalcula o plano e usa um único batch seguro.

São controlados `raw.id`, `nome`, `status`, `numeroContrato`, `ano`, `empresa`, `inicio`, `fim` e `raw.subitems` por ID (`id`, `nome`, `status`). Campos internos, inclusive `obraV2Id` e propriedades extras dos subitens, são preservados. Somente `raw.status === "Obra Finalizada"` pode definir `obras-v2/{obraV2Id}.status` como `FINALIZADA`; não há reabertura.

Antes do deploy: `firebase functions:secrets:set MONDAY_API_TOKEN`. Publique a Function `mondaySync` e Hosting, faça primeiro um dry-run pelo botão **Sincronizar Monday** e revise o resultado antes de APPLY.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config({
  extends: [
    // Remove ...tseslint.configs.recommended and replace with this
    ...tseslint.configs.recommendedTypeChecked,
    // Alternatively, use this for stricter rules
    ...tseslint.configs.strictTypeChecked,
    // Optionally, add this for stylistic rules
    ...tseslint.configs.stylisticTypeChecked,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config({
  plugins: {
    // Add the react-x and react-dom plugins
    'react-x': reactX,
    'react-dom': reactDom,
  },
  rules: {
    // other rules...
    // Enable its recommended typescript rules
    ...reactX.configs['recommended-typescript'].rules,
    ...reactDom.configs.recommended.rules,
  },
})
```
