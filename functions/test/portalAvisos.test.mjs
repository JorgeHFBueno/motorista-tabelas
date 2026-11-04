import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const m = await import('../lib/portalAvisosDominio.js');

// Timestamp do Admin SDK (só o que o domínio usa).
const ts = (iso) => ({ toMillis: () => Date.parse(iso) });
const sha = (s) => createHash('sha256').update(s).digest('hex');

test('ids estáveis: notificação ntf_ + 28 hex e e-mail sha256 completo', () => {
  assert.equal(m.idNotificacao('u1', 'foto:f1'), `ntf_${sha('u1|foto:f1').slice(0, 28)}`);
  assert.equal(m.idNotificacao('u1', 'foto:f1').length, 32);
  assert.equal(m.idEmail('u1', 'foto:f1'), sha('email|u1|foto:f1'));
  assert.notEqual(m.idNotificacao('u1', 'foto:f1'), m.idNotificacao('u2', 'foto:f1'));
});

test('dinheiro em centavos e datas', () => {
  assert.equal(m.formatarDinheiro(123456), 'R$ 1.234,56');
  assert.equal(m.formatarDinheiro(5), 'R$ 0,05');
  assert.equal(m.formatarDinheiro(100000000), 'R$ 1.000.000,00');
  assert.equal(m.formatarDinheiro(-1990), '-R$ 19,90');
  assert.equal(m.formatarDinheiro(null), 'R$ 0,00');
  assert.equal(m.formatarData('2026-11-07'), '07/11/2026');
  assert.equal(m.formatarData('lixo'), 'lixo');
  // 2026-11-04 23:30 UTC = 20:30 em São Paulo (UTC-3).
  assert.equal(m.formatarDataHora(Date.parse('2026-11-04T23:30:00Z')), '04/11/2026 20:30');
  assert.equal(m.formatarDataHora(Date.parse('2026-11-05T02:05:00Z')), '04/11/2026 23:05');
  assert.equal(m.somarDias('2026-12-30', 3), '2027-01-02');
  assert.equal(m.somarDias('2028-02-27', 3), '2028-03-01');
});

test('vencimentos d0/d3 usam a data de São Paulo, não a UTC, perto da meia-noite', () => {
  // 01:30 UTC de 05/11 ainda é 22:30 de 04/11 em São Paulo.
  assert.deepEqual(m.datasDeVencimento(Date.parse('2026-11-05T01:30:00Z')), { hoje: '2026-11-04', em3: '2026-11-07' });
  // 03:00 UTC de 05/11 é 00:00 de 05/11 em São Paulo.
  assert.deepEqual(m.datasDeVencimento(Date.parse('2026-11-05T03:00:00Z')), { hoje: '2026-11-05', em3: '2026-11-08' });
  // 08:00 em São Paulo (horário do agendamento).
  assert.deepEqual(m.datasDeVencimento(Date.parse('2026-12-30T11:00:00Z')), { hoje: '2026-12-30', em3: '2027-01-02' });
});

test('aviso de vencimento: d3, d0, status e lixeira', () => {
  const datas = { hoje: '2026-11-04', em3: '2026-11-07' };
  const p = { obraId: 'o1', numero: 2, valor: 150000, vencimento: '2026-11-07', status: 'pendente', excluidoEm: null };
  const d3 = m.avisoVencimento('p1', p, 'Galpão X', datas);
  assert.deepEqual(d3, {
    tipo: 'financeiro_vencimento_proximo', titulo: 'Parcela vence em 3 dias',
    mensagem: 'A parcela 2 da obra Galpão X, de R$ 1.500,00, vence em 07/11/2026.',
    obraId: 'o1', origem: { colecao: 'portal-parcelas', id: 'p1' }, rota: '/financas', chave: 'parcela:p1:venc:2026-11-07:d3',
  });
  const d0 = m.avisoVencimento('p1', { ...p, vencimento: '2026-11-04', status: 'rejeitado' }, 'Galpão X', datas);
  assert.equal(d0.titulo, 'Parcela vence hoje');
  assert.equal(d0.mensagem, 'A parcela 2 da obra Galpão X, de R$ 1.500,00, vence hoje (04/11/2026).');
  assert.equal(d0.chave, 'parcela:p1:venc:2026-11-04:d0');
  assert.equal(m.avisoVencimento('p1', { ...p, status: 'pago' }, 'X', datas), null);
  assert.equal(m.avisoVencimento('p1', { ...p, status: 'comprovante_enviado' }, 'X', datas), null);
  assert.equal(m.avisoVencimento('p1', { ...p, excluidoEm: ts('2026-11-01T00:00:00Z') }, 'X', datas), null);
  assert.equal(m.avisoVencimento('p1', { ...p, vencimento: '2026-11-05' }, 'X', datas), null);
});

