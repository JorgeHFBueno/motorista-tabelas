import assert from 'node:assert/strict';
import test from 'node:test';
import type { MouseEvent } from 'react';
import { abreEmNovaGuia } from '../src/utils/novaGuia';

// Minimal element: `closest` finds the nearest button/link, as in the DOM.
type Elemento = { controle: boolean; pai?: Elemento; closest: (seletor: string) => Elemento | null };
const elemento = (controle: boolean, pai?: Elemento): Elemento => {
  const el: Elemento = { controle, pai, closest: () => (el.controle ? el : el.pai?.closest('') ?? null) };
  return el;
};

function cenario() {
  const abertas: string[] = [];
  const navegou: string[] = [];
  (globalThis as unknown as { window: unknown }).window = { open: (url: string) => { abertas.push(url); return null; } };
  const linha = elemento(false);
  const evento = (extra: Partial<Record<string, unknown>> & { target?: Elemento }) => {
    let prevenido = false;
    const e = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, target: linha, currentTarget: linha, preventDefault: () => { prevenido = true; }, ...extra };
    return { e: e as unknown as MouseEvent<HTMLElement>, prevenido: () => prevenido };
  };
  const h = abreEmNovaGuia('/friday/quadros/7', (url) => navegou.push(url));
  return { abertas, navegou, linha, evento, h };
}

test('clique normal navega na mesma guia', () => {
  const { abertas, navegou, evento, h } = cenario();
  h.onClick(evento({}).e);
  assert.deepEqual(navegou, ['/friday/quadros/7']);
  assert.deepEqual(abertas, []);
});

test('Ctrl+clique e botão do meio abrem em nova guia', () => {
  const { abertas, navegou, evento, h } = cenario();
  h.onClick(evento({ ctrlKey: true }).e);
  const meio = evento({ button: 1 });
  h.onAuxClick(meio.e);
  assert.deepEqual(abertas, ['/friday/quadros/7', '/friday/quadros/7']);
  assert.deepEqual(navegou, []);
  assert.equal(meio.prevenido(), true);
});

test('botão do meio sem rolagem automática; botão direito não faz nada', () => {
  const { abertas, evento, h } = cenario();
  const desce = evento({ button: 1 });
  h.onMouseDown(desce.e);
  assert.equal(desce.prevenido(), true);
  h.onAuxClick(evento({ button: 2 }).e);
  assert.deepEqual(abertas, []);
});

test('clique do meio num botão dentro da linha (menu ⋯) fica com o botão', () => {
  const { abertas, linha, evento, h } = cenario();
  const menu = elemento(true, linha);
  h.onAuxClick(evento({ button: 1, target: menu }).e);
  h.onClick(evento({ ctrlKey: true, target: menu }).e);
  assert.deepEqual(abertas, []);
});
