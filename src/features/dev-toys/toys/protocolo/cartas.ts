// Cartas do PROTOCOLO, na linha do Gwent do Witcher 3: quatro facções (cada uma com unidades próprias, 4 heróis, uma
// passiva e 5 líderes), unidades neutras (que entram em qualquer baralho) e as especiais (até 3 de cada). Um
// baralho tem 1 líder, no mínimo 22 unidades e no máximo 10 especiais. Sem DOM.

export const FILEIRAS = ['cpu', 'rede', 'disco'] as const;
export type Fileira = (typeof FILEIRAS)[number];
export const NOME_FILEIRA: Record<Fileira, string> = { cpu: 'CPU', rede: 'REDE', disco: 'DISCO' };

export type Hab = 'malware' | 'backup' | 'cluster' | 'cache' | 'fork' | 'turbo';
export type Tipo = 'unidade' | 'clima' | 'reboot' | 'overclock' | 'kill' | 'ctrlz';
/** Unidade: `fileira` é onde entra ('agil': CPU ou REDE); herói (ROOT) não muda de força. Clima: a fileira atingida. */
export type Carta = { id: number; nome: string; tipo: Tipo; fileira: Fileira | 'agil' | null; forca: number; hab: Hab | null; heroi: boolean; grupo?: string };

export const FACCOES = ['MAINFRAME', 'ENXAME', 'NUVEM', 'CODIGO LIVRE'] as const;
export type Faccao = (typeof FACCOES)[number];

export const HAB_NOME: Record<Hab, string> = { malware: 'MALWARE', backup: 'BACKUP', cluster: 'CLUSTER', cache: 'CACHE', fork: 'FORK', turbo: 'TURBO' };
export const HAB_TEXTO: Record<Hab, string> = {
  malware: 'Entra do lado do adversario (os pontos sao dele) e voce compra 2 cartas.',
  backup: 'Ao entrar, revive uma unidade do seu descarte (menos heroi), que entra na hora.',
  cluster: 'Cartas iguais na mesma fileira multiplicam: 3 iguais valem 3 vezes cada.',
  cache: '+1 para cada outra unidade da fileira (menos heroi).',
  fork: 'Ao entrar, puxa do baralho todas as cartas iguais, direto para o campo.',
  turbo: 'Dobra as outras unidades da fileira, como um OVERCLOCK (nao soma com ele).',
};
export const HEROI_TEXTO = 'ROOT (heroi): forca fixa, imune a clima, OVERCLOCK, CACHE, KILL -9, CTRL+Z e BACKUP.';

export const PASSIVA: Record<Faccao, string> = {
  MAINFRAME: 'Venceu a rodada, compra 1 carta.',
  ENXAME: 'No fim de cada rodada, uma unidade sua, sorteada, fica no campo.',
  NUVEM: 'Vence os empates de rodada.',
  'CODIGO LIVRE': 'Escolhe quem comeca a partida.',
};

/** Modelo de carta: o que vai no baralho, com o máximo de cópias. */
export type Modelo = { nome: string; tipo: Tipo; fileira: Fileira | 'agil' | null; forca: number; hab: Hab | null; heroi: boolean; max: number };

const u = (nome: string, fileira: Fileira | 'agil', forca: number, hab: Hab | null = null, max = 1): Modelo => ({ nome, tipo: 'unidade', fileira, forca, hab, heroi: false, max });
const h = (nome: string, fileira: Fileira | 'agil', forca: number, hab: Hab | null = null): Modelo => ({ nome, tipo: 'unidade', fileira, forca, hab, heroi: true, max: 1 });
const e = (nome: string, tipo: Tipo, fileira: Fileira | null = null): Modelo => ({ nome, tipo, fileira, forca: 0, hab: null, heroi: false, max: 3 });

