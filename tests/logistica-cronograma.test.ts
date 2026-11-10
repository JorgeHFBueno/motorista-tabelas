import assert from 'node:assert/strict';
import test from 'node:test';
import { veiculosDoDocumento, type Programacao } from '../src/features/cronograma-logistica/domain/models';
import { posicaoAoSoltar } from '../src/features/cronograma-logistica/domain/ordem';
import {
  COR_SEM_STATUS, ETIQUETAS_PADRAO, etiquetasLimpas, novoIdEtiqueta, statusAoSalvarEtiquetas, statusExibido, textoEscuro,
} from '../src/features/cronograma-logistica/domain/status';
import { codigoDaProgramacao, semCodigoEmOrdem } from '../src/features/cronograma-logistica/domain/codigo';
import {
  diasDoCalendario, inicioDaSemanaId, organizarSemanas, proximaSemanaParaAbrir, rotuloSemana, semanaIdDe, semanaIdValido,
} from '../src/features/cronograma-logistica/domain/semanas';
import { conflitosPorProgramacao, periodoDe, textoConflito } from '../src/features/cronograma-logistica/domain/conflitos';
import { barrasDaLinha } from '../src/features/cronograma-logistica/domain/calendario';

const programacao = (id: string, extra: Partial<Programacao> = {}): Programacao => ({
  id, cod: null, semanaId: '2026-W45', item: `Item ${id}`, status: '', inicio: null, fim: null,
  motorista: null, auxiliar: null, veiculos: [], obra: null, posicao: 0, ...extra,
});

test('semana ISO de segunda a domingo, inclusive nas viradas de ano', () => {
  assert.equal(semanaIdDe('2026-11-02'), '2026-W45'); // segunda
  assert.equal(semanaIdDe('2026-11-08'), '2026-W45'); // domingo
  assert.equal(semanaIdDe('2026-11-09'), '2026-W46');
  assert.equal(semanaIdDe('2026-12-28'), '2026-W53');
  assert.equal(semanaIdDe('2027-01-03'), '2026-W53');
  assert.equal(semanaIdDe('2027-01-04'), '2027-W01');
  assert.equal(semanaIdDe('2025-12-29'), '2026-W01');
  assert.equal(inicioDaSemanaId('2026-W01'), '2025-12-29');
  assert.equal(inicioDaSemanaId('2026-W46'), '2026-11-09');
  assert.equal(rotuloSemana('2026-W46'), 'Semana 46 – 09/11 a 15/11');
  assert.equal(semanaIdValido('2026-W53'), true);
  assert.equal(semanaIdValido('2027-W53'), false);
  assert.equal(semanaIdValido('2026-46'), false);
});

test('Iniciar nova semana abre a seguinte à última aberta, até a atual + 2', () => {
  const hoje = '2026-11-04'; // semana 45
  assert.equal(proximaSemanaParaAbrir([], hoje), '2026-W46');
  assert.equal(proximaSemanaParaAbrir(['2026-W45'], hoje), '2026-W46');
  assert.equal(proximaSemanaParaAbrir(['2026-W44', '2026-W45', '2026-W46'], hoje), '2026-W47');
  assert.equal(proximaSemanaParaAbrir(['2026-W45', '2026-W46', '2026-W47'], hoje), null);
  assert.equal(proximaSemanaParaAbrir(['2026-W52'], '2026-12-23'), '2026-W53');
  assert.equal(proximaSemanaParaAbrir(['2026-W53'], '2026-12-23'), '2027-W01');
});

test('semanas organizadas em futuras, atual e anteriores', () => {
  const grupos = organizarSemanas(['2026-W43', '2026-W47', '2026-W45', '2026-W44', '2026-W46'], '2026-11-04');
  assert.deepEqual(grupos, { futuras: ['2026-W47', '2026-W46'], atual: '2026-W45', anteriores: ['2026-W44', '2026-W43'] });
  assert.equal(organizarSemanas(['2026-W44'], '2026-11-04').atual, null);
});

test('calendário cobre a semana anterior, a atual e as duas seguintes', () => {
  const dias = diasDoCalendario('2026-11-04');
  assert.equal(dias.length, 28);
  assert.equal(dias[0], '2026-10-26');
  assert.equal(dias.at(-1), '2026-11-22');
});

