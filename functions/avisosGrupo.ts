// Grupo do aviso: o mesmo acontecimento gravado para várias pessoas leva o mesmo `grupo` e a lista `envolvidos`
// (quem gerou e quem recebeu). É o que a reação usa (avisosReagir): atualiza as cópias do grupo e avisa os envolvidos.
// Contrato: The Manuscript, 01_FIRESTORE/COLECOES/avisos.md.
type AnyRecord = Record<string, any>;

export const MAX_ENVOLVIDOS = 50;

/** O aviso com o grupo e os envolvidos (sem repetir, sem vazios, até 50). */
export function comGrupo<T extends AnyRecord>(aviso: T, grupo: string, envolvidos: unknown[]): T & { grupo: string; envolvidos: string[] } {
  const lista = [...new Set(envolvidos.filter((u): u is string => typeof u === 'string' && u !== ''))].slice(0, MAX_ENVOLVIDOS);
  return { ...aviso, grupo: grupo.slice(0, 200), envolvidos: lista };
}
