// Reação a um aviso (menu do botão direito no sino da WEB): grava o emoji de quem reagiu em todas as cópias do mesmo
// acontecimento (`grupo`) e, na primeira reação dessa pessoa, avisa os envolvidos (quem gerou e quem recebeu, menos quem
// reagiu). Trocar o emoji só atualiza as cópias; emoji null tira a reação. As Rules não deixam ninguém mexer no aviso
// de outra pessoa, por isso a gravação é aqui (Admin SDK).
// Regras: avisosReagirDominio.ts. Contrato: The Manuscript, 01_FIRESTORE/COLECOES/avisos.md.
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin.js';
import { temAlgumaCredencial } from './credenciais.js';
import { aceitaReacao, avisoDeReacao, destinatariosReacao, emojiValido, idAvisoReacao } from './avisosReagirDominio.js';

const jaExiste = (e: unknown) => {
  const err = e as { code?: unknown; message?: unknown };
  return err?.code === 6 || err?.code === 'already-exists' || /ALREADY_EXISTS/i.test(String(err?.message ?? ''));
};

export const avisosReagir = onCall({ region: 'southamerica-east1' }, async req => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Autenticação obrigatória.');
  const { avisoId, emoji } = (req.data ?? {}) as { avisoId?: unknown; emoji?: unknown };
  if (typeof avisoId !== 'string' || !avisoId || avisoId.includes('/')) throw new HttpsError('invalid-argument', 'Aviso inválido.');
  if (emoji !== null && !emojiValido(emoji)) throw new HttpsError('invalid-argument', 'Reação inválida.');
  const [meu, eu] = await Promise.all([
    db.collection('avisos').doc(uid).collection('itens').doc(avisoId).get(),
    db.collection('funcionarios').doc(uid).get(),
  ]);
  if (!temAlgumaCredencial(eu.data())) throw new HttpsError('permission-denied', 'Acesso não autorizado.');
  const original = meu.data();
  if (!meu.exists || !original) throw new HttpsError('not-found', 'Aviso não encontrado.');
  if (!aceitaReacao(original, uid)) throw new HttpsError('failed-precondition', 'Este aviso não aceita reação.');
  const nome = typeof eu.data()?.nome === 'string' ? (eu.data()!.nome as string).trim() : '';
  const primeira = !(original.reacoes && typeof original.reacoes === 'object' && uid in original.reacoes);

  // As cópias do grupo, na pasta de cada envolvido (quem gerou o aviso pode não ter cópia).
  const envolvidos: string[] = original.envolvidos;
  const copias = (await Promise.all(envolvidos.map(u =>
    db.collection('avisos').doc(u).collection('itens').where('grupo', '==', original.grupo).limit(10).get()))).flatMap(s => s.docs);
  const lote = db.batch();
  const campo = new FieldPath('reacoes', uid);
  for (const c of copias) lote.update(c.ref, campo, emoji ? { emoji, nome, em: FieldValue.serverTimestamp() } : FieldValue.delete());
  await lote.commit();

  if (!emoji || !primeira) return { ok: true, avisados: 0 };
  const aviso = avisoDeReacao(original, { uid, nome }, emoji);
  const para = destinatariosReacao(envolvidos, uid);
  const gravados = await Promise.all(para.map(u =>
    db.collection('avisos').doc(u).collection('itens').doc(idAvisoReacao(original.grupo, uid, u))
      .create({ ...aviso, criadoEm: FieldValue.serverTimestamp() })
      .then(() => true, e => { if (jaExiste(e)) return false; throw e; })));
  return { ok: true, avisados: gravados.filter(Boolean).length };
});
