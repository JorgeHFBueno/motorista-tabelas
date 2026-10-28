import assert from 'node:assert/strict';
import test from 'node:test';
import { alvosPara } from '../src/features/friday-gestao-interna/quadro/mudarTipo.ts';
import type { Coluna } from '../src/features/friday-gestao-interna/quadro/tipos.ts';
import { nomeEspelhado } from '../src/features/friday-gestao-interna/util.ts';

// Veículos (friday-cadastros/veiculos_v2_frota.nome_espelho): identificador e nome, juntados com espaço.
const ESPELHO = ['identificacao.identificador', 'identificacao.nome'];
const veiculo = (identificador: unknown, nome: unknown) => ({ identificacao: { identificador, nome } });

test('placa: identificador e nome com espaço (igual ao jeito de escrever o item)', () => {
  assert.equal(nomeEspelhado(ESPELHO, veiculo('APG-6A02', 'Volvo/VM 260')), 'APG-6A02 Volvo/VM 260');
  assert.equal(nomeEspelhado(ESPELHO, veiculo('IBE-9374', 'D-20')), 'IBE-9374 D-20');
  assert.equal(nomeEspelhado(ESPELHO, veiculo('JAW-0C71', '- Ranger prata')), 'JAW-0C71 - Ranger prata');
});

test('nome igual ao identificador (sem contar maiúsculas) não repete', () => {
  assert.equal(nomeEspelhado(ESPELHO, veiculo('IXR-7D23', 'IXR-7D23')), 'IXR-7D23');
  assert.equal(nomeEspelhado(ESPELHO, veiculo('BATE-ESTACA', 'Bate-Estaca')), 'BATE-ESTACA');
  assert.equal(nomeEspelhado(ESPELHO, veiculo('ESCAVADEIRA HIDRÁULICA CAT', 'Escavadeira Hidráulica Cat')), 'ESCAVADEIRA HIDRÁULICA CAT');
});

test('equipamento com nome diferente: os dois, espaços repetidos viram um', () => {
  assert.equal(nomeEspelhado(ESPELHO, veiculo('GERADOR 991', 'Gerador - 25991')), 'GERADOR 991 Gerador - 25991');
  assert.equal(nomeEspelhado(ESPELHO, veiculo('Escavadeira - Caterpillar', 'Escavadeira caterpillar  320')), 'Escavadeira - Caterpillar Escavadeira caterpillar 320');
});

test('parte vazia ou ausente fica de fora; sem nada, vazio (a tela usa o nome guardado)', () => {
  assert.equal(nomeEspelhado(ESPELHO, veiculo('ABC-1D23', null)), 'ABC-1D23');
  assert.equal(nomeEspelhado(ESPELHO, veiculo('  ', 'Strada')), 'Strada');
  assert.equal(nomeEspelhado(ESPELHO, undefined), '');
});

const coluna = (tipo: Coluna['tipo'], config: Record<string, unknown>, oficial = true): Coluna =>
  ({ id: 1, quadro_id: 1, titulo: 'Ano Fabricação', tipo, config, largura: 120, posicao: 1, oculta: 0, ...(oficial ? { oficial: { chave: 'cadastro.anoFabricacao' } } : {}) }) as Coluna;

test('campo oficial: só o separador de milhar de um número muda', () => {
  assert.deepEqual(alvosPara(coluna('numero', { unidade: '', resumo: 'soma' })).map(o => o.alvo), [{ tipo: 'numero', semMilhar: true }]);
  assert.deepEqual(alvosPara(coluna('numero', { milhar: false, resumo: 'nenhum' })).map(o => o.alvo), [{ tipo: 'numero' }]);
  assert.deepEqual(alvosPara(coluna('numero', { x10: true })), []);
  assert.deepEqual(alvosPara(coluna('texto', {})), []);
  assert.deepEqual(alvosPara(coluna('status', { rotulos: [] })), []);
  // Coluna livre continua com todas as opções.
  assert.ok(alvosPara(coluna('numero', {}, false)).length > 1);
});