test('período: um só lado vale como um dia; sem datas não há período', () => {
  assert.deepEqual(periodoDe({ inicio: '2026-11-03', fim: null }), { inicio: '2026-11-03', fim: '2026-11-03' });
  assert.deepEqual(periodoDe({ inicio: null, fim: '2026-11-05' }), { inicio: '2026-11-05', fim: '2026-11-05' });
  assert.equal(periodoDe({ inicio: null, fim: null }), null);
});

test('conflito: mesma pessoa (motorista ou auxiliar) ou mesmo veículo no mesmo dia', () => {
  const lista = [
    programacao('a', { item: 'Transporte', inicio: '2026-11-02', fim: '2026-11-04', motorista: { uid: 'u1', nome: 'Ederson' }, veiculos: [{ id: 'v1', nome: 'TRK-8I95' }] }),
    programacao('b', { item: 'Montagem', inicio: '2026-11-04', fim: '2026-11-06', auxiliar: { uid: 'u1', nome: 'Ederson' } }),
    programacao('c', { item: 'Buscar', inicio: '2026-11-03', fim: null, veiculos: [{ id: 'v2', nome: 'IVF-8072' }, { id: 'v1', nome: 'TRK-8I95' }] }),
    programacao('d', { item: 'Sem data', motorista: { uid: 'u1', nome: 'Ederson' } }),
    programacao('e', { item: 'Outro dia', inicio: '2026-11-09', motorista: { uid: 'u1', nome: 'Ederson' } }),
  ];
  const conflitos = conflitosPorProgramacao(lista);
  assert.deepEqual(conflitos.get('a')?.map(textoConflito).sort(), ['Ederson também em "Montagem" (04/11)', 'TRK-8I95 também em "Buscar" (03/11)']);
  assert.deepEqual(conflitos.get('b')?.map(textoConflito), ['Ederson também em "Transporte" (04/11)']);
  assert.deepEqual(conflitos.get('c')?.map(textoConflito), ['TRK-8I95 também em "Transporte" (03/11)']);
  assert.equal(conflitos.has('d'), false);
  assert.equal(conflitos.has('e'), false);
  const nomeAtual = conflitosPorProgramacao(lista, (tipo, id) => `${tipo}:${id}`);
  assert.equal(nomeAtual.get('b')?.[0].nome, 'pessoa:u1');
});

test('calendário: barras recortadas aos 28 dias e empilhadas quando se sobrepõem', () => {
  const dias = diasDoCalendario('2026-11-04');
  const { barras, faixas } = barrasDaLinha([
    programacao('a', { inicio: '2026-10-20', fim: '2026-10-27' }),
    programacao('b', { inicio: '2026-10-27', fim: '2026-10-29' }),
    programacao('c', { inicio: '2026-10-30', fim: '2026-12-01' }),
    programacao('d', { inicio: '2026-12-10' }),
    programacao('e'),
  ], dias);
  assert.equal(faixas, 2);
  assert.deepEqual(barras.map((barra) => [barra.programacao.id, barra.de, barra.ate, barra.faixa, barra.cortadaAntes, barra.cortadaDepois]), [
    ['a', 0, 1, 0, true, false],
    ['b', 1, 3, 1, false, false],
    ['c', 4, 27, 0, false, true],
  ]);
});

test('veículos: lista sem repetir, até 4; o documento antigo com um só veículo continua lido', () => {
  assert.deepEqual(veiculosDoDocumento({ veiculo: { id: 'v1', nome: 'TRK' } }), [{ id: 'v1', nome: 'TRK' }]);
  assert.deepEqual(veiculosDoDocumento({ veiculo: null }), []);
  assert.deepEqual(veiculosDoDocumento({}), []);
  assert.deepEqual(veiculosDoDocumento({ veiculos: [], veiculo: { id: 'v1', nome: 'TRK' } }), []);
  assert.deepEqual(
    veiculosDoDocumento({ veiculos: [{ id: 'a', nome: 'A' }, { id: 'a', nome: 'A' }, null, { id: 'b' }, { id: 'c', nome: 'C' }, { id: 'd', nome: 'D' }, { id: 'e', nome: 'E' }] }).map((v) => v.id),
    ['a', 'b', 'c', 'd'],
  );
});