export const UNIDADES: Record<Faccao, Modelo[]> = {
  MAINFRAME: [
    h('ADMIN', 'cpu', 10), h('AUDITORA GERAL', 'cpu', 10), h('DIRETORA', 'rede', 10), h('ARQUITETO', 'disco', 10),
    u('ESCALONADOR', 'cpu', 6), u('SERVIDOR', 'cpu', 4, 'cluster', 3), u('FIREWALL', 'cpu', 5, null, 2), u('AUDITOR', 'cpu', 5, 'malware'),
    u('OPERADOR', 'cpu', 3, null, 2), u('MONITOR', 'rede', 6), u('SWITCH', 'rede', 5), u('ROTEADOR', 'rede', 4, 'cluster', 3),
    u('TECNICO', 'rede', 5, 'backup', 2), u('PROXY', 'agil', 4), u('GERADOR', 'disco', 8), u('TORRE', 'disco', 6),
    u('RAID', 'disco', 6, null, 2), u('NOBREAK', 'disco', 4, 'cache', 2), u('ESTAGIARIO', 'disco', 1, 'malware'), u('BLADE', 'disco', 3, 'cluster', 3),
  ],
  ENXAME: [
    h('MESTRE DA BOTNET', 'cpu', 10), h('VIRUS ANCESTRAL', 'cpu', 8, 'cache'), h('RAINHA DA COLMEIA', 'rede', 10), h('ZERO DAY', 'disco', 10),
    u('ZUMBI', 'cpu', 2, 'fork', 3), u('LARVA', 'cpu', 2, 'fork', 3), u('BACKDOOR', 'cpu', 6), u('SPOOFER', 'cpu', 3, null, 2),
    u('TROJAN', 'cpu', 4, 'malware'), u('CRAWLER', 'agil', 6), u('VERME', 'rede', 2, 'fork', 3), u('EXPLOIT', 'rede', 6),
    u('KEYLOGGER', 'agil', 5), u('SPAM', 'rede', 2, 'cache', 2), u('PHISHING', 'rede', 2, 'malware'), u('DDOS', 'disco', 8),
    u('MINERADOR', 'disco', 6), u('BOTNET', 'disco', 5, 'cluster', 2), u('REPLICADOR', 'disco', 4, 'backup', 2), u('ROOTKIT', 'disco', 7),
  ],
  NUVEM: [
    h('CEO', 'cpu', 10), h('CONTROLADORA', 'cpu', 10, 'backup'), h('ORQUESTRADOR', 'rede', 10), h('DATACENTER', 'disco', 10),
    u('MICROSSERVICO', 'cpu', 3, 'cluster', 4), u('LOAD BALANCER', 'cpu', 7), u('GATEWAY', 'cpu', 6, null, 2), u('ESPIAO CORPORATIVO', 'cpu', 7, 'malware'),
    u('LOBISTA', 'rede', 4, 'malware'), u('SUPORTE', 'rede', 1, 'backup', 2), u('CDN', 'rede', 3, 'cluster', 3), u('API', 'rede', 6, null, 2),
    u('FIREWALL GERENCIADO', 'agil', 5), u('BANCO DE DADOS', 'disco', 10), u('STORAGE', 'disco', 6, null, 2), u('INFILTRADOR', 'disco', 9, 'malware'),
  ],
  'CODIGO LIVRE': [
    h('MANTENEDOR', 'cpu', 10), h('PIONEIRO', 'cpu', 10, 'cache'), h('FUNDADORA', 'rede', 10), h('REVISORA', 'rede', 10),
    u('COMMITTER', 'cpu', 4, 'fork', 3), u('TESTADOR', 'cpu', 6, null, 2), u('TRIAGEM', 'cpu', 4, null, 2), u('TRADUTOR', 'rede', 3, 'fork', 3),
    u('DESIGNER', 'rede', 7), u('MENTOR', 'rede', 2, 'backup', 3), u('EVANGELISTA', 'rede', 8, 'cache'), u('PACOTEIRO', 'agil', 6, null, 2),
    u('COMPILADOR', 'agil', 6, null, 2), u('SERVIDOR CASEIRO', 'disco', 4, null, 2),
  ],
};

