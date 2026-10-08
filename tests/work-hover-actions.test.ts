import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const component = readFileSync(resolve(process.cwd(), "src/features/cronograma-obras/components/WorkHoverActions.tsx"), "utf8");
const modal = readFileSync(resolve(process.cwd(), "src/features/cronograma-obras/components/ContractBalanceModal.tsx"), "utf8");
const gantt = readFileSync(resolve(process.cwd(), "src/features/cronograma-obras/components/GanttGrid.tsx"), "utf8");
const table = readFileSync(resolve(process.cwd(), "src/features/cronograma-obras/components/ContractTextTable.tsx"), "utf8");
const css = readFileSync(resolve(process.cwd(), "src/features/cronograma-obras/styles/cronograma-obras.css"), "utf8");

test("hover abre o card após um segundo e o preview de saldo não depende de clique", () => {
  assert.match(component, /const OPEN_DELAY = 1000/);
  assert.match(component, /onPointerEnter=\{openBalance\}/);
  assert.match(component, /onPointerLeave=\{scheduleBalanceClose\}/);
  assert.match(component, /<BalanceSummary summary=\{EMPTY_BALANCE\} variant="preview" \/>/);
  assert.match(component, /const CLOSE_GRACE = 150/);
  assert.match(component, /createPortal\([\s\S]*document\.body/);
  assert.match(css, /\.co-work-hover-card \{[^}]*position: fixed/);
});

test("clique no saldo fecha o hover e abre o modal do contrato canônico", () => {
  assert.match(component, /close\(\); setModal\(\{ contractId: open\.contractId, contractName: open\.contractName, returnFocus \}\)/);
  assert.doesNotMatch(component, /setBalanceOpen\(\(expanded\) => !expanded\)/);
  assert.match(component, /contractId: string; contractName: string/);
  assert.match(modal, /SALDO DO CONTRATO/);
  assert.match(modal, /role="dialog" aria-modal="true"/);
  assert.match(modal, /onMouseDown=\{onClose\}/);
  assert.match(modal, /event\.key === "Escape"/);
  assert.match(component, /requestAnimationFrame\(\(\) => opener\?\.focus\(\)\)/);
});

test("modal e preview compartilham o mesmo resumo local e formatador BRL", () => {
  assert.match(modal, /export const EMPTY_BALANCE/);
  assert.match(modal, /new Intl\.NumberFormat\("pt-BR", \{ style: "currency", currency: "BRL" \}\)/);
  for (const label of ["TOTAL DO CONTRATO", "TOTAL DISPONÍVEL", "MEDIÇÕES", "SALDO DISPONÍVEL", "SALDO CONTRATO"]) assert.match(modal, new RegExp(label));
  assert.doesNotMatch(component + modal, /httpsCallable|firestore|Monday|ERP/);
});

test("gatilhos reais resolvem e preservam o contrato pai em Gantt e Lista corrida", () => {
  assert.match(gantt, /WorkHoverTrigger id=\{obra\.id\} contractId=\{contrato\.id\} contractName=\{contrato\.nome\} onMore=\{\(\) => onOpenContract\(contrato\)\}/);
  assert.match(table, /WorkHoverTrigger id=\{obra\.id\} contractId=\{contrato\.id\} contractName=\{contrato\.nome\} onMore=\{\(\) => onOpenContract\(contrato\)\}/);
  assert.match(gantt, /WorkHoverTrigger id=\{group\.id\} contractId=\{contrato\.id\} contractName=\{contrato\.nome\} onMore=\{\(\) => onOpenContract\(contrato\)\}/);
  assert.match(table, /WorkHoverTrigger id=\{group\.id\} contractId=\{contrato\.id\} contractName=\{contrato\.nome\} onMore=\{\(\) => onOpenContract\(contrato\)\}/);
  assert.match(component, /open\.onMore\(\); close\(\)/);
});