test('status: etiqueta pelo id, pelo nome (valor de antes) ou texto em cinza', () => {
  assert.equal(ETIQUETAS_PADRAO.length, 15);
  assert.equal(new Set(ETIQUETAS_PADRAO.map((etiqueta) => etiqueta.id)).size, 15);
  assert.equal(statusExibido('1', ETIQUETAS_PADRAO).nome, 'Em viagem');
  assert.equal(statusExibido('Carregar', ETIQUETAS_PADRAO).etiqueta?.id, '3');
  assert.deepEqual(statusExibido('Programado', ETIQUETAS_PADRAO), { nome: 'Programado', cor: COR_SEM_STATUS, etiqueta: null });
  assert.deepEqual(statusExibido('', ETIQUETAS_PADRAO), { nome: '', cor: COR_SEM_STATUS, etiqueta: null });
  assert.equal(textoEscuro('#ffcb00'), true);
  assert.equal(textoEscuro('#175a63'), false);
  assert.equal(novoIdEtiqueta(ETIQUETAS_PADRAO), '16');
  assert.deepEqual(
    etiquetasLimpas([{ id: '1', nome: ' A ', cor: '#000' }, { id: '2', nome: '', cor: '#000' }, { id: '3', nome: 'a', cor: '#000' }, { id: '1', nome: 'B', cor: '#000' }]),
    [{ id: '1', nome: 'A', cor: '#000' }],
  );
});

test('editar etiquetas: excluída deixa a linha sem status; nome de antes vira id', () => {
  const antes = [{ id: '1', nome: 'Em viagem', cor: '#a' }, { id: '2', nome: 'Parado', cor: '#b' }, { id: '3', nome: 'Carregar', cor: '#c' }];
  const depois = [{ id: '1', nome: 'Viajando', cor: '#a' }, { id: '3', nome: 'Carregar', cor: '#c' }, { id: '4', nome: 'Nova', cor: '#d' }];
  const linhas = [
    { id: 'a', status: '1' },         // renomeada: nada muda
    { id: 'b', status: '2' },         // excluída
    { id: 'c', status: 'Carregar' },  // nome de antes
    { id: 'd', status: 'Parado' },    // nome de antes de uma excluída
    { id: 'e', status: 'Programado' }, // texto livre
    { id: 'f', status: '' },
  ];
  assert.deepEqual(statusAoSalvarEtiquetas(linhas, antes, depois), [
    { id: 'b', status: '' },
    { id: 'c', status: '3' },
    { id: 'd', status: '' },
  ]);
});

test('código: semana, dia da segunda, dia do domingo e a ordem na semana', () => {
  assert.equal(codigoDaProgramacao('2026-W46', 1), '46091501');
  assert.equal(codigoDaProgramacao('2026-W46', 12), '46091512');
  assert.equal(codigoDaProgramacao('2026-W46', 100), '460915100');
  assert.equal(codigoDaProgramacao('2026-W45', 3), '45020803');
  assert.equal(codigoDaProgramacao('2026-W01', 1), '01290401'); // 29/12/2025 a 04/01/2026
  assert.equal(codigoDaProgramacao('2026-W53', 2), '53280302'); // 28/12/2026 a 03/01/2027
  const linhas = [programacao('b', { posicao: 2 }), programacao('a', { posicao: 1, cod: '46091501' }), programacao('c', { posicao: 1 })];
  assert.deepEqual(semCodigoEmOrdem(linhas).map((linha) => linha.id), ['c', 'b']);
});

test('arrastar: a nova posição fica entre os vizinhos; soltar no mesmo lugar não grava', () => {
  const linhas = [{ id: 'a', posicao: 10 }, { id: 'b', posicao: 20 }, { id: 'c', posicao: 30 }];
  assert.equal(posicaoAoSoltar(linhas, 'c', 'a'), -990);   // para o topo
  assert.equal(posicaoAoSoltar(linhas, 'a', 'c'), 25);     // entre b e c
  assert.equal(posicaoAoSoltar(linhas, 'a', null), 1030);  // para o fim
  assert.equal(posicaoAoSoltar(linhas, 'b', 'c'), null);   // já está antes de c
  assert.equal(posicaoAoSoltar(linhas, 'c', null), null);  // já é a última
  assert.equal(posicaoAoSoltar(linhas, 'b', 'b'), null);
  assert.equal(posicaoAoSoltar(linhas, 'b', 'x'), null);   // alvo de outra semana
});
