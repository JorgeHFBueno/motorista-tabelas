import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cidadeEstado, coordenadaDoLink, createLogisticaLocalService, ehLinkDoMaps, linkDoTexto, textoDoLugar,
} from '../lib/logisticaLocal.js';

const LUGAR = 'https://www.google.com/maps/place/Viale+Regina+Elena,+295,+00161+Roma+RM/@41.9047971,12.5145067,17z/data=!3m1!4b1!4m6!3m5!1s0x132f6177890166ff:0xb9be2b1f4b72ff53!8m2!3d41.9047931!4d12.5170816!16s%2Fg%2F11trk6rlm6?entry=tts';
const SEM_NUMERO = 'https://www.google.com/maps/place/Rua+Sinimbu,+1000+-+Centro,+Caxias+do+Sul+-+RS/data=!4m2!3m1!1s0x1ebfc06ee282e2a9:0x843802deff256922?entry=gps';

test('só links do Google Maps; o link sai do meio do texto colado', () => {
  for (const link of ['https://maps.app.goo.gl/abc', 'https://goo.gl/maps/abc', 'https://www.google.com/maps/@-29,-51,15z', 'https://www.google.com.br/maps/place/x', 'https://maps.google.com/?q=-29,-51']) {
    assert.equal(ehLinkDoMaps(new URL(link)), true, link);
  }
  for (const link of ['https://goo.gl/abc', 'https://www.google.com/search?q=x', 'https://google.evil.com/maps', 'https://maps.app.goo.gl.evil.com/x', 'ftp://maps.app.goo.gl/x', 'https://example.com/maps']) {
    assert.equal(ehLinkDoMaps(new URL(link)), false, link);
  }
  assert.equal(linkDoTexto('Ledur Engenharia\nhttps://maps.app.goo.gl/2nWdWPR2gTpXpxqx6 ')?.href, 'https://maps.app.goo.gl/2nWdWPR2gTpXpxqx6');
  assert.equal(linkDoTexto('sem link'), null);
  assert.equal(linkDoTexto(42), null);
  assert.equal(linkDoTexto('https://example.com/maps/@-29,-51'), null);
});

test('coordenada: pino do lugar antes do centro da tela; parâmetros e caminho', () => {
  assert.deepEqual(coordenadaDoLink(new URL(LUGAR)), { lat: 41.9047931, lng: 12.5170816 });
  assert.deepEqual(coordenadaDoLink(new URL('https://www.google.com/maps/@-29.1678,-51.1794,15z')), { lat: -29.1678, lng: -51.1794 });
  assert.deepEqual(coordenadaDoLink(new URL('https://maps.google.com/?q=-29.1678,-51.1794')), { lat: -29.1678, lng: -51.1794 });
  assert.deepEqual(coordenadaDoLink(new URL('https://www.google.com/maps/search/?api=1&query=-29.1%2C-51.2')), { lat: -29.1, lng: -51.2 });
  assert.deepEqual(coordenadaDoLink(new URL('https://www.google.com/maps/search/-29.1678,+-51.1794?entry=tts')), { lat: -29.1678, lng: -51.1794 });
  assert.deepEqual(coordenadaDoLink(new URL('https://www.google.com/maps/dir/?api=1&destination=-29.5,-51.5')), { lat: -29.5, lng: -51.5 });
  assert.equal(coordenadaDoLink(new URL(SEM_NUMERO)), null);
  assert.equal(coordenadaDoLink(new URL('https://www.google.com/maps/@95.1,10.2,15z')), null);
});

test('lugar sem coordenada: o nome ou endereço do link', () => {
  assert.equal(textoDoLugar(new URL(SEM_NUMERO)), 'Rua Sinimbu, 1000 - Centro, Caxias do Sul - RS');
  assert.equal(textoDoLugar(new URL('https://maps.google.com/?q=Ledur+Engenharia&ftid=0x1:0x2')), 'Ledur Engenharia');
  assert.equal(textoDoLugar(new URL('https://maps.google.com/?q=-29.1,-51.2')), null);
  assert.equal(textoDoLugar(new URL('https://www.google.com/maps/@-29.1,-51.2,15z')), null);
});

test('cidade e estado: sigla no Brasil, nome do estado fora; cidade, town ou village', () => {
  assert.deepEqual(cidadeEstado({ city: 'Caxias do Sul', state: 'Rio Grande do Sul', 'ISO3166-2-lvl4': 'BR-RS' }), { cidade: 'Caxias do Sul', uf: 'RS' });
  assert.deepEqual(cidadeEstado({ town: 'Farroupilha', 'ISO3166-2-lvl4': 'BR-RS' }), { cidade: 'Farroupilha', uf: 'RS' });
  assert.deepEqual(cidadeEstado({ village: 'Vila Seca', municipality: 'Caxias do Sul', 'ISO3166-2-lvl4': 'BR-RS' }), { cidade: 'Vila Seca', uf: 'RS' });
  assert.deepEqual(cidadeEstado({ city: 'Roma', state: 'Lazio', 'ISO3166-2-lvl4': 'IT-62' }), { cidade: 'Roma', uf: 'Lazio' });
  assert.deepEqual(cidadeEstado(null), { cidade: '', uf: '' });
});

