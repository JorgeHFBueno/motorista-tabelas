// Avisos ao cliente do portal: gatilhos nas coleções portal-*, o vencimento diário e a cópia automática de obras-v2.
// Cada aviso vira users/{uid}/notificacoes/{id} e um e-mail na fila portal-emails/{id} (enviado por portalEmails.ts).
// Destinatários: users com o CNPJ/CPF do contrato (portal-obras.clienteDocumento) em `documentos` e ativo == true.
// Dedupe pelo id estável + .create(): um aviso já gravado não se repete.
// Textos, chaves e detecção de mudanças: portalAvisosDominio.ts. Contrato: The Manuscript, 01_FIRESTORE/COLECOES/portal.md e users.md.
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin.js';
import {
  avisoDocumento, avisoFoto, avisoParcelaCriada, avisoRespostaAtendimento, avisoStatusAtendimento, avisoVencimento, avisosObraAtualizada,
  avisosParcelaAtualizada, copiaDeObrasV2, datasDeVencimento, idEmail, idNotificacao, montarEmail, mudancasParcela, nomeDaObra, semIguais,
  type Aviso,
} from './portalAvisosDominio.js';

type AnyRecord = Record<string, any>;
type Destinatario = { uid: string; nome: string; email: string };
const REGIAO = 'southamerica-east1';

// ---------------------------------------------------------------- entrega
const jaExiste = (e: unknown) => {
  const err = e as { code?: unknown; message?: unknown };
  return err?.code === 6 || err?.code === 'already-exists' || /ALREADY_EXISTS/i.test(String(err?.message ?? ''));
};

/** Cria o documento; false quando ele já existe (é o dedupe). */
async function criarSeNovo(ref: DocumentReference, dados: AnyRecord): Promise<boolean> {
  try {
    await ref.create(dados);
    return true;
  } catch (e) {
    if (jaExiste(e)) return false;
    throw e;
  }
}

/** Clientes ativos que representam o CNPJ/CPF (sem índice composto: o filtro de ativo é em memória). */
async function destinatariosDo(clienteDocumento: unknown): Promise<Destinatario[]> {
  const documento = typeof clienteDocumento === 'string' ? clienteDocumento.trim() : '';
  if (!documento) return [];
  const snap = await db.collection('users').where('documentos', 'array-contains', documento).get();
  return snap.docs
    .filter(d => d.data().ativo === true)
    .map(d => ({ uid: d.id, nome: typeof d.data().nome === 'string' ? d.data().nome.trim() : '', email: typeof d.data().email === 'string' ? d.data().email.trim() : '' }));
}

async function entregarA(destinatario: Destinatario, aviso: Aviso) {
  const { uid } = destinatario;
  const notificacao = criarSeNovo(db.collection('users').doc(uid).collection('notificacoes').doc(idNotificacao(uid, aviso.chave)), {
    tipo: aviso.tipo, titulo: aviso.titulo, mensagem: aviso.mensagem, obraId: aviso.obraId, origem: aviso.origem, rota: aviso.rota,
    lida: false, criadoEm: FieldValue.serverTimestamp(),
  });
  const email = destinatario.email
    ? (() => {
      const { assunto, html, texto } = montarEmail(destinatario.nome, aviso);
      return criarSeNovo(db.collection('portal-emails').doc(idEmail(uid, aviso.chave)), {
        para: destinatario.email, assunto, html, texto, status: 'pendente', tipo: aviso.tipo, obraId: aviso.obraId, clienteUid: uid,
        origem: aviso.origem, rota: aviso.rota, chave: aviso.chave, tentativas: 0,
        criadoEm: FieldValue.serverTimestamp(), atualizadoEm: FieldValue.serverTimestamp(),
      });
    })()
    : Promise.resolve(false);
  const [n, e] = await Promise.all([notificacao, email]);
  return { notificacao: n, email: e };
}

/** Entrega os avisos de um contrato a todos os seus clientes ativos. */
async function entregar(obraId: string, obra: AnyRecord, avisos: Aviso[], destinatariosProntos?: Destinatario[]) {
  if (!avisos.length) return;
  const destinatarios = destinatariosProntos ?? await destinatariosDo(obra.clienteDocumento);
  if (!destinatarios.length) {
    logger.info('portalAvisos: contrato sem cliente ativo', { obraId, tipos: avisos.map(a => a.tipo) });
    return;
  }
  const resultados = await Promise.all(destinatarios.flatMap(d => avisos.map(a => entregarA(d, a))));
  logger.info('portalAvisos: avisos entregues', {
    obraId, tipos: avisos.map(a => a.tipo), destinatarios: destinatarios.length,
    notificacoes: resultados.filter(r => r.notificacao).length, emails: resultados.filter(r => r.email).length,
  });
}

/** Lê o contrato atual (portal-obras) e entrega; contrato inexistente é ignorado em silêncio. */
async function avisarContrato(obraId: unknown, construir: (nomeObra: string, obra: AnyRecord) => Aviso[]) {
  const id = typeof obraId === 'string' ? obraId.trim() : '';
  if (!id) return;
  const obra = (await db.collection('portal-obras').doc(id).get()).data();
  if (!obra) return;
  await entregar(id, obra, construir(nomeDaObra(obra, id), obra));
}

const lista = (a: Aviso | null) => (a ? [a] : []);

