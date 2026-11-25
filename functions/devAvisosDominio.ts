// Regras puras do convite e do "JOGUE" das salas online do /dev (sem Firebase; teste em test/devAvisos.test.mjs).
// Só entre Retr0. Contrato: The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md (Área DEV) e avisos.md.
import { temCredencial } from './credenciais.js';

type AnyRecord = Record<string, any>;

export const NOME_JOGO: Record<string, string> = { xadrez: 'Xadrez', neo: 'NEO' };
export const MAX_CONVIDADOS = 10;

/** Convidados válidos: até 10, sem repetir, Retr0 ativos, fora da sala e sem quem convida. */
export function convidaveis(para: unknown, autor: string, sala: AnyRecord, funcionarios: Map<string, AnyRecord | undefined>): string[] {
  const lista = Array.isArray(para) ? para.filter((u): u is string => typeof u === 'string' && u !== '') : [];
  const naSala = new Set<string>(Array.isArray(sala.jogadores) ? sala.jogadores : []);
  return [...new Set(lista)].slice(0, MAX_CONVIDADOS)
    .filter(u => u !== autor && !naSala.has(u) && temCredencial(funcionarios.get(u), 'retr0'));
}

/** Quem é chamado no "JOGUE": quem está com a vez, se não for quem chama e estiver na sala em jogo. */
export function chamado(sala: AnyRecord, autor: string): string | null {
  const vez = typeof sala.vez === 'string' ? sala.vez : null;
  const jogadores: unknown[] = Array.isArray(sala.jogadores) ? sala.jogadores : [];
  return sala.estado === 'jogando' && vez && vez !== autor && jogadores.includes(vez) && jogadores.includes(autor) ? vez : null;
}

/** Aviso do convite ou do "JOGUE", sem criadoEm, grupo e envolvidos (postos na gravação). Abre o /dev na sala. */
export function avisoDev(tipo: 'convite' | 'jogue', salaId: string, sala: AnyRecord, de: { uid: string; nome: string }) {
  const jogo = NOME_JOGO[String(sala.jogo)] ?? 'jogo';
  const dono = Array.isArray(sala.nomes) && typeof sala.nomes[0] === 'string' ? sala.nomes[0] : '';
  const n = Array.isArray(sala.jogadores) ? sala.jogadores.length : 0;
  return {
    area: 'dev', tipo,
    titulo: tipo === 'convite' ? `convidou você para ${jogo}` : `chamou você: JOGUE! (${jogo})`,
    mensagem: tipo === 'convite' ? `Sala de ${dono} (${n}/${sala.max ?? n})` : 'É a sua vez na partida online.',
    rota: `/dev?jogo=${encodeURIComponent(String(sala.jogo))}&sala=${encodeURIComponent(salaId)}`,
    local: 'DEV',
    deUid: de.uid, deNome: de.nome.slice(0, 120),
    origem: { colecao: 'dev-salas', id: salaId },
    lida: false,
  };
}
