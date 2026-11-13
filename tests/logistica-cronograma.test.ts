import assert from 'node:assert/strict';
import test from 'node:test';
import { pessoaDoDocumento, veiculosDoDocumento, type Programacao } from '../src/features/cronograma-logistica/domain/models';
import { posicaoAoSoltar } from '../src/features/cronograma-logistica/domain/ordem';
import {
  COR_SEM_STATUS, ETIQUETAS_PADRAO, etiquetasLimpas, novoIdEtiqueta, statusAoSalvarEtiquetas, statusExibido, textoEscuro,
} from '../src/features/cronograma-logistica/domain/status';
import { codigoConvertido, codigoDaProgramacao, semCodigoEmOrdem, textoCodigo } from '../src/features/cronograma-logistica/domain/codigo';
import { colunasVisiveis, ordenarPor, prefsLimpas } from '../src/features/cronograma-logistica/domain/colunas';
import {
  diasDoCalendario, inicioDaSemanaId, organizarSemanas, proximaSemanaParaAbrir, rotuloSemana, semanaIdDe, semanaIdValido,
} from '../src/features/cronograma-logistica/domain/semanas';
import {
  conflitosAtivos, conflitosIgnorados, conflitosPorProgramacao, periodoDe, textoConflito,
} from '../src/features/cronograma-logistica/domain/conflitos';
import { barrasDaLinha, dicaDaBarra, linhasDoCalendario } from '../src/features/cronograma-logistica/domain/calendario';
import { perguntarAdiamento, textoAdiamento } from '../src/features/cronograma-logistica/domain/adiamento';
import { automacaoDaColuna, statusPorAutomacao } from '../src/features/cronograma-logistica/domain/automacoes';

