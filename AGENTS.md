# Ledur Motorista WEB — Engineering Instructions

## Project Context

This repository (`firebase-table-viewer-mk-ii`) is the Motorista operations web app: the administrative panel for fuel, fleet/maintenance, registrations, activity records/checklists, pumps, engineering/CronoObra, Friday internal boards, Kiosk credentials, and The Manuscript Reader. It is a React 19 + TypeScript + Vite PWA using Material UI and React Router. Firebase provides Authentication, Firestore, Storage, Hosting, and Cloud Functions.

- `src/` contains the web app: routes/pages in `src/pages/`, domain features in `src/features/` (for example `cronograma-obras/`, `friday-gestao-interna/`, `the-manuscript/`), and Firebase access in `src/services/`.
- `functions/` contains TypeScript Firebase Functions (Monday, ERP/Elevor, Kiosk, vehicle report, The Manuscript); exports are in `functions/index.ts`.
- `firestore.rules` and `storage.rules` define database and storage authorization.
- `tests/` covers frontend/domain behavior; `tests/rules/` covers rules; `functions/test/` covers Functions; `tools/` contains standalone local utilities.
- `firebase.json` defines Firebase deployment, emulators, Hosting rewrites, and the Functions predeploy build.

## Canonical Documentation — The Manuscript

The canonical system documentation is the separate repository `ledur-the-manuscript` (local checkout: `../../Docs/ledur-the-manuscript`; branch `main`). It is the source of truth for data contracts and system behavior across WEB, Functions, Firestore, and the Flutter app. Start from its `00_INDICE.md`; contracts live, in order, in `01_FIRESTORE/`, `02_APIS_FUNCTIONS/`, `03_APLICACAO_WEB/`, and `04_APP_FLUTTER/`. `_AUDITORIA/` records divergences, limits, and pending tests without redefining contracts.

- Before changing a domain, read its contract in The Manuscript (for example `03_APLICACAO_WEB/07_ENGENHARIA_E_CRONOOBRA.md` for `/engenharia/*`) together with the implementation and tests here.
- Implementation that diverges from the contract does not redefine it. If code and contract disagree, surface the divergence instead of silently picking one.
- When a change affects documented behavior: implement and test here; identify the affected contract; update the canonical section and, when needed, `_AUDITORIA/`; validate links. Commit documentation in the `ledur-the-manuscript` repository, not here.
- Do not use historical documents to define current behavior, and do not create loose Markdown outside its indexed structure.

## Understand Before Changing

Before implementing, understand the request, read the related implementation and tests, check applicable configuration and documentation, and identify material assumptions. Do not invent system behavior when it can be verified in the repository or in The Manuscript.

Define measurable success criteria, then make the smallest change that satisfies them.

## Simplicity, Scope, and Existing Patterns

Prefer simple, focused changes and patterns already used in the affected area. Do not add dependencies, abstractions, services, hooks, base components, repositories, APIs, schemas, collections, or architectural patterns without first checking how comparable needs are solved here.

Do not refactor unrelated code, rename unrelated symbols, reformat unrelated files, change existing behavior without a task-related reason, or implement unrequested features.

When a route, page, or link is removed or replaced, delete it. Do not keep old routes only to redirect to the new ones (owner's rule, 2026-10-23).

Existing conventions take precedence over personal preferences. Preserve the TypeScript/ESM layout: frontend code lives under `src/`; Functions compile from `functions/` to `functions/lib/` and use `.js` specifiers for local ESM imports.

Do not manually edit generated build or test artifacts such as `dist/`, `dev-dist/`, `functions/lib/`, `.firebase/`, or `.tmp-*`; change their source and regenerate them with the relevant command.

> Leave the project better, not merely different.

Here, “better” means correct, simple, verified, and consistent with this repository—not unnecessary aesthetic refactoring.

## Verification

Use the repository commands that match the change:

- `npm run lint` for frontend linting.
- `npm run build` for the frontend production build (includes the TypeScript check).
- `npm run test:<domain>` for the matching root test script listed in `package.json` (for example, `test:cronograma`, `test:engenharia-obras`, `test:vehicle-report`, or `test:rules`).
- `npm --prefix functions run build` to compile Functions; `npm --prefix functions test` to compile and run their tests.

Run the narrowest relevant validation and expand it when risk warrants. Never claim that a test, lint, typecheck, build, migration or other verification passed unless it was actually executed successfully. Clearly state validation that was not run and why.

## Bug Fixes

When reasonable, identify and reproduce the root cause, fix the cause rather than only its symptom, add or update a regression test, and run the relevant validation.

## Firebase Data, Rules, and Deployments

There is no migration framework or migrations directory. Treat Firestore data-shape changes and rule changes as compatibility-sensitive: the Flutter app and Functions share these collections. Check the contract in The Manuscript (`01_FIRESTORE/`), inspect current readers, writers, rules, and relevant Function paths; avoid destructive or incompatible changes, and do not assume data can be recreated.

For Firestore or Storage rule changes, use the existing emulator rule-test scripts (`npm run test:rules` or `npm run test:rules:firestore`). Preserve the authorization checks already used by the affected route, rule, or endpoint. The Admin SDK used by Functions bypasses Firestore Security Rules, so Function endpoints must enforce their own authorization.

Changes to `firebase.json` can affect Hosting rewrites, cache/security headers, emulators, and Function deployment; inspect their impact before editing. `npm run deploy`, `npm run deploy:channel`, and any `firebase deploy` change remote Firebase state. Do not run them unless the task explicitly authorizes deployment. GitHub Actions builds and deploys Hosting for pull requests and pushes to `main`; do not modify workflow behavior without a task-specific reason.

## Security and Secrets

Never expose, commit, or print credentials, tokens, service-account data, `.env*` contents, or sensitive production data. When a task requires secret configuration, inspect only the necessary names or structure, not secret values. Functions use Firebase `defineSecret`; when adding a required secret, declare it in the Function's `secrets` options as existing Functions do. Preserve existing authentication, authorization, rule enforcement, validation, and secret mechanisms; do not weaken them merely to make a change work.

## Documentation

Behavioral, data, rules, integration, and architecture documentation belongs in The Manuscript (see above). Keep in-repo documentation limited to local operational notes next to the affected code; do not duplicate canonical contracts here.

## Operating Principles

1. Think before coding.
2. Prefer simplicity.
3. Make surgical changes.
4. Define measurable success criteria.
5. Verify the result.
6. Never claim verification that was not actually performed.
7. Reuse existing patterns before introducing new ones.
8. Do not solve problems that were not requested.