test('documento e foto novos', () => {
  const doc = m.avisoDocumento('d1', { obraId: 'o1', titulo: 'ART', excluidoEm: null }, 'Galpão X');
  assert.deepEqual(doc, {
    tipo: 'documento_novo', titulo: 'Novo documento disponível', mensagem: "O documento 'ART' foi publicado na obra Galpão X.",
    obraId: 'o1', origem: { colecao: 'portal-documentos', id: 'd1' }, rota: '/documentos', chave: 'documento:d1',
  });
  assert.equal(m.avisoDocumento('d1', { obraId: 'o1', titulo: 'ART', excluidoEm: ts('2026-11-01T00:00:00Z') }, 'X'), null);
  const foto = m.avisoFoto('f1', { obraId: 'o1', etapa: 'fundacao', excluidoEm: null }, 'Galpão X');
  assert.equal(foto.mensagem, 'Uma nova foto da etapa Fundação foi publicada na obra Galpão X.');
  assert.equal(foto.chave, 'foto:f1');
  assert.equal(foto.rota, '/fotos');
  assert.equal(m.avisoFoto('f2', { obraId: 'o1', etapa: 'cobertura' }, 'Y').mensagem, 'Uma nova foto da etapa Cobertura foi publicada na obra Y.');
});

test('nome da obra: nome do contrato, com recuo', () => {
  assert.equal(m.nomeDaObra({ nome: ' Galpão ' }, 'o1'), 'Galpão');
  assert.equal(m.nomeDaObra({ nome: '', numeroContrato: '12' }, 'o1'), '12');
  assert.equal(m.nomeDaObra(undefined, 'o1'), 'o1');
});

const etapas = (progresso) => [{ id: 'e1', nome: 'Projeto', ordem: 1, modoControle: 'percentual', progresso, status: 'em_andamento', itens: [{ id: 'i1', nome: 'A', ordem: 1, progresso, status: 'em_andamento' }] }];

test('progresso: só quando atualizadoEm muda e as etapas mudam', () => {
  const antes = { nome: 'Galpão X', progresso: { etapas: etapas(10), progressoGeral: 10, atualizadoEm: ts('2026-11-01T12:00:00Z') }, equipe: { saida: null, chegada: null } };
  const depois = { ...antes, progresso: { etapas: etapas(40), progressoGeral: 40, atualizadoEm: ts('2026-11-04T12:00:00Z') } };
  const [a] = m.avisosObraAtualizada('o1', antes, depois, 999);
  assert.deepEqual(a, {
    tipo: 'progresso_obra', titulo: 'Atualização no progresso da obra', mensagem: 'O progresso da obra Galpão X foi atualizado: 40% concluído.',
    obraId: 'o1', origem: { colecao: 'portal-obras', id: 'o1' }, rota: '/obra', chave: `progresso:o1:${Date.parse('2026-11-04T12:00:00Z')}`,
  });
  // Salvou de novo sem mudar as etapas (só atualizadoEm): nada.
  const mesmo = { ...antes, progresso: { ...antes.progresso, atualizadoEm: ts('2026-11-04T12:00:00Z') } };
  assert.deepEqual(m.avisosObraAtualizada('o1', antes, mesmo, 999), []);
  // Etapas iguais em outra ordem de chaves contam como iguais.
  const reordenado = { ...mesmo, progresso: { ...mesmo.progresso, etapas: etapas(10).map(e => Object.fromEntries(Object.entries(e).reverse())) } };
  assert.deepEqual(m.avisosObraAtualizada('o1', antes, reordenado, 999), []);
  // Etapas mudaram, mas atualizadoEm não (outro campo da obra): nada.
  assert.deepEqual(m.avisosObraAtualizada('o1', antes, { ...antes, progresso: { ...antes.progresso, etapas: etapas(50) } }, 999), []);
  // Troca de nome do contrato: nada.
  assert.deepEqual(m.avisosObraAtualizada('o1', antes, { ...antes, nome: 'Outro' }, 999), []);
});

