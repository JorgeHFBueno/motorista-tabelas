// Controle de tempo do Friday nas Functions (automação "iniciar/parar o cronômetro" e importação do monday):
// CÓPIA FIEL de src/features/friday-gestao-interna/quadro/tempo.ts, para a conta ser a mesma na tela e no servidor.
// Não edite aqui: mude o original e copie de novo o trecho abaixo do marcador. O teste
// tests/friday-tempo.test.ts (npm run test:friday-tempo) falha se as duas cópias divergirem.
// ---- início da cópia ----

export type Sessao = {
  id: string;
  inicio: string; // ISO (UTC)
  fim: string | null; // null = rodando
  por: string | null; // quem iniciou (ou lançou à mão)
  fim_por?: string | null; // quem parou
  manual?: boolean; // lançada ou corrigida à mão
};
export type ValorTempo = { sessoes: Sessao[] };
export type OpTempo =
  | { acao: 'iniciar' | 'parar' | 'alternar' }
  | { acao: 'adicionar'; inicio: string; fim: string }
  | { acao: 'editar'; sessao_id: string; inicio: string; fim: string }
  | { acao: 'excluir'; sessao_id: string };

export class ErroTempo extends Error {}

const ms = (iso: string) => Date.parse(iso);
const valida = (iso: unknown): iso is string => typeof iso === 'string' && Number.isFinite(Date.parse(iso));
const ordenar = (l: Sessao[]) => [...l].sort((a, b) => ms(a.inicio) - ms(b.inicio));
const novoIdSessao = () => globalThis.crypto.randomUUID();

export const sessoesDe = (v: unknown): Sessao[] => (Array.isArray((v as ValorTempo | null)?.sessoes) ? (v as ValorTempo).sessoes : []);
export const sessaoAberta = (v: unknown) => sessoesDe(v).find(s => !s.fim);
export const duracaoSessao = (s: Sessao, agora = Date.now()) => Math.max(0, Math.round(((s.fim ? ms(s.fim) : agora) - ms(s.inicio)) / 1000));
export const totalSegundos = (v: unknown, agora = Date.now()) => sessoesDe(v).reduce((t, s) => t + duracaoSessao(s, agora), 0);
export const totalHoras = (v: unknown) => Math.round((totalSegundos(v) / 3600) * 100) / 100;

// Célula: "0m 0s", "12m 30s", "2h 05m" (ligado, com segundos: "2h 05m 09s").
export function fmtDuracao(seg: number, comSegundos = false): string {
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
  const dd = (n: number) => String(n).padStart(2, '0');
  if (!h) return `${m}m ${s}s`;
  return comSegundos ? `${h}h ${dd(m)}m ${dd(s)}s` : `${h}h ${dd(m)}m`;
}
// Registro: "01h 00m 00s".
export const fmtRelogio = (seg: number) => {
  const dd = (n: number) => String(n).padStart(2, '0');
  return `${dd(Math.floor(seg / 3600))}h ${dd(Math.floor((seg % 3600) / 60))}m ${dd(seg % 60)}s`;
};
// Data/hora local para os campos do formulário.
export const horaLocal = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
export const diaLocal = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// Dia (AAAA-MM-DD) + hora (HH:MM) no fuso do navegador -> ISO.
export const paraISO = (dia: string, hora: string) => new Date(`${dia}T${hora}:00`).toISOString();

// Aceita só o formato esperado; descarta o que não for sessão válida.
export function lerTempo(v: unknown): ValorTempo {
  const l = (v as ValorTempo | null)?.sessoes;
  if (!Array.isArray(l)) return { sessoes: [] };
  const sessoes: Sessao[] = l
    .filter(s => s && valida(s.inicio) && (s.fim == null || (valida(s.fim) && ms(s.fim) >= ms(s.inicio))))
    .map(s => ({
      id: String(s.id || novoIdSessao()), inicio: new Date(s.inicio).toISOString(), fim: s.fim ? new Date(s.fim).toISOString() : null,
      por: s.por == null ? null : String(s.por), ...(s.fim_por != null ? { fim_por: String(s.fim_por) } : {}), ...(s.manual ? { manual: true } : {}),
    }));
  // Só uma pode rodar: as outras abertas são descartadas (ficaria tempo contado em dobro).
  const abertas = sessoes.filter(s => !s.fim);
  return { sessoes: ordenar(abertas.length > 1 ? sessoes.filter(s => s.fim || s === abertas[abertas.length - 1]) : sessoes) };
}

// Aplica uma operação e devolve o novo valor (null quando não sobra sessão nenhuma).
export function operarTempo(atual: unknown, op: OpTempo, usuario: string | null, agora = new Date()): ValorTempo | null {
  const v = lerTempo(atual);
  const l = v.sessoes;
  const iso = agora.toISOString();
  const aberta = l.find(s => !s.fim);
  const conferir = (inicio: string, fim: string) => {
    if (!valida(inicio) || !valida(fim)) throw new ErroTempo('Data ou hora inválida.');
    if (ms(fim) <= ms(inicio)) throw new ErroTempo('O fim precisa ser depois do início.');
    if (ms(fim) > agora.getTime() + 60_000) throw new ErroTempo('A sessão não pode terminar no futuro.');
    if (ms(fim) - ms(inicio) > 7 * 86400_000) throw new ErroTempo('Uma sessão não pode passar de 7 dias.');
    return { inicio: new Date(inicio).toISOString(), fim: new Date(fim).toISOString() };
  };
  let sessoes: Sessao[];
  switch (op.acao) {
    case 'alternar': return operarTempo(atual, { acao: aberta ? 'parar' : 'iniciar' }, usuario, agora);
    case 'iniciar':
      if (aberta) return v;
      sessoes = [...l, { id: novoIdSessao(), inicio: iso, fim: null, por: usuario }];
      break;
    case 'parar':
      if (!aberta) return l.length ? v : null;
      sessoes = l.map(s => (s === aberta ? { ...s, fim: iso, fim_por: usuario } : s));
      break;
    case 'adicionar':
      sessoes = [...l, { id: novoIdSessao(), ...conferir(op.inicio, op.fim), por: usuario, manual: true }];
      break;
    case 'editar': {
      const s = l.find(x => x.id === op.sessao_id);
      if (!s) throw new ErroTempo('Sessão não encontrada (pode ter sido apagada por outra pessoa).');
      if (!s.fim) throw new ErroTempo('Pare o cronômetro antes de editar esta sessão.');
      sessoes = l.map(x => (x === s ? { ...x, ...conferir(op.inicio, op.fim), manual: true } : x));
      break;
    }
    case 'excluir':
      if (!l.some(x => x.id === op.sessao_id)) throw new ErroTempo('Sessão não encontrada (pode ter sido apagada por outra pessoa).');
      sessoes = l.filter(x => x.id !== op.sessao_id);
      break;
    default: throw new ErroTempo('Operação desconhecida.');
  }
  return sessoes.length ? { sessoes: ordenar(sessoes) } : null;
}

// Item duplicado: a cópia não herda o cronômetro ligado (contaria o mesmo tempo duas vezes).
export function semSessaoAberta(v: unknown): ValorTempo | null {
  const l = lerTempo(v).sessoes.filter(s => s.fim);
  return l.length ? { sessoes: l } : null;
}