/** Neutras: entram em qualquer baralho. */
export const NEUTRAS: Modelo[] = [
  h('SUPERUSUARIO', 'cpu', 15), h('SINGULARIDADE', 'rede', 15), h('RESTAURADORA', 'disco', 7, 'backup'), h('ANALISTA', 'rede', 7),
  h('FANTASMA', 'cpu', 0, 'malware'), u('AMPLIFICADOR', 'cpu', 2, 'turbo'), u('VETERANO', 'cpu', 6), u('CONSULTOR', 'rede', 5),
];

export const ESPECIAIS: Modelo[] = [
  e('SUPERAQUECIMENTO', 'clima', 'cpu'), e('LAG', 'clima', 'rede'), e('DISCO CHEIO', 'clima', 'disco'), e('REBOOT', 'reboot'),
  e('OVERCLOCK', 'overclock'), e('KILL -9', 'kill'), e('CTRL+Z', 'ctrlz'),
];
export const NOME_CLIMA: Record<Fileira, string> = { cpu: 'SUPERAQUECIMENTO', rede: 'LAG', disco: 'DISCO CHEIO' };

export type EfeitoLider =
  | { tipo: 'trompa'; fileira: Fileira }
  | { tipo: 'clima'; fileira: Fileira | null }
  | { tipo: 'reboot' }
  | { tipo: 'kill'; fileira: Fileira }
  | { tipo: 'espiar' }
  | { tipo: 'pilhar' }
  | { tipo: 'resgatar' }
  | { tipo: 'anular' }
  | { tipo: 'mao' }
  | { tipo: 'espioes' };
export type Lider = { id: string; faccao: Faccao; nome: string; texto: string; efeito: EfeitoLider };
/** Passivo: vale desde o começo e não se usa. */
export const liderPassivo = (l: Lider) => l.efeito.tipo === 'anular' || l.efeito.tipo === 'mao' || l.efeito.tipo === 'espioes';