function servico({ redirecionamentos = {}, endereco = { city: 'Caxias do Sul', 'ISO3166-2-lvl4': 'BR-RS' }, achado = null } = {}) {
  const funcionarios = { log: { ativo: true, perfis: { logistica: true } }, mec: { ativo: true, perfis: { mecanico: true } }, adm: { ativo: true, perfis: { adm2: true } }, eng: { ativo: true, perfis: { engenharia: true } } };
  const chamadas = { redirecionamento: [], enderecoDa: [], buscar: [] };
  const service = createLogisticaLocalService({
    async getEmployee(uid) { return funcionarios[uid]; },
    async redirecionamento(url) { chamadas.redirecionamento.push(url); if (redirecionamentos[url] instanceof Error) throw redirecionamentos[url]; return redirecionamentos[url] ?? null; },
    async enderecoDa(c) { chamadas.enderecoDa.push(c); if (endereco instanceof Error) throw endereco; return endereco; },
    async buscar(texto) { chamadas.buscar.push(texto); return achado; },
  });
  return { service, chamadas };
}

test('só logistica, mecanico ou adm2; link obrigatório', async () => {
  const { service } = servico();
  await assert.rejects(service(undefined, { link: LUGAR }), (e) => e.code === 'unauthenticated');
  for (const uid of ['eng', 'nao-existe']) await assert.rejects(service(uid, { link: LUGAR }), (e) => e.code === 'permission-denied');
  for (const dados of [null, {}, { link: 'https://example.com' }]) await assert.rejects(service('log', dados), (e) => e.code === 'invalid-argument');
  for (const uid of ['log', 'mec', 'adm']) assert.equal((await service(uid, { link: LUGAR })).lat, 41.9047931);
});

test('link curto: segue o redirecionamento só para o Maps; cidade e estado da coordenada', async () => {
  const curto = 'https://maps.app.goo.gl/abc';
  const { service, chamadas } = servico({ redirecionamentos: { [curto]: 'https://www.google.com/maps/place/X/@-29.17,-51.18,17z/data=!3d-29.1678123!4d-51.1794987' } });
  assert.deepEqual(await service('log', { link: `Obra\n${curto}` }), { link: curto, lat: -29.1678123, lng: -51.1794987, cidade: 'Caxias do Sul', uf: 'RS' });
  assert.deepEqual(chamadas.redirecionamento, [curto]);
  assert.deepEqual(chamadas.enderecoDa, [{ lat: -29.1678123, lng: -51.1794987 }]);

  const fora = servico({ redirecionamentos: { [curto]: 'https://example.com/@-29.1,-51.2' } });
  await assert.rejects(fora.service('log', { link: curto }), (e) => e.code === 'not-found');

  const consentimento = servico({ redirecionamentos: { [curto]: `https://consent.google.com/m?continue=${encodeURIComponent('https://www.google.com/maps/@-29.5,-51.5,15z')}` } });
  assert.equal((await consentimento.service('log', { link: curto })).lat, -29.5);

  const caiu = servico({ redirecionamentos: { [curto]: new Error('rede') } });
  await assert.rejects(caiu.service('log', { link: curto }), (e) => e.code === 'unavailable');
});

test('sem coordenada no link: busca pelo lugar; sem achar, avisa; sem cidade, grava só a coordenada', async () => {
  const achou = servico({ achado: { lat: -29.16, lng: -51.17 } });
  assert.deepEqual(await achou.service('log', { link: SEM_NUMERO }), { link: SEM_NUMERO, lat: -29.16, lng: -51.17, cidade: 'Caxias do Sul', uf: 'RS' });
  assert.deepEqual(achou.chamadas.buscar, ['Rua Sinimbu, 1000 - Centro, Caxias do Sul - RS']);

  await assert.rejects(servico().service('log', { link: SEM_NUMERO }), (e) => e.code === 'not-found');

  const semCidade = servico({ endereco: new Error('Nominatim 503') });
  assert.deepEqual(await semCidade.service('log', { link: 'https://www.google.com/maps/@-29.123456789,-51.2,15z' }), { link: 'https://www.google.com/maps/@-29.123456789,-51.2,15z', lat: -29.1234568, lng: -51.2, cidade: '', uf: '' });
});
