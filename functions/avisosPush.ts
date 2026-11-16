// Push dos avisos do sistema: cada aviso novo em avisos/{uid}/itens vira notificação do sistema operacional nos
// aparelhos da pessoa (avisos/{uid}/dispositivos, gravados pela WEB e pelo portal quando ela liga o push). Vale para
// todas as áreas (Friday, Logística, portal e as que vierem), porque todas gravam o aviso no mesmo lugar.
// O service worker (public/push-sw.js) mostra a notificação só quando o sistema não está visível; o clique abre a rota.
// Regras: avisosPushDominio.ts. Contrato: The Manuscript, 01_FIRESTORE/COLECOES/avisos.md.
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { getMessaging } from 'firebase-admin/messaging';
import { db } from './firebaseAdmin.js';
import { aparelhoMorto, aparelhosDoAviso, dadosDoPush } from './avisosPushDominio.js';

export const avisosPush = onDocumentCreated(
  { document: 'avisos/{uid}/itens/{avisoId}', region: 'southamerica-east1' },
  async event => {
    const aviso = event.data?.data();
    if (!aviso || aviso.lida === true) return;
    const { uid, avisoId } = event.params;
    const pasta = db.collection('avisos').doc(uid).collection('dispositivos');
    const aparelhos = aparelhosDoAviso(aviso, (await pasta.get()).docs.map(d => ({ id: d.id, data: d.data() })));
    if (!aparelhos.length) return;
    const resposta = await getMessaging().sendEachForMulticast({
      tokens: aparelhos.map(a => a.token),
      data: dadosDoPush(avisoId, aviso),
      webpush: { headers: { Urgency: 'high', TTL: String(24 * 3600) } },
    });
    const mortos = resposta.responses.flatMap((r, i) => (!r.success && aparelhoMorto(r.error?.code) ? [aparelhos[i].id] : []));
    await Promise.all(mortos.map(id => pasta.doc(id).delete()));
    logger.info('avisosPush: enviado', { area: aviso.area, tipo: aviso.tipo, aparelhos: aparelhos.length, ok: resposta.successCount, removidos: mortos.length });
  },
);
