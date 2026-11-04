// Envio da fila portal-emails pelo Resend (API HTTP, sem SDK). Um documento novo com status 'pendente' é assumido numa
// transação ('enviando', tentativas + 1) e enviado uma vez: 'enviado' com o id do provedor ou 'erro' com um texto curto.
// Sem nova tentativa automática. Os documentos nascem em portalAvisos.ts. Contrato: The Manuscript, 01_FIRESTORE/COLECOES/portal.md.
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin.js';
import { REMETENTE, erroCurto } from './portalAvisosDominio.js';

const resendApiKey = defineSecret('RESEND_API_KEY');
const REGIAO = 'southamerica-east1';

export const portalEmailsEnviar = onDocumentCreated(
  { document: 'portal-emails/{emailId}', region: REGIAO, secrets: [resendApiKey], maxInstances: 5 },
  async event => {
    const emailId = event.params.emailId;
    const ref = db.collection('portal-emails').doc(emailId);

    const email = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const dados = snap.data();
      if (!dados || dados.status !== 'pendente') return null;
      tx.update(ref, { status: 'enviando', tentativas: FieldValue.increment(1), atualizadoEm: FieldValue.serverTimestamp() });
      return dados;
    });
    if (!email) return;

    const falhar = async (erro: string) => {
      await ref.update({ status: 'erro', erro, atualizadoEm: FieldValue.serverTimestamp() });
      logger.error('portalEmailsEnviar: falha no envio', { emailId, tipo: email.tipo, erro });
    };

    const para = typeof email.para === 'string' ? email.para.trim() : '';
    const assunto = typeof email.assunto === 'string' ? email.assunto.trim() : '';
    const html = typeof email.html === 'string' ? email.html : '';
    if (!para || !assunto || !html.trim()) {
      await falhar('Campos obrigatórios ausentes: para, assunto ou html.');
      return;
    }

    try {
      const resposta = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendApiKey.value()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: REMETENTE, to: [para], subject: assunto, html, text: typeof email.texto === 'string' ? email.texto : undefined }),
      });
      const corpo = await resposta.json().catch(() => null) as { id?: unknown; message?: unknown; name?: unknown } | null;
      if (!resposta.ok) {
        await falhar(erroCurto(`Resend HTTP ${resposta.status}`, corpo?.message ?? corpo?.name ?? null));
        return;
      }
      await ref.update({
        status: 'enviado', providerMessageId: typeof corpo?.id === 'string' ? corpo.id : null,
        enviadoEm: FieldValue.serverTimestamp(), atualizadoEm: FieldValue.serverTimestamp(),
      });
      logger.info('portalEmailsEnviar: enviado', { emailId, tipo: email.tipo });
    } catch (e) {
      await falhar(erroCurto('Falha no envio', e));
    }
  },
);