test('equipe: saída e chegada confirmadas, nova data, sem repetir', () => {
  const conf = (iso) => ({ dataHora: ts(iso), confirmadoPor: { uid: 'a', nome: 'A' }, confirmadoEm: ts(iso) });
  const base = { nome: 'Galpão X', progresso: { etapas: [], atualizadoEm: null }, equipe: { saida: null, chegada: null } };
  const saiu = { ...base, equipe: { saida: conf('2026-11-04T10:15:00Z'), chegada: null } };
  const [s] = m.avisosObraAtualizada('o1', base, saiu, 1);
  assert.equal(s.tipo, 'equipe_saida_confirmada');
  assert.equal(s.titulo, 'Equipe a caminho da obra');
  assert.equal(s.mensagem, 'A equipe da Ledur saiu para a obra Galpão X em 04/11/2026 07:15.');
  assert.equal(s.chave, `equipe:o1:saida:${Date.parse('2026-11-04T10:15:00Z')}`);
  assert.equal(s.rota, '/obra');
  // Mesma saída gravada de novo (outro confirmadoEm): nada.
  assert.deepEqual(m.avisosObraAtualizada('o1', saiu, { ...saiu, equipe: { saida: { ...saiu.equipe.saida, confirmadoEm: ts('2026-11-05T00:00:00Z') }, chegada: null } }, 1), []);
  // Chegada nova e saída corrigida na mesma gravação: dois avisos.
  const ambos = { ...base, equipe: { saida: conf('2026-11-04T10:30:00Z'), chegada: conf('2026-11-04T13:00:00Z') } };
  const avisos = m.avisosObraAtualizada('o1', saiu, ambos, 1);
  assert.deepEqual(avisos.map(a => a.tipo), ['equipe_saida_confirmada', 'equipe_chegada_confirmada']);
  assert.equal(avisos[1].titulo, 'Equipe chegou à obra');
  assert.equal(avisos[1].mensagem, 'A equipe da Ledur chegou à obra Galpão X em 04/11/2026 10:00.');
  // Confirmação desfeita (volta a null): nada.
  assert.deepEqual(m.avisosObraAtualizada('o1', saiu, base, 1), []);
});

test('parcela criada: descrição opcional, valor em centavos, boleto já enviado', () => {
  const p = { obraId: 'o1', numero: 1, descricao: 'Entrada', valor: 2500050, vencimento: '2026-12-10', status: 'pendente', boleto: null, excluidoEm: null };
  assert.deepEqual(m.avisoParcelaCriada('p1', p, 'Galpão X'), {
    tipo: 'financeiro_nova_parcela', titulo: 'Nova parcela',
    mensagem: 'A parcela 1 — Entrada de R$ 25.000,50 com vencimento em 10/12/2026 foi adicionada à obra Galpão X.',
    obraId: 'o1', origem: { colecao: 'portal-parcelas', id: 'p1' }, rota: '/financas', chave: 'parcela:p1:criada',
  });
  const semDescricao = m.avisoParcelaCriada('p1', { ...p, descricao: null, boleto: { path: 'portal/obras/o1/parcelas/p1/boleto/b.pdf' } }, 'Galpão X');
  assert.equal(semDescricao.mensagem, 'A parcela 1 de R$ 25.000,50 com vencimento em 10/12/2026 foi adicionada à obra Galpão X. O boleto já está disponível.');
  assert.equal(m.avisoParcelaCriada('p1', { ...p, excluidoEm: ts('2026-11-01T00:00:00Z') }, 'X'), null);
});