// ---------------------------------------------------------------- gatilhos
export const portalAvisoDocumento = onDocumentCreated({ document: 'portal-documentos/{documentoId}', region: REGIAO }, async event => {
  const d = event.data?.data();
  if (!d || d.excluidoEm != null) return;
  await avisarContrato(d.obraId, nome => lista(avisoDocumento(event.params.documentoId, d, nome)));
});

export const portalAvisoFoto = onDocumentCreated({ document: 'portal-fotos/{fotoId}', region: REGIAO }, async event => {
  const d = event.data?.data();
  if (!d || d.excluidoEm != null) return;
  await avisarContrato(d.obraId, nome => lista(avisoFoto(event.params.fotoId, d, nome)));
});

export const portalAvisoObra = onDocumentUpdated({ document: 'portal-obras/{obraId}', region: REGIAO }, async event => {
  const depois = event.data?.after.data();
  if (!depois) return;
  const obraId = event.params.obraId;
  const avisos = avisosObraAtualizada(obraId, event.data?.before.data(), depois, event.data!.after.updateTime.toMillis());
  await entregar(obraId, depois, avisos);
});

export const portalAvisoParcelaCriada = onDocumentCreated({ document: 'portal-parcelas/{parcelaId}', region: REGIAO }, async event => {
  const d = event.data?.data();
  if (!d || d.excluidoEm != null) return;
  await avisarContrato(d.obraId, nome => lista(avisoParcelaCriada(event.params.parcelaId, d, nome)));
});

export const portalAvisoParcelaAtualizada = onDocumentUpdated({ document: 'portal-parcelas/{parcelaId}', region: REGIAO }, async event => {
  const depois = event.data?.after.data();
  const mudancas = mudancasParcela(event.data?.before.data(), depois);
  if (!depois || !mudancas.length) return;
  const atualizacaoMs = event.data!.after.updateTime.toMillis();
  await avisarContrato(depois.obraId, nome => avisosParcelaAtualizada(event.params.parcelaId, depois, mudancas, nome, atualizacaoMs));
});

export const portalAvisoMensagemAtendimento = onDocumentCreated(
  { document: 'portal-atendimentos/{atendimentoId}/mensagens/{mensagemId}', region: REGIAO },
  async event => {
    const mensagem = event.data?.data();
    if (!mensagem || mensagem.autorTipo !== 'equipe') return;
    const { atendimentoId, mensagemId } = event.params;
    const atendimento = (await db.collection('portal-atendimentos').doc(atendimentoId).get()).data();
    if (!atendimento) return;
    await avisarContrato(atendimento.obraId, () => lista(avisoRespostaAtendimento(atendimentoId, mensagemId, atendimento, mensagem)));
  },
);

export const portalAvisoStatusAtendimento = onDocumentUpdated({ document: 'portal-atendimentos/{atendimentoId}', region: REGIAO }, async event => {
  const depois = event.data?.after.data();
  const aviso = avisoStatusAtendimento(event.params.atendimentoId, event.data?.before.data(), depois, event.data!.after.updateTime.toMillis());
  if (!aviso || !depois) return;
  await avisarContrato(depois.obraId, () => [aviso]);
});

// ---------------------------------------------------------------- vencimento diário
export const portalVencimentosDiario = onSchedule({ schedule: 'every day 08:00', timeZone: 'America/Sao_Paulo', region: REGIAO }, async () => {
  const datas = datasDeVencimento(Date.now());
  const snap = await db.collection('portal-parcelas').where('vencimento', 'in', [datas.hoje, datas.em3]).get();
  const obras = new Map<string, Promise<AnyRecord | undefined>>();
  const clientes = new Map<string, Promise<Destinatario[]>>();
  let avisadas = 0;
  for (const doc of snap.docs) {
    const parcela = doc.data();
    const obraId = typeof parcela.obraId === 'string' ? parcela.obraId.trim() : '';
    if (!obraId || !avisoVencimento(doc.id, parcela, '', datas)) continue;
    try {
      if (!obras.has(obraId)) obras.set(obraId, db.collection('portal-obras').doc(obraId).get().then(s => s.data()));
      const obra = await obras.get(obraId);
      if (!obra) continue;
      const documento = String(obra.clienteDocumento ?? '');
      if (!clientes.has(documento)) clientes.set(documento, destinatariosDo(documento));
      await entregar(obraId, obra, lista(avisoVencimento(doc.id, parcela, nomeDaObra(obra, obraId), datas)), await clientes.get(documento));
      avisadas += 1;
    } catch (e) {
      logger.error('portalVencimentosDiario: falha na parcela', { parcelaId: doc.id, obraId, erro: e instanceof Error ? e.message : String(e) });
    }
  }
  logger.info('portalVencimentosDiario: concluído', { ...datas, lidas: snap.size, avisadas });
});

// ---------------------------------------------------------------- cópia de obras-v2
export const portalObrasCopiaV2 = onDocumentUpdated({ document: 'obras-v2/{obraId}', region: REGIAO }, async event => {
  const copia = copiaDeObrasV2(event.data?.before.data(), event.data?.after.data());
  if (!Object.keys(copia).length) return;
  const ref = db.collection('portal-obras').doc(event.params.obraId);
  const portal = (await ref.get()).data();
  if (!portal) return;
  const campos = semIguais(copia, portal);
  if (!Object.keys(campos).length) return;
  await ref.update({ ...campos, atualizadoEm: FieldValue.serverTimestamp(), atualizadoPor: { uid: 'sistema', nome: 'Cópia de obras-v2' } });
  logger.info('portalObrasCopiaV2: cópia gravada', { obraId: event.params.obraId, campos: Object.keys(campos) });
});
