// Regras puras dos avisos ao cliente do portal (users/{uid}/notificacoes e portal-emails): textos, chaves de dedupe,
// detecção de mudanças, datas de São Paulo, dinheiro em centavos, e-mail em HTML/texto e a cópia de obras-v2.
// Sem Firebase aqui: o que lê e grava fica em portalAvisos.ts e portalEmails.ts.
// Contrato: The Manuscript, 01_FIRESTORE/COLECOES/portal.md e users.md.
import { createHash } from 'node:crypto';

type AnyRecord = Record<string, any>;

export const PORTAL_URL = 'https://clientes.ledurprefabricados.com.br';
export const ZONA_SP = 'America/Sao_Paulo';
export const REMETENTE = 'Ledur Pré-Fabricados <obras@notificacoes.ledurprefabricados.com.br>';

export type Origem = { colecao: string; id: string } | null;
/** Um aviso antes de ser entregue a cada cliente; `chave` é estável e faz o dedupe. */
export type Aviso = { tipo: string; titulo: string; mensagem: string; obraId: string | null; origem: Origem; rota: string | null; chave: string };

// ---------------------------------------------------------------- ids
export const sha256 = (texto: string) => createHash('sha256').update(texto).digest('hex');
export const idNotificacao = (uid: string, chave: string) => `ntf_${sha256(`${uid}|${chave}`).slice(0, 28)}`;
export const idEmail = (uid: string, chave: string) => sha256(`email|${uid}|${chave}`);

// ---------------------------------------------------------------- valores
const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Milissegundos de um Timestamp do Firestore (Admin ou serializado), Date ou número; null quando não dá. */
export function millis(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.getTime() : null;
  if (typeof v === 'object') {
    const o = v as AnyRecord;
    if (typeof o.toMillis === 'function') return o.toMillis();
    const s = o.seconds ?? o._seconds;
    const n = o.nanoseconds ?? o._nanoseconds ?? 0;
    if (typeof s === 'number') return s * 1000 + Math.floor(n / 1e6);
  }
  return null;
}

/** Igualdade estrutural (ordem das chaves não importa); Timestamps comparam pelo instante. */
export function igualProfundo(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == b;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  const ma = millis(a), mb = millis(b);
  if (ma != null || mb != null) return ma === mb;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => igualProfundo(x, bb[i]));
  }
  const oa = a as AnyRecord, ob = b as AnyRecord;
  const ka = Object.keys(oa).filter(k => oa[k] !== undefined), kb = Object.keys(ob).filter(k => ob[k] !== undefined);
  return ka.length === kb.length && ka.every(k => Object.prototype.hasOwnProperty.call(ob, k) && igualProfundo(oa[k], ob[k]));
}