test('parcela alterada: boleto, pago, rejeitado; comprovante do cliente e lixeira não avisam', () => {
  const antes = { obraId: 'o1', numero: 3, valor: 1000, vencimento: '2026-12-10', status: 'pendente', boleto: null, excluidoEm: null };
  const boleto = { ...antes, boleto: { path: 'portal/obras/o1/parcelas/p1/boleto/b.pdf' } };
  assert.deepEqual(m.mudancasParcela(antes, boleto), ['boleto']);
  assert.deepEqual(m.mudancasParcela(boleto, boleto), []);
  assert.deepEqual(m.mudancasParcela(boleto, { ...boleto, boleto: null }), []);
  assert.deepEqual(m.mudancasParcela(antes, { ...antes, status: 'comprovante_enviado' }), []);
  const pago = { ...antes, status: 'pago', conferidoEm: ts('2026-11-04T15:00:00Z') };
  assert.deepEqual(m.mudancasParcela({ ...antes, status: 'comprovante_enviado' }, pago), ['pago']);
  assert.deepEqual(m.mudancasParcela(antes, { ...pago, excluidoEm: ts('2026-11-04T15:00:00Z') }), []);
  // Uma gravação, dois avisos.
  const dois = { ...boleto, status: 'rejeitado', observacaoAdmin: 'Valor divergente', conferidoEm: ts('2026-11-04T15:00:00Z') };
  const mud = m.mudancasParcela({ ...antes, status: 'comprovante_enviado' }, dois);
  assert.deepEqual(mud, ['boleto', 'rejeitado']);
  const avisos = m.avisosParcelaAtualizada('p1', dois, mud, 'Galpão X', 777);
  assert.equal(avisos[0].tipo, 'financeiro_boleto_disponivel');
  assert.equal(avisos[0].titulo, 'Boleto disponível');
  assert.equal(avisos[0].mensagem, 'O boleto da parcela 3 da obra Galpão X está disponível.');
  assert.equal(avisos[0].chave, 'parcela:p1:boleto:portal/obras/o1/parcelas/p1/boleto/b.pdf');
  assert.equal(avisos[1].tipo, 'financeiro_comprovante_recusado');
  assert.equal(avisos[1].titulo, 'Comprovante recusado');
  assert.equal(avisos[1].mensagem, 'O comprovante da parcela 3 da obra Galpão X foi recusado. Motivo: Valor divergente');
  assert.equal(avisos[1].chave, `parcela:p1:rejeitado:${Date.parse('2026-11-04T15:00:00Z')}`);
  const [p] = m.avisosParcelaAtualizada('p1', pago, ['pago'], 'Galpão X', 777);
  assert.deepEqual(p, {
    tipo: 'financeiro_pagamento_confirmado', titulo: 'Pagamento confirmado', mensagem: 'O pagamento da parcela 3 da obra Galpão X foi confirmado.',
    obraId: 'o1', origem: { colecao: 'portal-parcelas', id: 'p1' }, rota: '/financas', chave: `parcela:p1:pago:${Date.parse('2026-11-04T15:00:00Z')}`,
  });
  // Sem conferidoEm cai para a hora da gravação; sem motivo, a frase termina em "recusado.".
  const [r] = m.avisosParcelaAtualizada('p1', { ...antes, status: 'rejeitado', observacaoAdmin: null }, ['rejeitado'], 'Y', 777);
  assert.equal(r.chave, 'parcela:p1:rejeitado:777');
  assert.equal(r.mensagem, 'O comprovante da parcela 3 da obra Y foi recusado.');
});

test('atendimento: resposta da equipe e troca de status', () => {
  const atendimento = { obraId: 'o1', titulo: 'Infiltração', status: 'aberto' };
  const resposta = m.avisoRespostaAtendimento('a1', 'm1', atendimento, { autorTipo: 'equipe', texto: 'oi' });
  assert.deepEqual(resposta, {
    tipo: 'suporte_resposta', titulo: 'Nova resposta no atendimento', mensagem: "A equipe da Ledur respondeu ao chamado 'Infiltração'.",
    obraId: 'o1', origem: { colecao: 'portal-atendimentos', id: 'a1' }, rota: '/atendimento?ticket=a1', chave: 'mensagem:a1:m1',
  });
  assert.equal(m.avisoRespostaAtendimento('a1', 'm2', atendimento, { autorTipo: 'cliente' }), null);
  const status = m.avisoStatusAtendimento('a1', atendimento, { ...atendimento, status: 'aguardando_cliente' }, 555);
  assert.equal(status.tipo, 'suporte_status');
  assert.equal(status.titulo, 'Atendimento atualizado');
  assert.equal(status.mensagem, "O chamado 'Infiltração' agora está Aguardando você.");
  assert.equal(status.rota, '/atendimento?ticket=a1');
  assert.equal(status.chave, 'atendimento:a1:status:aguardando_cliente:555');
  assert.equal(m.avisoStatusAtendimento('a1', atendimento, { ...atendimento, naoLidasCliente: 2 }, 555), null);
  assert.equal(m.avisoStatusAtendimento('a1', atendimento, { ...atendimento, status: 'em_andamento' }, 1).mensagem, "O chamado 'Infiltração' agora está Em andamento.");
});