const L = (faccao: Faccao, k: number, nome: string, texto: string, efeito: EfeitoLider): Lider => ({ id: `${faccao}-${k}`, faccao, nome, texto, efeito });
const killTexto = (f: string) => `Se a ${f} do adversario soma 10 ou mais, destroi as unidades mais fortes dele ali (menos herois).`;
export const LIDERES: Lider[] = [
  L('MAINFRAME', 1, 'OVERCLOCK NO DISCO', 'Dobra a sua fileira DISCO (se ela ainda nao tem OVERCLOCK).', { tipo: 'trompa', fileira: 'disco' }),
  L('MAINFRAME', 2, 'REBOOT GERAL', 'Limpa todo o clima.', { tipo: 'reboot' }),
  L('MAINFRAME', 3, 'LAG DO BARALHO', 'Joga do seu baralho um LAG.', { tipo: 'clima', fileira: 'rede' }),
  L('MAINFRAME', 4, 'KILL NO DISCO', killTexto('fileira DISCO'), { tipo: 'kill', fileira: 'disco' }),
  L('MAINFRAME', 5, 'KILL NA REDE', killTexto('fileira REDE'), { tipo: 'kill', fileira: 'rede' }),
  L('ENXAME', 1, 'CLIMA DO BARALHO', 'Joga do seu baralho uma carta de clima.', { tipo: 'clima', fileira: null }),
  L('ENXAME', 2, 'OVERCLOCK NA CPU', 'Dobra a sua fileira CPU (se ela ainda nao tem OVERCLOCK).', { tipo: 'trompa', fileira: 'cpu' }),
  L('ENXAME', 3, 'RESGATE', 'Traz para a mao uma carta do seu descarte.', { tipo: 'resgatar' }),
  L('ENXAME', 4, 'ESPIOES EM DOBRO', 'Passivo: MALWARE vale o dobro, dos dois lados.', { tipo: 'espioes' }),
  L('ENXAME', 5, 'KILL NA CPU', killTexto('fileira CPU'), { tipo: 'kill', fileira: 'cpu' }),
  L('NUVEM', 1, 'DISCO CHEIO DO BARALHO', 'Joga do seu baralho um DISCO CHEIO.', { tipo: 'clima', fileira: 'disco' }),
  L('NUVEM', 2, 'ESPIAR', 'Mostra 3 cartas da mao do adversario, sorteadas.', { tipo: 'espiar' }),
  L('NUVEM', 3, 'ANULAR', 'Passivo: o lider do adversario nao funciona.', { tipo: 'anular' }),
  L('NUVEM', 4, 'PILHAGEM', 'Traz para a sua mao uma carta do descarte do adversario.', { tipo: 'pilhar' }),
  L('NUVEM', 5, 'REBOOT GERAL', 'Limpa todo o clima.', { tipo: 'reboot' }),
  L('CODIGO LIVRE', 1, 'SUPERAQUECIMENTO DO BARALHO', 'Joga do seu baralho um SUPERAQUECIMENTO.', { tipo: 'clima', fileira: 'cpu' }),
  L('CODIGO LIVRE', 2, 'OVERCLOCK NA REDE', 'Dobra a sua fileira REDE (se ela ainda nao tem OVERCLOCK).', { tipo: 'trompa', fileira: 'rede' }),
  L('CODIGO LIVRE', 3, 'KILL NA CPU', killTexto('fileira CPU'), { tipo: 'kill', fileira: 'cpu' }),
  L('CODIGO LIVRE', 4, 'MAO EXTRA', 'Passivo: comeca com 11 cartas.', { tipo: 'mao' }),
  L('CODIGO LIVRE', 5, 'RESGATE', 'Traz para a mao uma carta do seu descarte.', { tipo: 'resgatar' }),
];
export const lideresDe = (f: Faccao) => LIDERES.filter((l) => l.faccao === f);
export const liderPorId = (id: string) => LIDERES.find((l) => l.id === id) ?? LIDERES[0];

export const MIN_UNIDADES = 22;
export const MAX_ESPECIAIS = 10;

/** Baralho montado: a facção, o líder e quantas cópias de cada carta (pelo nome). */
export type Baralho = { faccao: Faccao; lider: string; cartas: Record<string, number> };

const ESPECIAIS_PADRAO = { SUPERAQUECIMENTO: 1, LAG: 1, 'DISCO CHEIO': 1, REBOOT: 1, OVERCLOCK: 1, 'KILL -9': 1, 'CTRL+Z': 2 };
const PADRAO: Record<Faccao, Record<string, number>> = {
  MAINFRAME: {
    ADMIN: 1, 'AUDITORA GERAL': 1, DIRETORA: 1, ARQUITETO: 1, ESCALONADOR: 1, SERVIDOR: 3, FIREWALL: 1, AUDITOR: 1, MONITOR: 1, SWITCH: 1,
    ROTEADOR: 3, TECNICO: 1, PROXY: 1, GERADOR: 1, TORRE: 1, RAID: 2, NOBREAK: 1, ESTAGIARIO: 1,
  },
  ENXAME: {
    'MESTRE DA BOTNET': 1, 'RAINHA DA COLMEIA': 1, 'ZERO DAY': 1, ZUMBI: 3, BACKDOOR: 1, SPOOFER: 1, TROJAN: 1, CRAWLER: 1,
    VERME: 3, EXPLOIT: 1, KEYLOGGER: 1, SPAM: 2, PHISHING: 1, DDOS: 1, MINERADOR: 1, BOTNET: 1, REPLICADOR: 1,
  },
  NUVEM: {
    CEO: 1, CONTROLADORA: 1, ORQUESTRADOR: 1, DATACENTER: 1, MICROSSERVICO: 4, 'LOAD BALANCER': 1, GATEWAY: 2, 'ESPIAO CORPORATIVO': 1,
    LOBISTA: 1, SUPORTE: 2, CDN: 3, API: 2, 'FIREWALL GERENCIADO': 1, 'BANCO DE DADOS': 1,
  },
  'CODIGO LIVRE': {
    MANTENEDOR: 1, PIONEIRO: 1, FUNDADORA: 1, REVISORA: 1, COMMITTER: 3, TESTADOR: 2, TRIAGEM: 1, TRADUTOR: 3, DESIGNER: 1, MENTOR: 2,
    EVANGELISTA: 1, PACOTEIRO: 2, COMPILADOR: 2, 'SERVIDOR CASEIRO': 1,
  },
};

