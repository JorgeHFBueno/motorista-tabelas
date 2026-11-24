import assert from 'node:assert/strict';
import test from 'node:test';
import { ALTURA, LARGURA, MARGEM_TOPO, QUADROS, caminhos, quadro, type Animacao } from '../src/components/corvo/quadros';

const ANIMACOES: Animacao[] = ['pulinho', 'cabeca', 'rabo', 'grito'];
/** Posições na tela (x,y) dos pixels de uma cor. */
function pixels(a: Animacao, i: number, cor: string) {
  const q = quadro(a, i);
  const lista: string[] = [];
  q.linhas.forEach((l, y) => [...l].forEach((c, x) => { if (c === cor) lista.push(`${x},${y + MARGEM_TOPO + q.dy}`); }));
  return lista;
}

test('Corvo: todo quadro cabe na grade da animação', () => {
  for (const a of ANIMACOES) {
    for (let i = 0; i < QUADROS; i++) {
      const q = quadro(a, i);
      q.linhas.forEach((l, y) => {
        const fim = l.replace(/\.+$/, '').length;
        assert.ok(fim <= LARGURA[a], `${a} ${i}: linha ${y} passa da largura`);
        const tela = y + MARGEM_TOPO + q.dy;
        if (l.includes('#') || /[wobs]/.test(l)) assert.ok(tela >= 0 && tela < ALTURA, `${a} ${i}: linha ${y} fora da grade`);
      });
    }
  }
});

test('Corvo: pisca no quadro 3, os pés só saem do chão no pulinho', () => {
  const pes = pixels('pulinho', 0, 'b').filter((p) => Number(p.split(',')[1]) >= 13);
  assert.equal(pes.length, 8);
  for (const a of ANIMACOES) {
    assert.equal(pixels(a, 3, 'o').length, 0, `${a} não pisca`);
    for (let i = 0; i < QUADROS; i++) {
      const agora = pixels(a, i, 'b').filter((p) => Number(p.split(',')[1]) >= 13);
      if (a === 'pulinho' && (i === 7 || i === 8)) assert.notDeepEqual(agora, pes);
      else assert.deepEqual(agora, pes, `${a} ${i}: os pés mudaram`);
    }
  }
});

test('Corvo: o grito abre o bico e o som pisca; nas outras animações não há som', () => {
  assert.ok(pixels('grito', 6, 's').length > 0);
  assert.equal(pixels('grito', 7, 's').length, 0);
  for (const a of ['pulinho', 'cabeca', 'rabo'] as Animacao[]) {
    for (let i = 0; i < QUADROS; i++) assert.equal(pixels(a, i, 's').length, 0);
  }
  const d = caminhos(quadro('grito', 6));
  assert.deepEqual(Object.keys(d).sort(), ['#', 'b', 'o', 's', 'w']);
  assert.match(d.o, /^M\d+ \d+h1v1h-1z$/);
});