test('e-mail: HTML escapado, link do portal e texto puro', () => {
  const aviso = { titulo: 'Novo documento disponível', mensagem: `O documento '<b>A&B</b>' foi publicado na obra "X".`, rota: '/atendimento?ticket=a1&x=<y>' };
  const e = m.montarEmail('Ana <Silva>', aviso);
  assert.equal(e.assunto, 'Novo documento disponível');
  assert.match(e.html, /<p>Olá, Ana &lt;Silva&gt;,<\/p>/);
  assert.match(e.html, /O documento &#39;&lt;b&gt;A&amp;B&lt;\/b&gt;&#39; foi publicado na obra &quot;X&quot;\./);
  assert.match(e.html, /<a href="https:\/\/clientes\.ledurprefabricados\.com\.br\/atendimento\?ticket=a1&amp;x=&lt;y&gt;">Acesse o portal do cliente<\/a>/);
  assert.match(e.html, /Esta é uma notificação automática da Ledur Pré-Fabricados\./);
  assert.doesNotMatch(e.html, /<b>|<y>|<Silva>/);
  assert.equal(e.texto, [
    'Olá, Ana <Silva>,', '', aviso.mensagem, '', 'Acesse o portal do cliente: https://clientes.ledurprefabricados.com.br/atendimento?ticket=a1&x=<y>', '',
    'Esta é uma notificação automática da Ledur Pré-Fabricados.',
  ].join('\n'));
  assert.match(m.montarEmail('', { ...aviso, rota: '/fotos' }).texto, /^Olá,\n/);
  assert.equal(m.escaparHtml(`<'&">`), '&lt;&#39;&amp;&quot;&gt;');
});

test('erro curto não leva a chave nem passa do limite', () => {
  assert.equal(m.erroCurto('Resend HTTP 422', 'Invalid `to` field'), 'Resend HTTP 422: Invalid `to` field');
  assert.equal(m.erroCurto('Falha no envio', new Error('Bearer re_abcdefghijk123 recusado')), 'Falha no envio: Bearer *** recusado');
  assert.equal(m.erroCurto('X', 'a'.repeat(1000)).length, 300);
  assert.equal(m.erroCurto('Resend HTTP 500', null), 'Resend HTTP 500');
});

test('cópia de obras-v2: só os campos que mudaram lá', () => {
  const antes = { nomeObra: 'Galpão', local: 'CORRIGIR', numeroContrato: '12', status: 'CONTRATADA', observacao: 'x' };
  assert.deepEqual(m.copiaDeObrasV2(antes, { ...antes, status: 'FINALIZADA', observacao: 'y' }), {});
  assert.deepEqual(m.copiaDeObrasV2(antes, { ...antes, local: ' Lajeado/RS ' }), { local: 'Lajeado/RS' });
  assert.deepEqual(m.copiaDeObrasV2({ ...antes, local: 'Lajeado' }, { ...antes, local: 'corrigir' }), { local: null });
  assert.deepEqual(m.copiaDeObrasV2({ ...antes, local: 'Lajeado' }, { ...antes, local: '' }), { local: null });
  assert.deepEqual(m.copiaDeObrasV2(antes, { ...antes, nomeObra: 'Galpão Novo', numeroContrato: '' }), { nome: 'Galpão Novo', numeroContrato: null });
  // Nome apagado em obras-v2 não deixa o portal sem nome.
  assert.deepEqual(m.copiaDeObrasV2(antes, { ...antes, nomeObra: '  ' }), {});
  // O que já está igual no portal não é regravado.
  assert.deepEqual(m.semIguais({ nome: 'Galpão Novo', local: null }, { nome: 'Galpão Novo', local: 'Lajeado' }), { local: null });
  assert.deepEqual(m.semIguais({ local: null }, { local: null }), {});
});

test('igualdade profunda compara Timestamps pelo instante', () => {
  assert.equal(m.igualProfundo(ts('2026-11-04T12:00:00Z'), { seconds: Date.parse('2026-11-04T12:00:00Z') / 1000, nanoseconds: 0 }), true);
  assert.equal(m.igualProfundo([{ a: 1, b: [1, 2] }], [{ b: [1, 2], a: 1 }]), true);
  assert.equal(m.igualProfundo([{ a: 1 }], [{ a: 2 }]), false);
  assert.equal(m.igualProfundo(null, undefined), true);
  assert.equal(m.millis(null), null);
});
