import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ErroTempo, fmtDuracao, lerTempo, operarTempo, sessaoAberta, semSessaoAberta, totalHoras, totalSegundos, type ValorTempo,
} from '../src/features/friday-gestao-interna/quadro/tempo.ts';
import { calcular } from '../src/features/friday-gestao-interna/quadro/formula.ts';
import type { Coluna, Item } from '../src/features/friday-gestao-interna/quadro/tipos.ts';

// Controle de tempo do Friday (coluna "tempo"). Só dados fictícios. Horários fixos, em UTC.
// Caminhos a partir da raiz do projeto (os scripts npm rodam de lá).
const em = (hhmm: string, dia = '2026-11-09') => new Date(`${dia}T${hhmm}:00Z`);
const PESSOA = 'uid-pessoa', OUTRA = 'uid-outra';
const ler = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

test('a cópia das Functions é igual ao controle de tempo da tela (abaixo do marcador)', () => {
  const marcador = '// ---- início da cópia ----\n';
  const tela = ler('src/features/friday-gestao-interna/quadro/tempo.ts').split(marcador)[1];
  const servidor = ler('functions/fridayTempo.ts').split(marcador)[1];
  assert.ok(tela && servidor);
  assert.equal(servidor, tela, 'functions/fridayTempo.ts divergiu de quadro/tempo.ts: copie de novo o trecho abaixo do marcador');
});

test('iniciar e parar usam a hora informada e guardam quem fez', () => {
  const ligado = operarTempo(null, { acao: 'iniciar' }, PESSOA, em('12:00'))!;
  assert.equal(ligado.sessoes.length, 1);
  assert.ok(sessaoAberta(ligado));
  assert.equal(ligado.sessoes[0].por, PESSOA);
  assert.equal(totalSegundos(ligado, em('12:10').getTime()), 600);

  const parado = operarTempo(ligado, { acao: 'parar' }, OUTRA, em('13:30'))!;
  assert.equal(sessaoAberta(parado), undefined);
  assert.equal(parado.sessoes[0].fim_por, OUTRA);
  assert.equal(totalSegundos(parado), 5400);
  assert.equal(fmtDuracao(5400), '1h 30m');
  assert.equal(totalHoras(parado), 1.5);
});

test('iniciar com o cronômetro já ligado não abre outra sessão; parar sem nada ligado não muda nada', () => {
  const ligado = operarTempo(null, { acao: 'iniciar' }, PESSOA, em('08:00'))!;
  assert.equal(operarTempo(ligado, { acao: 'iniciar' }, OUTRA, em('08:05'))!.sessoes.length, 1);
  assert.equal(operarTempo(null, { acao: 'parar' }, PESSOA, em('08:00')), null);
  const parado = operarTempo(ligado, { acao: 'parar' }, PESSOA, em('09:00'))!;
  assert.deepEqual(operarTempo(parado, { acao: 'parar' }, PESSOA, em('10:00')), parado);
});

test('sessão lançada à mão: conferências e marcação "manual"', () => {
  const agora = em('18:00');
  const v = operarTempo(null, { acao: 'adicionar', inicio: em('12:25').toISOString(), fim: em('13:25').toISOString() }, PESSOA, agora)!;
  assert.equal(totalSegundos(v), 3600);
  assert.equal(v.sessoes[0].manual, true);
  const erro = (inicio: Date, fim: Date) => assert.throws(() => operarTempo(v, { acao: 'adicionar', inicio: inicio.toISOString(), fim: fim.toISOString() }, PESSOA, agora), ErroTempo);
  erro(em('14:00'), em('13:00')); // fim antes do início
  erro(em('17:00'), em('19:00')); // termina no futuro
  erro(em('10:00', '2026-11-01'), em('11:00', '2026-11-09')); // mais de 7 dias
});

test('corrigir e apagar uma sessão; a última apagada deixa a célula vazia', () => {
  const agora = em('18:00');
  let v: ValorTempo | null = operarTempo(null, { acao: 'adicionar', inicio: em('08:00').toISOString(), fim: em('09:00').toISOString() }, PESSOA, agora)!;
  const id = v.sessoes[0].id;
  v = operarTempo(v, { acao: 'editar', sessao_id: id, inicio: em('08:00').toISOString(), fim: em('10:00').toISOString() }, PESSOA, agora)!;
  assert.equal(totalSegundos(v), 7200);
  assert.throws(() => operarTempo(v, { acao: 'excluir', sessao_id: 'nao-existe' }, PESSOA, agora), ErroTempo);
  assert.equal(operarTempo(v, { acao: 'excluir', sessao_id: id }, PESSOA, agora), null);
});

test('sessão rodando não pode ser corrigida, só parada ou apagada', () => {
  const v = operarTempo(null, { acao: 'iniciar' }, PESSOA, em('08:00'))!;
  assert.throws(() => operarTempo(v, { acao: 'editar', sessao_id: v.sessoes[0].id, inicio: em('07:00').toISOString(), fim: em('07:30').toISOString() }, PESSOA, em('09:00')), ErroTempo);
});

test('valor gravado inválido é limpo; duas sessões abertas viram uma; cópia do item sai sem o cronômetro ligado', () => {
  const sujo = { sessoes: [
    { id: 'a', inicio: em('08:00').toISOString(), fim: em('09:00').toISOString(), por: 'u1' },
    { id: 'b', inicio: 'ontem', fim: null, por: 'u1' },
    { id: 'c', inicio: em('10:00').toISOString(), fim: em('09:00').toISOString(), por: 'u1' },
    { id: 'd', inicio: em('11:00').toISOString(), fim: null, por: 'u1' },
    { id: 'e', inicio: em('12:00').toISOString(), fim: null, por: 'u2' },
  ] };
  const v = lerTempo(sujo);
  assert.deepEqual(v.sessoes.map(s => s.id), ['a', 'e']);
  assert.deepEqual(semSessaoAberta(v)!.sessoes.map(s => s.id), ['a']);
  assert.equal(semSessaoAberta({ sessoes: [{ id: 'x', inicio: em('08:00').toISOString(), fim: null, por: 'u1' }] }), null);
});

test('formatação da célula', () => {
  assert.equal(fmtDuracao(0), '0m 0s');
  assert.equal(fmtDuracao(754), '12m 34s');
  assert.equal(fmtDuracao(20231), '5h 37m');
  assert.equal(fmtDuracao(20231, true), '5h 37m 11s');
});

test('fórmula lê o controle de tempo em horas (1h30 = 1,5)', () => {
  const tempo = { id: 5, titulo: 'Tempo', tipo: 'tempo', config: {} } as unknown as Coluna;
  const formula = { id: 6, titulo: 'Custo', tipo: 'formula', config: { formula: '{@5}*100' } } as unknown as Coluna;
  const valor = operarTempo(null, { acao: 'adicionar', inicio: em('08:00').toISOString(), fim: em('09:30').toISOString() }, PESSOA, em('18:00'));
  const item = { id: 1, nome: 'Item', valores: { 5: valor } } as unknown as Item;
  assert.equal(calcular(formula, item, { colunas: [tempo, formula], nomeUsuario: () => '' }).valor, 150);
});
