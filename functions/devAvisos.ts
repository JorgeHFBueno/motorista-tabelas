// Salas online do /dev (dev-salas): convite para uma sala aberta e o "JOGUE" para quem está com a vez, como avisos do
// sistema (sino e push). Só Retr0 chama, só para Retr0. devPessoas lista quem pode ser convidado (a tela da Retr0 não lê
// funcionarios). Regras: devAvisosDominio.ts. Contrato: The Manuscript, avisos.md e 01_ROTAS_E_NAVEGACAO.md (Área DEV).
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin.js';
import { temCredencial } from './credenciais.js';
import { comGrupo } from './avisosGrupo.js';
import { avisoDev, chamado, convidaveis } from './devAvisosDominio.js';

const REGIAO = 'southamerica-east1';

async function retr0(uid: string | undefined) {
  if (!uid) throw new HttpsError('unauthenticated', 'Autenticação obrigatória.');
  const eu = (await db.collection('funcionarios').doc(uid).get()).data();
  if (!temCredencial(eu, 'retr0')) throw new HttpsError('permission-denied', 'Acesso não autorizado.');
  return { uid, nome: typeof eu.nome === 'string' ? eu.nome.trim() : '' };
}

/** Retr0 ativos (menos quem pede), por nome: quem pode ser convidado. */
export const devPessoas = onCall({ region: REGIAO }, async req => {
  const eu = await retr0(req.auth?.uid);
  const snap = await db.collection('funcionarios').where('perfis.retr0', '==', true).get();
  return snap.docs
    .filter(d => d.id !== eu.uid && temCredencial(d.data(), 'retr0'))
    .map(d => ({ uid: d.id, nome: typeof d.data().nome === 'string' ? d.data().nome.trim() : d.id }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
});

/** { salaId, tipo: 'convite', para: uid[] } numa sala aberta; { salaId, tipo: 'jogue' } para quem está com a vez. */
export const devAvisar = onCall({ region: REGIAO }, async req => {
  const eu = await retr0(req.auth?.uid);
  const { salaId, tipo, para } = (req.data ?? {}) as { salaId?: unknown; tipo?: unknown; para?: unknown };
  if (typeof salaId !== 'string' || !salaId || salaId.includes('/')) throw new HttpsError('invalid-argument', 'Sala inválida.');
  if (tipo !== 'convite' && tipo !== 'jogue') throw new HttpsError('invalid-argument', 'Tipo inválido.');
  const sala = (await db.collection('dev-salas').doc(salaId).get()).data();
  if (!sala) throw new HttpsError('not-found', 'A sala não existe mais.');
  if (!Array.isArray(sala.jogadores) || !sala.jogadores.includes(eu.uid)) throw new HttpsError('permission-denied', 'Você não está nesta sala.');

  let destinos: string[];
  if (tipo === 'convite') {
    if (sala.estado !== 'aberta') throw new HttpsError('failed-precondition', 'A sala já começou.');
    const pedidos = Array.isArray(para) ? para.filter((u): u is string => typeof u === 'string' && u !== '').slice(0, 10) : [];
    const snaps = pedidos.length ? await db.getAll(...pedidos.map(u => db.collection('funcionarios').doc(u))) : [];
    destinos = convidaveis(pedidos, eu.uid, sala, new Map(snaps.map(s => [s.id, s.data()])));
  } else {
    const alvo = chamado(sala, eu.uid);
    destinos = alvo ? [alvo] : [];
  }
  if (!destinos.length) throw new HttpsError('failed-precondition', tipo === 'convite' ? 'Ninguém para convidar.' : 'Não há quem chamar agora.');

  const aviso = comGrupo(avisoDev(tipo, salaId, sala, eu), `dev-${tipo}:${salaId}:${Date.now()}`, [eu.uid, ...destinos]);
  const lote = db.batch();
  for (const u of destinos) lote.set(db.collection('avisos').doc(u).collection('itens').doc(), { ...aviso, criadoEm: FieldValue.serverTimestamp() });
  await lote.commit();
  return { avisados: destinos.length };
});