/** Centavos inteiros → "R$ 1.234,56" (espaço comum, sem depender do ICU). */
export function formatarDinheiro(centavos: unknown): string {
  const n = typeof centavos === 'number' && Number.isFinite(centavos) ? Math.round(centavos) : 0;
  const abs = Math.abs(n);
  const reais = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n < 0 ? '-' : ''}R$ ${reais},${String(abs % 100).padStart(2, '0')}`;
}

/** 'AAAA-MM-DD' → 'dd/mm/aaaa'; outro formato volta como veio. */
export function formatarData(iso: unknown): string {
  const t = texto(iso);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : t;
}

function partesSP(ms: number) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_SP, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const p = (tipo: string) => partes.find(x => x.type === tipo)?.value ?? '';
  return { ano: p('year'), mes: p('month'), dia: p('day'), hora: p('hour'), minuto: p('minute') };
}

/** Data 'AAAA-MM-DD' do instante no fuso de São Paulo (nunca a data local do servidor). */
export function dataEmSaoPaulo(ms: number): string {
  const { ano, mes, dia } = partesSP(ms);
  return `${ano}-${mes}-${dia}`;
}

/** 'dd/mm/aaaa HH:mm' no fuso de São Paulo. */
export function formatarDataHora(ms: number): string {
  const { ano, mes, dia, hora, minuto } = partesSP(ms);
  return `${dia}/${mes}/${ano} ${hora}:${minuto}`;
}

/** Soma dias a uma data 'AAAA-MM-DD' pelo calendário (sem fuso). */
export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Os dois vencimentos avisados no dia: hoje (d0) e daqui a 3 dias (d3), em São Paulo. */
export function datasDeVencimento(agoraMs: number): { hoje: string; em3: string } {
  const hoje = dataEmSaoPaulo(agoraMs);
  return { hoje, em3: somarDias(hoje, 3) };
}

export function escaparHtml(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Nome do contrato mostrado no aviso: portal-obras.nome (cai para o número do contrato ou o id). */
export function nomeDaObra(obra: AnyRecord | undefined, obraId: string): string {
  return texto(obra?.nome) || texto(obra?.numeroContrato) || obraId;
}

const ROTULO_ETAPA_FOTO: Record<string, string> = { fundacao: 'Fundação', estrutura: 'Estrutura', cobertura: 'Cobertura', fechamento: 'Fechamento' };
export const ROTULO_STATUS_ATENDIMENTO: Record<string, string> = {
  aberto: 'Aberto', em_andamento: 'Em andamento', aguardando_cliente: 'Aguardando você', resolvido: 'Resolvido', fechado: 'Fechado',
};
const parcelaRotulo = (numero: unknown) => {
  const n = numero == null ? '' : String(numero).trim();
  return n ? `parcela ${n}` : 'parcela';
};
const naLixeira = (d: AnyRecord | undefined) => d?.excluidoEm != null;

// ---------------------------------------------------------------- documentos e fotos
export function avisoDocumento(id: string, documento: AnyRecord, nomeObra: string): Aviso | null {
  if (naLixeira(documento)) return null;
  return {
    tipo: 'documento_novo', titulo: 'Novo documento disponível',
    mensagem: `O documento '${texto(documento.titulo) || 'sem título'}' foi publicado na obra ${nomeObra}.`,
    obraId: texto(documento.obraId) || null, origem: { colecao: 'portal-documentos', id }, rota: '/documentos', chave: `documento:${id}`,
  };
}

export function avisoFoto(id: string, foto: AnyRecord, nomeObra: string): Aviso | null {
  if (naLixeira(foto)) return null;
  const etapa = ROTULO_ETAPA_FOTO[texto(foto.etapa)];
  return {
    tipo: 'foto_nova', titulo: 'Nova foto da obra',
    mensagem: etapa ? `Uma nova foto da etapa ${etapa} foi publicada na obra ${nomeObra}.` : `Uma nova foto foi publicada na obra ${nomeObra}.`,
    obraId: texto(foto.obraId) || null, origem: { colecao: 'portal-fotos', id }, rota: '/fotos', chave: `foto:${id}`,
  };
}

// ---------------------------------------------------------------- portal-obras (progresso e equipe)
/** Avisos de uma alteração de portal-obras: progresso (atualizadoEm mudou e as etapas mudaram) e saída/chegada da equipe. */
export function avisosObraAtualizada(obraId: string, antes: AnyRecord | undefined, depois: AnyRecord | undefined, atualizacaoMs: number): Aviso[] {
  if (!depois) return [];
  const avisos: Aviso[] = [];
  const nome = nomeDaObra(depois, obraId);
  const origem = { colecao: 'portal-obras', id: obraId };

  const pa = antes?.progresso, pd = depois.progresso;
  if (!igualProfundo(pa?.atualizadoEm, pd?.atualizadoEm) && !igualProfundo(pa?.etapas ?? [], pd?.etapas ?? [])) {
    const geral = typeof pd?.progressoGeral === 'number' && Number.isFinite(pd.progressoGeral) ? Math.round(pd.progressoGeral) : 0;
    avisos.push({
      tipo: 'progresso_obra', titulo: 'Atualização no progresso da obra',
      mensagem: `O progresso da obra ${nome} foi atualizado: ${geral}% concluído.`,
      obraId, origem, rota: '/obra', chave: `progresso:${obraId}:${millis(pd?.atualizadoEm) ?? atualizacaoMs}`,
    });
  }

  for (const lado of ['saida', 'chegada'] as const) {
    const novo = depois.equipe?.[lado];
    const ms = millis(novo?.dataHora);
    if (ms == null) continue;
    if (millis(antes?.equipe?.[lado]?.dataHora) === ms) continue;
    const quando = formatarDataHora(ms);
    avisos.push(lado === 'saida'
      ? { tipo: 'equipe_saida_confirmada', titulo: 'Equipe a caminho da obra', mensagem: `A equipe da Ledur saiu para a obra ${nome} em ${quando}.`,
        obraId, origem, rota: '/obra', chave: `equipe:${obraId}:saida:${ms}` }
      : { tipo: 'equipe_chegada_confirmada', titulo: 'Equipe chegou à obra', mensagem: `A equipe da Ledur chegou à obra ${nome} em ${quando}.`,
        obraId, origem, rota: '/obra', chave: `equipe:${obraId}:chegada:${ms}` });
  }
  return avisos;
}

// ---------------------------------------------------------------- portal-parcelas
export function avisoParcelaCriada(id: string, parcela: AnyRecord, nomeObra: string): Aviso | null {
  if (naLixeira(parcela)) return null;
  const descricao = texto(parcela.descricao);
  const boleto = texto(parcela.boleto?.path) ? ' O boleto já está disponível.' : '';
  return {
    tipo: 'financeiro_nova_parcela', titulo: 'Nova parcela',
    mensagem: `A ${parcelaRotulo(parcela.numero)}${descricao ? ` — ${descricao}` : ''} de ${formatarDinheiro(parcela.valor)} com vencimento em `
      + `${formatarData(parcela.vencimento)} foi adicionada à obra ${nomeObra}.${boleto}`,
    obraId: texto(parcela.obraId) || null, origem: { colecao: 'portal-parcelas', id }, rota: '/financas', chave: `parcela:${id}:criada`,
  };
}

export type MudancaParcela = 'boleto' | 'pago' | 'rejeitado';
/** O que mudou numa parcela e gera aviso. Parcela na lixeira não gera nada; o envio de comprovante pelo cliente também não. */
export function mudancasParcela(antes: AnyRecord | undefined, depois: AnyRecord | undefined): MudancaParcela[] {
  if (!depois || naLixeira(depois)) return [];
  const r: MudancaParcela[] = [];
  const caminho = texto(depois.boleto?.path);
  if (caminho && caminho !== texto(antes?.boleto?.path)) r.push('boleto');
  if (depois.status !== antes?.status) {
    if (depois.status === 'pago') r.push('pago');
    if (depois.status === 'rejeitado') r.push('rejeitado');
  }
  return r;
}

export function avisosParcelaAtualizada(id: string, depois: AnyRecord, mudancas: MudancaParcela[], nomeObra: string, atualizacaoMs: number): Aviso[] {
  const base = { obraId: texto(depois.obraId) || null, origem: { colecao: 'portal-parcelas', id }, rota: '/financas' };
  const rotulo = parcelaRotulo(depois.numero);
  const conferido = millis(depois.conferidoEm) ?? atualizacaoMs;
  return mudancas.map((m): Aviso => {
    if (m === 'boleto') {
      return { ...base, tipo: 'financeiro_boleto_disponivel', titulo: 'Boleto disponível',
        mensagem: `O boleto da ${rotulo} da obra ${nomeObra} está disponível.`, chave: `parcela:${id}:boleto:${texto(depois.boleto?.path)}` };
    }
    if (m === 'pago') {
      return { ...base, tipo: 'financeiro_pagamento_confirmado', titulo: 'Pagamento confirmado',
        mensagem: `O pagamento da ${rotulo} da obra ${nomeObra} foi confirmado.`, chave: `parcela:${id}:pago:${conferido}` };
    }
    const motivo = texto(depois.observacaoAdmin);
    return { ...base, tipo: 'financeiro_comprovante_recusado', titulo: 'Comprovante recusado',
      mensagem: `O comprovante da ${rotulo} da obra ${nomeObra} foi recusado.${motivo ? ` Motivo: ${motivo}` : ''}`, chave: `parcela:${id}:rejeitado:${conferido}` };
  });
}

/** Aviso de vencimento próximo (d3) ou do dia (d0); null quando a parcela não vence nesses dias ou não está em aberto. */
export function avisoVencimento(id: string, parcela: AnyRecord, nomeObra: string, datas: { hoje: string; em3: string }): Aviso | null {
  if (naLixeira(parcela) || (parcela.status !== 'pendente' && parcela.status !== 'rejeitado')) return null;
  const venc = texto(parcela.vencimento);
  const qual = venc === datas.hoje ? 'd0' : venc === datas.em3 ? 'd3' : null;
  if (!qual) return null;
  const inicio = `A ${parcelaRotulo(parcela.numero)} da obra ${nomeObra}, de ${formatarDinheiro(parcela.valor)},`;
  return {
    tipo: 'financeiro_vencimento_proximo',
    titulo: qual === 'd0' ? 'Parcela vence hoje' : 'Parcela vence em 3 dias',
    mensagem: qual === 'd0' ? `${inicio} vence hoje (${formatarData(venc)}).` : `${inicio} vence em ${formatarData(venc)}.`,
    obraId: texto(parcela.obraId) || null, origem: { colecao: 'portal-parcelas', id }, rota: '/financas', chave: `parcela:${id}:venc:${venc}:${qual}`,
  };
}

// ---------------------------------------------------------------- portal-atendimentos
const rotaAtendimento = (id: string) => `/atendimento?ticket=${encodeURIComponent(id)}`;

/** Resposta da equipe num chamado; mensagens do cliente não geram aviso. */
export function avisoRespostaAtendimento(atendimentoId: string, mensagemId: string, atendimento: AnyRecord, mensagem: AnyRecord): Aviso | null {
  if (mensagem?.autorTipo !== 'equipe') return null;
  return {
    tipo: 'suporte_resposta', titulo: 'Nova resposta no atendimento',
    mensagem: `A equipe da Ledur respondeu ao chamado '${texto(atendimento.titulo) || 'sem título'}'.`,
    obraId: texto(atendimento.obraId) || null, origem: { colecao: 'portal-atendimentos', id: atendimentoId },
    rota: rotaAtendimento(atendimentoId), chave: `mensagem:${atendimentoId}:${mensagemId}`,
  };
}

export function avisoStatusAtendimento(id: string, antes: AnyRecord | undefined, depois: AnyRecord | undefined, atualizacaoMs: number): Aviso | null {
  if (!depois || !texto(depois.status) || depois.status === antes?.status) return null;
  const status = texto(depois.status);
  return {
    tipo: 'suporte_status', titulo: 'Atendimento atualizado',
    mensagem: `O chamado '${texto(depois.titulo) || 'sem título'}' agora está ${ROTULO_STATUS_ATENDIMENTO[status] ?? status}.`,
    obraId: texto(depois.obraId) || null, origem: { colecao: 'portal-atendimentos', id },
    rota: rotaAtendimento(id), chave: `atendimento:${id}:status:${status}:${atualizacaoMs}`,
  };
}

// ---------------------------------------------------------------- e-mail
export const linkDoPortal = (rota: string | null) => `${PORTAL_URL}${rota ?? '/'}`;

/** Assunto (= título), HTML (valores escapados) e texto do e-mail de um aviso. */
export function montarEmail(nomeCliente: string, aviso: Pick<Aviso, 'titulo' | 'mensagem' | 'rota'>) {
  const nome = texto(nomeCliente);
  const saudacao = nome ? `Olá, ${nome},` : 'Olá,';
  const link = linkDoPortal(aviso.rota);
  const rodape = 'Esta é uma notificação automática da Ledur Pré-Fabricados.';
  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1f2933;line-height:1.5">',
    `<p>${escaparHtml(saudacao)}</p>`,
    `<p>${escaparHtml(aviso.mensagem)}</p>`,
    `<p><a href="${escaparHtml(link)}">Acesse o portal do cliente</a></p>`,
    `<p style="font-size:12px;color:#6b7280">${escaparHtml(rodape)}</p>`,
    '</div>',
  ].join('');
  const textoPuro = [saudacao, '', aviso.mensagem, '', `Acesse o portal do cliente: ${link}`, '', rodape].join('\n');
  return { assunto: aviso.titulo, html, texto: textoPuro };
}

/** Erro curto para gravar em portal-emails.erro (nunca leva a chave da API). */
export function erroCurto(prefixo: string, detalhe: unknown, max = 300): string {
  const d = detalhe instanceof Error ? detalhe.message : typeof detalhe === 'string' ? detalhe : detalhe == null ? '' : JSON.stringify(detalhe);
  const t = `${prefixo}${d ? `: ${d}` : ''}`.replace(/Bearer\s+\S+/gi, 'Bearer ***').replace(/re_[A-Za-z0-9_]{8,}/g, 're_***');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

// ---------------------------------------------------------------- cópia de obras-v2
const localDoPortal = (local: unknown) => {
  const t = texto(local);
  return !t || t.toUpperCase() === 'CORRIGIR' ? null : t;
};

/** Campos de portal-obras a gravar por uma alteração de obras-v2: só os que mudaram lá (nomeObra, local, numeroContrato). */
export function copiaDeObrasV2(antes: AnyRecord | undefined, depois: AnyRecord | undefined): AnyRecord {
  const r: AnyRecord = {};
  if (!depois) return r;
  if (!igualProfundo(antes?.nomeObra, depois.nomeObra)) {
    const nome = texto(depois.nomeObra);
    if (nome) r.nome = nome; // o portal não fica sem nome
  }
  if (!igualProfundo(antes?.local, depois.local)) r.local = localDoPortal(depois.local);
  if (!igualProfundo(antes?.numeroContrato, depois.numeroContrato)) r.numeroContrato = texto(depois.numeroContrato) || null;
  return r;
}

/** Tira da cópia o que já está igual em portal-obras (evita gravar à toa). */
export function semIguais(copia: AnyRecord, portal: AnyRecord | undefined): AnyRecord {
  return Object.fromEntries(Object.entries(copia).filter(([k, v]) => !igualProfundo(portal?.[k] ?? null, v)));
}
