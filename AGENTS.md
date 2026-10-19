# The Manuscript — Engineering Instructions

## Project Context

The Manuscript is an authenticated documentation experience within the Ledur operations web application. The repository is a React 19 + TypeScript + Vite PWA using Material UI and React Router. Firebase provides Authentication, Firestore, Storage, Hosting, and Cloud Functions.

- `src/` contains the web app. The Manuscript UI is in `src/pages/TheManuscriptPage.tsx`, `src/features/the-manuscript/`, and `src/services/manuscript.ts`.
- `functions/` contains TypeScript Firebase Functions; Manuscript function exports and logic are in `functions/index.ts` and `functions/manuscript.ts`.
- `firestore.rules` and `storage.rules` define database and storage authorization.
- `tests/` covers frontend/domain behavior; `functions/test/` covers Functions; `tools/` contains standalone local utilities.
- `firebase.json` defines Firebase deployment, emulators, Hosting rewrites, and the Functions predeploy build.

There is no root README or general architecture document. Read the implementation and relevant tests for the area being changed; use `tools/biblia-audit/README.md` for its standalone audit utility.

## Understand Before Changing

Before implementing, understand the request, read the related implementation and tests, check applicable configuration and documentation, and identify material assumptions. Do not invent system behavior when it can be verified in the repository.

Define measurable success criteria, then make the smallest change that satisfies them.

## Simplicity, Scope, and Existing Patterns

Prefer simple, focused changes and patterns already used in the affected area. Do not add dependencies, abstractions, services, hooks, base components, repositories, APIs, schemas, tables, or architectural patterns without first checking how comparable needs are solved here.

Do not refactor unrelated code, rename unrelated symbols, reformat unrelated files, change existing behavior without a task-related reason, or implement unrequested features.

Existing conventions take precedence over personal preferences. Preserve the TypeScript/ESM layout: frontend code lives under `src/`; Functions compile from `functions/` to `functions/lib/` and use `.js` specifiers for local ESM imports.

Do not manually edit generated build or test artifacts such as `dist/`, `functions/lib/`, or `.tmp-*`; change their source and regenerate them with the relevant command.

> Leave the project better, not merely different.

Here, “better” means correct, simple, verified, and consistent with this repository—not unnecessary aesthetic refactoring.

## Verification

Use the repository commands that match the change:

- `npm run lint` for frontend linting.
- `npm run build` for the frontend production build.
- `npm run test:<domain>` for the matching root test script listed in `package.json` (for example, `test:cronograma`, `test:vehicle-report`, or `test:rules`).
- `npm --prefix functions run build` to compile Functions; `npm --prefix functions test` to compile and run their tests.
- In `tools/biblia-audit/`, use `npm test` or `npm run audit` only when changing that utility.

Run the narrowest relevant validation and expand it when risk warrants. Never claim that a test, lint, typecheck, build, migration or other verification passed unless it was actually executed successfully. Clearly state validation that was not run and why.

## Bug Fixes

When reasonable, identify and reproduce the root cause, fix the cause rather than only its symptom, add or update a regression test, and run the relevant validation.

## Firebase Data, Rules, and Deployments

This repository uses Firestore and Storage rules but contains no migration framework or migrations directory. Treat Firestore data-shape changes and rule changes as compatibility-sensitive: inspect current readers, writers, rules, and relevant Function paths; avoid destructive or incompatible changes, and do not assume data can be recreated.

For Firestore or Storage rule changes, use the existing emulator rule-test scripts where applicable (`npm run test:rules` or `npm run test:rules:firestore`). Preserve the authorization checks already used by the affected route, rule, or endpoint. The Admin SDK used by Functions bypasses Firestore Security Rules, so Function endpoints must enforce their own authorization.

Changes to `firebase.json` can affect Hosting rewrites, cache/security headers, emulators, and Function deployment; inspect their impact before editing. `npm run deploy`, `npm run deploy:channel`, and the Functions deploy script change remote Firebase state. Do not run them unless the task explicitly authorizes deployment. GitHub Actions currently builds and deploys Hosting for pull requests and pushes to `main`; do not modify generated workflow behavior without a task-specific reason.

## Security and Secrets

Never expose, commit, or print credentials, tokens, service-account data, or sensitive production data. When a task requires secret configuration, inspect only the necessary names or structure, not secret values. Functions use Firebase `defineSecret`; when adding a required secret, declare it in the Function's `secrets` options as existing Functions do. Preserve existing authentication, authorization, rule enforcement, validation, and secret mechanisms; do not weaken them merely to make a change work.

## Documentation

Update the relevant documentation when a change affects public behavior, setup, commands, integrations, data/rules, architecture, or development workflow. Keep documentation concise and local to the affected area; do not duplicate implementation details or create broad documentation reorganizations without a clear need.

## Operating Principles

1. Think before coding.
2. Prefer simplicity.
3. Make surgical changes.
4. Define measurable success criteria.
5. Verify the result.
6. Never claim verification that was not actually performed.
7. Reuse existing patterns before introducing new ones.
8. Do not solve problems that were not requested.