/** O que a facção pode pôr no baralho: as unidades dela, as neutras e as especiais. */
export const colecaoDe = (f: Faccao): Modelo[] => [...UNIDADES[f], ...NEUTRAS, ...ESPECIAIS];
export const baralhoPadrao = (f: Faccao): Baralho => ({ faccao: f, lider: lideresDe(f)[0].id, cartas: { ...PADRAO[f], ...ESPECIAIS_PADRAO } });

/** Unidades, especiais, heróis, força impressa e total de cartas do baralho. */
export function contagem(b: Baralho) {
  const r = { unidades: 0, especiais: 0, herois: 0, forca: 0, total: 0 };
  for (const m of colecaoDe(b.faccao)) {
    const n = b.cartas[m.nome] ?? 0;
    if (!n) continue;
    r.total += n;
    if (m.tipo === 'unidade') {
      r.unidades += n;
      r.forca += n * m.forca;
      if (m.heroi) r.herois += n;
    } else r.especiais += n;
  }
  return r;
}

/** O que impede o baralho de jogar (vazio: pode jogar). */
export function problemasDo(b: Baralho): string[] {
  const c = contagem(b);
  const r: string[] = [];
  if (c.unidades < MIN_UNIDADES) r.push(`FALTAM ${MIN_UNIDADES - c.unidades} UNIDADES (MINIMO ${MIN_UNIDADES})`);
  if (c.especiais > MAX_ESPECIAIS) r.push(`SOBRAM ${c.especiais - MAX_ESPECIAIS} ESPECIAIS (MAXIMO ${MAX_ESPECIAIS})`);
  if (liderPorId(b.lider).faccao !== b.faccao) r.push('ESCOLHA UM LIDER DA FACCAO');
  return r;
}

/** Baralho válido a partir do salvo: só cartas da coleção da facção, até o máximo de cada; líder da facção. */
export function normalizarBaralho(f: Faccao, v: unknown): Baralho {
  const x = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const salvas = x.cartas && typeof x.cartas === 'object' ? (x.cartas as Record<string, unknown>) : null;
  if (!salvas) return baralhoPadrao(f);
  const cartas: Record<string, number> = {};
  for (const m of colecaoDe(f)) {
    const n = salvas[m.nome];
    if (typeof n === 'number' && n > 0) cartas[m.nome] = Math.min(m.max, Math.floor(n));
  }
  const lider = typeof x.lider === 'string' && lideresDe(f).some((l) => l.id === x.lider) ? x.lider : lideresDe(f)[0].id;
  return { faccao: f, lider, cartas };
}

/** As cartas do baralho, com ids a partir de `base` (grupo do CLUSTER e do FORK: o nome). */
export function montar(b: Baralho, base = 0): Carta[] {
  const d: Carta[] = [];
  for (const m of colecaoDe(b.faccao)) {
    for (let k = 0; k < (b.cartas[m.nome] ?? 0); k++) {
      d.push({ id: base + d.length, nome: m.nome, tipo: m.tipo, fileira: m.fileira, forca: m.forca, hab: m.hab, heroi: m.heroi, ...(m.hab === 'cluster' || m.hab === 'fork' ? { grupo: m.nome } : {}) });
    }
  }
  return d;
}
