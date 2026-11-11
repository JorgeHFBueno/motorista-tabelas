import test from 'node:test';
import assert from 'node:assert/strict';
import { idDaAtualizacaoMonday, textoDoMonday } from '../lib/fridayMondayConverter.js';

const ligados = { 111: 'uid-ana' };
const uidDe = (id) => ligados[id];

test('atualização do monday: parágrafos, quebras, listas e entidades viram texto', () => {
  const html = '<p>Olá&nbsp;equipe,</p><p>Segue a <b>posição</b> &amp; prazos:<br>linha 2</p><ul><li>Item A</li><li>Item &lt;B&gt;</li></ul><p></p><p></p><p>Fim &#233; &#xE7;</p>';
  assert.equal(textoDoMonday(html, uidDe), 'Olá equipe,\nSegue a posição & prazos:\nlinha 2\n• Item A\n• Item <B>\n\nFim é ç');
});

test('atualização do monday: menção a pessoa ligada vira @{uid}; sem vínculo fica o nome', () => {
  const ana = '<a class="user_mention_editor router" href="https://ledur.monday.com/users/111" data-mention-type="User" data-mention-id="111" target="_blank">@Ana Souza</a>';
  const bia = '<a class="user_mention_editor router" href="https://ledur.monday.com/users/222" data-mention-id="222" data-mention-type="User">@Bia</a>';
  assert.equal(textoDoMonday(`<p>${ana} e ${bia}, vejam</p>`, uidDe), '@{uid-ana} e @Bia, vejam');
});

test('atualização do monday: links ficam como endereço (com o texto antes quando diferente)', () => {
  const html = '<p><a href="https://exemplo.com/a?x=1&amp;y=2">planilha</a> e <a href="https://exemplo.com/b">https://exemplo.com/b</a> e <a href="javascript:void(0)">nada</a></p>';
  assert.equal(textoDoMonday(html, uidDe), 'planilha (https://exemplo.com/a?x=1&y=2) e https://exemplo.com/b e nada');
});

test('atualização do monday: vazio, nulo e imagem solta não quebram', () => {
  assert.equal(textoDoMonday(null, uidDe), '');
  assert.equal(textoDoMonday('<p><img src="https://x/y.png"></p>', uidDe), '');
});

test('id da atualização do monday segue a hora em que foi escrita', () => {
  const a = idDaAtualizacaoMonday('2025-03-10T12:00:00Z', '3812345678');
  const b = idDaAtualizacaoMonday('2025-03-10T12:00:01Z', '3812345001');
  assert.equal(a, Date.parse('2025-03-10T12:00:00Z') * 1000 + 678);
  assert.ok(b > a);
  assert.equal(String(a).length, 16);
  assert.equal(idDaAtualizacaoMonday('não é data', '1'), null);
});
