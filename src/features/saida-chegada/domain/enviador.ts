// Fila de envio das Saídas e Chegadas, igual ao AtividadesEnviador do app (data/atividades_fila.dart): cada lançamento
// fica no aparelho até a gravação dar certo, com novas tentativas. O armazenamento e o destino são injetados
// (IndexedDB e Firebase na tela, falsos nos testes).
import type { AtividadePendente } from './atividade';

export interface ArmazenamentoAtividades {
  listarPendentes(): Promise<AtividadePendente[]>;
  salvarPendente(pendente: AtividadePendente): Promise<void>;
  removerPendente(id: string): Promise<void>;
}

export interface DestinoAtividades {
  /** Grava `atividades/{id}` e sobe o KM do veículo numa transação; se o documento já existe (reenvio), nada muda. */
  gravar(pendente: AtividadePendente): Promise<void>;
}

/** Esperas entre tentativas, pela quantidade de falhas: 30 s, 1, 2, 5, 10 e 15 min (as do app). */
export const ESPERAS_ENTRE_TENTATIVAS_MS = [30_000, 60_000, 120_000, 300_000, 600_000, 900_000];

export const esperaApos = (falhas: number) =>
  ESPERAS_ENTRE_TENTATIVAS_MS[Math.min(Math.max(falhas - 1, 0), ESPERAS_ENTRE_TENTATIVAS_MS.length - 1)];

export type EstadoEnvio = {
  /** Lançamentos de quem está logado ainda não enviados, do mais antigo ao mais novo. */
  pendentes: AtividadePendente[];
  /** Enviados por este aparelho desde que a tela abriu (o Histórico os mostra até a lista do servidor trazê-los). */
  enviados: AtividadePendente[];
  enviando: boolean;
};

type Relogio = {
  agora: () => Date;
  agendar: (acao: () => void, ms: number) => unknown;
  cancelar: (id: unknown) => void;
};

const relogioReal: Relogio = {
  agora: () => new Date(),
  agendar: (acao, ms) => setTimeout(acao, ms),
  cancelar: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

/** Texto curto da falha, para o Histórico. */
export function mensagemDeErro(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 'unavailable' || code === 'failed-precondition' || code === 'deadline-exceeded') return 'Sem conexão com o servidor.';
  if (code === 'permission-denied') return 'Sem permissão para gravar. Avise o responsável.';
  return error instanceof Error && error.message ? error.message : 'Falha desconhecida.';
}

export class EnviadorAtividades {
  private estado: EstadoEnvio = { pendentes: [], enviados: [], enviando: false };
  private ouvintes = new Set<() => void>();
  private repetir = false;
  /** "Tentar novamente" durante um envio: a próxima rodada ignora a espera entre tentativas. */
  private repetirForcado = false;
  /** Rodada de envio em andamento. */
  private rodada: Promise<void> | null = null;
  private proxima: unknown = null;
  private readonly armazenamento: ArmazenamentoAtividades;
  private readonly destino: DestinoAtividades;
  private readonly uidAtual: () => string | null;
  private readonly relogio: Relogio;

  constructor(opcoes: {
    armazenamento: ArmazenamentoAtividades;
    destino: DestinoAtividades;
    uidAtual: () => string | null;
    relogio?: Partial<Relogio>;
  }) {
    this.armazenamento = opcoes.armazenamento;
    this.destino = opcoes.destino;
    this.uidAtual = opcoes.uidAtual;
    this.relogio = { ...relogioReal, ...opcoes.relogio };
  }

  obterEstado = (): EstadoEnvio => this.estado;

  assinar = (ouvinte: () => void): (() => void) => {
    this.ouvintes.add(ouvinte);
    return () => this.ouvintes.delete(ouvinte);
  };

  private mudar(parcial: Partial<EstadoEnvio>) {
    this.estado = { ...this.estado, ...parcial };
    for (const ouvinte of this.ouvintes) ouvinte();
  }

  /** A fila é do aparelho, mas as Rules só aceitam o lançamento de quem o fez: os de outra pessoa esperam ela entrar. */
  async pendentesDoUsuario(): Promise<AtividadePendente[]> {
    const uid = this.uidAtual();
    if (!uid) return [];
    return (await this.armazenamento.listarPendentes())
      .filter((p) => p.criadoPor.uid === uid)
      .sort((a, b) => a.lancadoEm.getTime() - b.lancadoEm.getTime());
  }

  /** Guarda o lançamento na fila e dispara o envio. Só falha se o aparelho não conseguir guardar. */
  async lancar(pendente: AtividadePendente): Promise<void> {
    await this.armazenamento.salvarPendente(pendente);
    this.mudar({ pendentes: await this.pendentesDoUsuario() });
    void this.enviarPendentes({ forcar: true });
  }

  /** Atualiza a lista sem enviar. */
  async atualizar(): Promise<void> {
    if (!this.estado.enviando) this.mudar({ pendentes: await this.pendentesDoUsuario() });
  }

  /**
   * Envia o que estiver pendente. Sem `forcar`, respeita a espera entre tentativas. Uma chamada durante um envio vira
   * nova rodada e espera ela acabar.
   */
  enviarPendentes({ forcar = false } = {}): Promise<void> {
    if (this.rodada) {
      this.repetir = true;
      if (forcar) this.repetirForcado = true;
      return this.rodada;
    }
    this.rodada = this.rodar(forcar).finally(() => { this.rodada = null; });
    return this.rodada;
  }

  private async rodar(forcar: boolean): Promise<void> {
    if (this.proxima != null) this.relogio.cancelar(this.proxima);
    this.proxima = null;
    this.mudar({ enviando: true });
    try {
      do {
        this.repetir = false;
        forcar = forcar || this.repetirForcado;
        this.repetirForcado = false;
        const lista = await this.pendentesDoUsuario();
        this.mudar({ pendentes: lista });
        for (const pendente of lista) {
          if (!forcar && pendente.proximaTentativa && pendente.proximaTentativa > this.relogio.agora()) continue;
          await this.enviar(pendente);
        }
        forcar = false;
      } while (this.repetir);
    } finally {
      this.mudar({ enviando: false });
      await this.agendarProxima();
    }
  }

  private async enviar(pendente: AtividadePendente): Promise<void> {
    try {
      await this.destino.gravar(pendente);
      await this.armazenamento.removerPendente(pendente.id);
      this.mudar({ enviados: [pendente, ...this.estado.enviados].slice(0, 20) });
    } catch (error) {
      console.warn(`Atividade ${pendente.id}: envio falhou`, error);
      const tentativas = pendente.tentativas + 1;
      const proximaTentativa = new Date(this.relogio.agora().getTime() + esperaApos(tentativas));
      await this.armazenamento.salvarPendente({ ...pendente, tentativas, proximaTentativa, ultimoErro: mensagemDeErro(error) });
    }
    this.mudar({ pendentes: await this.pendentesDoUsuario() });
  }

  private async agendarProxima(): Promise<void> {
    const lista = await this.pendentesDoUsuario();
    this.mudar({ pendentes: lista });
    if (lista.length === 0) return;
    const agora = this.relogio.agora().getTime();
    const primeira = Math.min(...lista.map((p) => (p.proximaTentativa ?? this.relogio.agora()).getTime()));
    this.proxima = this.relogio.agendar(() => {
      this.proxima = null;
      void this.enviarPendentes();
    }, Math.max(0, primeira - agora));
  }
}
