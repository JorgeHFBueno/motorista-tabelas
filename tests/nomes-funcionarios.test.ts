import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { nomeACorrigir, nomeCapitalizado } from '../tools/nomes-funcionarios/regra';

test('only the first letter of each word stays uppercase; de, da, do, das, dos and e go lowercase after the first word', () => {
  assert.equal(nomeCapitalizado('JOÃO PEREIRA DE LIMA'), 'João Pereira de Lima');
  assert.equal(nomeCapitalizado('PAULO DOS REIS DAS NEVES'), 'Paulo dos Reis das Neves');
  assert.equal(nomeCapitalizado('ANA DA SILVA E SOUZA'), 'Ana da Silva e Souza');
  assert.equal(nomeCapitalizado('MARIA DAS DORES DO CARMO'), 'Maria das Dores do Carmo');
  assert.equal(nomeCapitalizado('DOS SANTOS'), 'Dos Santos');
});

test('accents stay, hyphen and apostrophe raise the next letter, II/III/IV stay uppercase, extra spaces go away', () => {
  assert.equal(nomeCapitalizado('ÉRICO ÂNGELO'), 'Érico Ângelo');
  assert.equal(nomeCapitalizado("ANA D'ÁVILA"), "Ana D'Ávila");
  assert.equal(nomeCapitalizado('ANA-MARIA LOPES'), 'Ana-Maria Lopes');
  assert.equal(nomeCapitalizado('PEDRO ALVES II'), 'Pedro Alves II');
  assert.equal(nomeCapitalizado('  LUCAS   MOREIRA COSTA '), 'Lucas Moreira Costa');
});

test('only names all in uppercase or all in lowercase change', () => {
  assert.equal(nomeACorrigir('JOÃO PEREIRA DE LIMA'), 'João Pereira de Lima');
  assert.equal(nomeACorrigir('joão da silva'), 'João da Silva');
  assert.equal(nomeACorrigir('Pedro Alves Rodrigues'), null);
  assert.equal(nomeACorrigir('Paulo Dos Reis'), null);
  assert.equal(nomeACorrigir('pessoa@example.com'), null);
  assert.equal(nomeACorrigir('51999999999'), null);
  assert.equal(nomeACorrigir(undefined), null);
  assert.equal(nomeACorrigir(42), null);
});

// functions/nomeFuncionario.ts é cópia da regra (as Functions de cadastro gravam o nome já corrigido). Caminhos a partir da
// raiz do projeto (os scripts npm rodam de lá).
test('the Functions copy is the same as the rule (below the marker)', () => {
  const ler = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  const servidor = ler('functions/nomeFuncionario.ts').split('// ---- início da cópia ----\n')[1];
  assert.equal(servidor, ler('tools/nomes-funcionarios/regra.ts'), 'functions/nomeFuncionario.ts divergiu de tools/nomes-funcionarios/regra.ts: copie de novo');
});