const programacao = (id: string, extra: Partial<Programacao> = {}): Programacao => ({
  id, cod: null, codAntigo: null, semanaId: '2026-W45', item: `Item ${id}`, status: '', inicio: null, fim: null,
  motorista: null, auxiliar: null, veiculos: [], obra: null, expedicao: '', adiamento: '', nota: null, posicao: 0, conflitosIgnorados: [],
  criadoPor: null, criadoEm: null, modificadoPor: null, modificadoEm: null, ...extra,
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
    programacao('a', { item: 'Transporte', inicio: '2026-11-02', fim: '2026-11-04', motorista: { id: 'u1', nome: 'Ederson' }, veiculos: [{ id: 'v1', nome: 'TRK-8I95' }] }),
    programacao('b', { item: 'Montagem', inicio: '2026-11-04', fim: '2026-11-06', auxiliar: { id: 'u1', nome: 'Ederson' } }),
    programacao('c', { item: 'Buscar', inicio: '2026-11-03', fim: null, veiculos: [{ id: 'v2', nome: 'IVF-8072' }, { id: 'v1', nome: 'TRK-8I95' }] }),
    programacao('d', { item: 'Sem data', motorista: { id: 'u1', nome: 'Ederson' } }),
    programacao('e', { item: 'Outro dia', inicio: '2026-11-09', motorista: { id: 'u1', nome: 'Ederson' } }),
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

test('calendário: linhas por Cod (ordem do código), por motorista e por veículo, com várias barras na mesma linha', () => {
  const dias = diasDoCalendario('2026-11-04');
  const nomes = { nomePessoa: (_id: string, retrato: string) => retrato, nomeVeiculo: (_id: string, retrato: string) => retrato };
  const caminhao = { id: 'v1', nome: 'TRK-8I95' };
  const lista = [
    programacao('a', { cod: 462602, semanaId: '2026-W46', inicio: '2026-11-10', veiculos: [caminhao], motorista: { id: 'm1', nome: 'Zeca' } }),
    programacao('b', { cod: 452601, inicio: '2026-11-03', fim: '2026-11-10', veiculos: [caminhao, caminhao] }),
    programacao('c', { cod: 462601, semanaId: '2026-W46', inicio: '2026-11-10', motorista: { id: 'm2', nome: 'Ana' } }),
    programacao('d', { inicio: '2026-11-12' }),
    programacao('e', { cod: 452602 }), // sem período: fora do calendário
  ];
  assert.deepEqual(linhasDoCalendario(lista, dias, 'cod', nomes).map((linha) => [linha.nome, linha.programacoes.map((p) => p.id)]), [
    ['LOG-452601', ['b']], ['LOG-462601', ['c']], ['LOG-462602', ['a']], ['Sem código', ['d']],
  ]);
  assert.deepEqual(linhasDoCalendario(lista, dias, 'motorista', nomes).map((linha) => linha.nome), ['Ana', 'Zeca', 'Sem motorista']);
  const [linhaCaminhao, semVeiculo] = linhasDoCalendario(lista, dias, 'veiculo', nomes);
  assert.deepEqual(linhaCaminhao.programacoes.map((p) => p.id), ['a', 'b']);
  assert.equal(barrasDaLinha(linhaCaminhao.programacoes, dias).faixas, 2); // as duas no dia 10: uma em cima da outra
  assert.deepEqual(semVeiculo.programacoes.map((p) => p.id), ['c', 'd']);
});

test('calendário: dica com Cod | Motivo, veículo e motorista fora da própria linha, auxiliar quando há', () => {
  const nomes = { nomePessoa: (id: string) => `P-${id}`, nomeVeiculo: (id: string) => `V-${id}` };
  const item = programacao('a', {
    cod: 462601, item: 'Deslocamento para Obra', motorista: { id: 'm1', nome: '' }, auxiliar: { id: 'x1', nome: '' },
    veiculos: [{ id: 'v1', nome: '' }, { id: 'v2', nome: '' }],
  });
  assert.deepEqual(dicaDaBarra(item, 'cod', 'a', nomes), ['LOG-462601 | Deslocamento para Obra', 'Veículos: V-v1, V-v2', 'Motorista: P-m1', 'Auxiliar: P-x1']);
  assert.deepEqual(dicaDaBarra(item, 'motorista', 'm1', nomes), ['LOG-462601 | Deslocamento para Obra', 'Veículos: V-v1, V-v2', 'Auxiliar: P-x1']);
  assert.deepEqual(dicaDaBarra(item, 'veiculo', 'v1', nomes), ['LOG-462601 | Deslocamento para Obra', 'Veículo: V-v2', 'Motorista: P-m1', 'Auxiliar: P-x1']);
  assert.deepEqual(dicaDaBarra(programacao('b', { item: ' ', veiculos: [{ id: 'v1', nome: '' }] }), 'veiculo', 'v1', nomes), ['Sem código | Sem motivo']);
});

test('adiamento: pergunta sempre que o fim que existia muda de data; o texto leva o fim de antes, os dias e o motivo', () => {
  assert.equal(perguntarAdiamento('2026-11-10', '2026-11-12'), true);
  assert.equal(perguntarAdiamento('2026-11-20', '2026-11-18'), true); // dentro do prazo, antecipando: também pergunta
  assert.equal(perguntarAdiamento('2026-11-10', '2026-11-10'), false);
  assert.equal(perguntarAdiamento(null, '2026-11-12'), false); // não tinha fim
  assert.equal(perguntarAdiamento('2026-11-10', null), false); // tirou o fim
  assert.equal(textoAdiamento('2026-11-10', '2026-11-11', ' chuva '), 'adiada de 10/11 (1 dia), pelo motivo de chuva');
  assert.equal(textoAdiamento('2026-12-30', '2027-01-04', 'férias coletivas'), 'adiada de 30/12 (5 dias), pelo motivo de férias coletivas');
  assert.ok(textoAdiamento('2026-11-10', '2026-11-30', 'x'.repeat(500)).length <= 200);
  assert.equal(textoAdiamento('2026-11-20', '2026-11-18', 'cliente pediu'), 'antecipada de 20/11 (2 dias), pelo motivo de cliente pediu');
  assert.equal(textoAdiamento('2026-11-20', '2026-11-19', 'x'), 'antecipada de 20/11 (1 dia), pelo motivo de x');
  assert.ok(textoAdiamento('2026-11-30', '2026-11-01', 'x'.repeat(500)).length <= 200);
});

test('automações: Expedição recebe valor → Ag. NF; Nota recebe o PDF → Em viagem; só quando o campo estava vazio', () => {
  const nota = { caminho: 'logistica/notas/p/1-nf.pdf', url: 'u', nome: 'nf.pdf', tamanho: 1 };
  const linha = programacao('p', { status: '3' });
  assert.equal(statusPorAutomacao(linha, { expedicao: 'EXP 1234' }, ETIQUETAS_PADRAO), '2');
  assert.equal(statusPorAutomacao(linha, { nota }, ETIQUETAS_PADRAO), '1');
  assert.equal(statusPorAutomacao(linha, { expedicao: '   ' }, ETIQUETAS_PADRAO), null);
  assert.equal(statusPorAutomacao(programacao('p', { status: '3', expedicao: 'EXP 1' }), { expedicao: 'EXP 2' }, ETIQUETAS_PADRAO), null); // troca não dispara
  assert.equal(statusPorAutomacao(programacao('p', { status: '3', nota }), { nota: { ...nota, nome: 'outra.pdf' } }, ETIQUETAS_PADRAO), null);
  assert.equal(statusPorAutomacao(programacao('p', { status: '2' }), { expedicao: 'EXP 1' }, ETIQUETAS_PADRAO), null); // já está em Ag. NF
  assert.equal(statusPorAutomacao(linha, { motorista: null }, ETIQUETAS_PADRAO), null);
  // Pelo nome da etiqueta (sem acento nem caixa), com a lista editada; sem a etiqueta, nada muda.
  const editadas = [{ id: '30', nome: 'EM VIAGEM', cor: '#fff' }, { id: '31', nome: 'ag. nf', cor: '#fff' }];
  assert.equal(statusPorAutomacao(linha, { nota }, editadas), '30');
  assert.equal(statusPorAutomacao(linha, { expedicao: 'EXP 1' }, editadas), '31');
  assert.equal(statusPorAutomacao(linha, { expedicao: 'EXP 1' }, [{ id: '1', nome: 'Carregar', cor: '#fff' }]), null);
  assert.ok(automacaoDaColuna('expedicao')?.includes('Ag. NF'));
  assert.ok(automacaoDaColuna('nota')?.includes('Em viagem'));
  assert.equal(automacaoDaColuna('status'), null);
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

test('código: semana, ano e a ordem na semana, gravado como número e mostrado com LOG-', () => {
  assert.equal(codigoDaProgramacao('2026-W46', 1), 462601);
  assert.equal(codigoDaProgramacao('2026-W46', 12), 462612);
  assert.equal(codigoDaProgramacao('2026-W46', 100), 4626100);
  assert.equal(codigoDaProgramacao('2026-W01', 1), 12601); // ano da semana ISO: 29/12/2025 a 04/01/2026 é de 2026
  assert.equal(codigoDaProgramacao('2026-W53', 2), 532602);
  assert.equal(codigoDaProgramacao('2027-W01', 3), 12703);
  assert.equal(textoCodigo(462601), 'LOG-462601');
  assert.equal(textoCodigo(12601), 'LOG-012601');
  // Código antigo (semana, dia da segunda, dia do domingo, ordem) vira o novo com a mesma ordem.
  assert.equal(codigoConvertido('2026-W46', '46091501'), 462601);
  assert.equal(codigoConvertido('2026-W46', '460915100'), 4626100);
  assert.equal(codigoConvertido('2026-W01', '01290403'), 12603);
  assert.equal(codigoConvertido('2026-W46', '4609'), null);
  assert.equal(codigoConvertido('2026-W46', '46091500'), null);
  const linhas = [programacao('b', { posicao: 2 }), programacao('a', { posicao: 1, cod: 462601 }), programacao('c', { posicao: 1 })];
  assert.deepEqual(semCodigoEmOrdem(linhas).map((linha) => linha.id), ['c', 'b']);
});

test('conflito ignorado: some do aviso nas duas linhas, de qualquer lado que se ignore', () => {
  const pessoa = { id: 'f1', nome: 'Fernando' };
  const veiculo = { id: 'v1', nome: 'Caminhão' };
  const a = programacao('a', { inicio: '2026-11-03', fim: '2026-11-03', motorista: pessoa, veiculos: [veiculo] });
  const b = programacao('b', { inicio: '2026-11-03', fim: '2026-11-04', motorista: pessoa, veiculos: [veiculo] });
  const todos = conflitosPorProgramacao([a, b]);
  assert.deepEqual(todos.get('a')!.map((conflito) => conflito.chave), ['p:f1|b', 'v:v1|b']);
  assert.equal(conflitosAtivos(todos).size, 2);

  // a ignora o do motorista: some em a e em b; o do veículo continua avisando.
  const comA = conflitosPorProgramacao([{ ...a, conflitosIgnorados: ['p:f1|b'] }, b]);
  assert.deepEqual(conflitosAtivos(comA).get('a')!.map((conflito) => conflito.tipo), ['veiculo']);
  assert.deepEqual(conflitosAtivos(comA).get('b')!.map((conflito) => conflito.tipo), ['veiculo']);
  assert.deepEqual(conflitosIgnorados(comA).get('b')!.map((conflito) => conflito.chave), ['p:f1|a']);

  // b ignora os dois: nada avisa.
  const comB = conflitosPorProgramacao([a, { ...b, conflitosIgnorados: ['p:f1|a', 'v:v1|a'] }]);
  assert.equal(conflitosAtivos(comB).size, 0);
  assert.equal(conflitosIgnorados(comB).get('a')!.length, 2);
});

test('colunas: fixadas primeiro e paradas, ocultas fora, preferência inválida descartada', () => {
  const prefs = prefsLimpas({
    larguras: { item: 400, cod: 10, outra: 50 }, fixas: ['motorista', 'nada'], ocultas: ['item', 'nota', 'nota'], ordem: { chave: 'nota', dir: 1 },
  });
  assert.deepEqual(prefs, { larguras: { item: 400, cod: 70 }, fixas: ['motorista'], ocultas: ['nota'], ordem: null });
  const colunas = colunasVisiveis({ ...prefs, fixas: ['motorista', 'cod'] });
  assert.deepEqual(colunas.slice(0, 3).map((coluna) => [coluna.chave, coluna.esquerda, coluna.ultimaFixa]), [
    ['cod', 0, false], ['motorista', 70, true], ['item', null, false],
  ]);
  assert.equal(colunas.find((coluna) => coluna.chave === 'item')!.largura, 400);
  assert.ok(!colunas.some((coluna) => coluna.chave === 'nota'));
  assert.equal(prefsLimpas('lixo').ordem, null);
});

test('ordenar por coluna: vazios no fim nos dois sentidos; empate na ordem da semana', () => {
  const linhas = [
    { id: 'a', posicao: 1, v: 'Bruno' }, { id: 'b', posicao: 2, v: '' }, { id: 'c', posicao: 3, v: 'álvaro' }, { id: 'd', posicao: 4, v: 'Bruno' },
  ];
  assert.deepEqual(ordenarPor(linhas, (linha) => linha.v, 1).map((linha) => linha.id), ['c', 'a', 'd', 'b']);
  assert.deepEqual(ordenarPor(linhas, (linha) => linha.v, -1).map((linha) => linha.id), ['a', 'd', 'c', 'b']);
  const numeros = [{ id: 'x', posicao: 1, n: 462610 }, { id: 'y', posicao: 2, n: 462602 }, { id: 'z', posicao: 3, n: null }];
  assert.deepEqual(ordenarPor(numeros, (linha) => linha.n, 1).map((linha) => linha.id), ['y', 'x', 'z']);
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

test('motorista/auxiliar: item do Friday {id, nome}; a linha de antes guarda {uid, nome} de funcionarios', () => {
  assert.deepEqual(pessoaDoDocumento({ id: '1793804494999001', nome: 'Ederson' }), { id: '1793804494999001', nome: 'Ederson' });
  assert.deepEqual(pessoaDoDocumento({ uid: 'abcUID', nome: 'Fernando' }), { id: 'abcUID', nome: 'Fernando' });
  assert.equal(pessoaDoDocumento(null), null);
  assert.equal(pessoaDoDocumento({ id: '', nome: 'x' }), null);
});
