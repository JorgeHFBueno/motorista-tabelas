// Fila de envio dos checklists concluídos, igual ao ChecklistEnviador do app (data/checklist_envio.dart): envia cada
// arquivo pulando os que já existem, marca cada um como enviado, grava o documento numa transação e só então apaga os
// dados locais. O armazenamento e o destino são injetados (IndexedDB e Firebase na tela, falsos nos testes).
import { arquivosParaEnvio } from './documento';
import type { ChecklistPendente } from './rascunho';

export interface ArmazenamentoFila {
  listarPendentes(): Promise<ChecklistPendente[]>;
  salvarPendente(pendente: ChecklistPendente): Promise<void>;
  removerPendente(checklistId: string): Promise<void>;
  lerArquivo(chave: string): Promise<Blob | null>;
  apagarArquivosDoChecklist(checklistId: string): Promise<void>;
}

export interface DestinoChecklist {
  arquivoExiste(caminho: string): Promise<boolean>;
  enviarArquivo(caminho: string, arquivo: Blob): Promise<void>;
  /** Grava `checklists-v2/{id}` e atualiza o medidor numa transação; se o documento já existe (reenvio), nada muda. */
  gravar(pendente: ChecklistPendente): Promise<void>;
}

/** Esperas entre tentativas, pela quantidade de falhas: 30 s, 1, 2, 5, 10 e 15 min. */
export const ESPERAS_ENTRE_TENTATIVAS_MS = [30_000, 60_000, 120_000, 300_000, 600_000, 900_000];

export const esperaApos = (falhas: number) =>
  ESPERAS_ENTRE_TENTATIVAS_MS[Math.min(Math.max(falhas - 1, 0), ESPERAS_ENTRE_TENTATIVAS_MS.length - 1)];

export type EstadoEnvio = {
  /** Checklists de quem está logado ainda não enviados. */
  pendentes: number;
  enviando: boolean;
  /** Arquivos enviados e total do checklist em envio. */
  progresso: { enviados: number; total: number } | null;
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

export class EnviadorChecklist {
  private estado: EstadoEnvio = { pendentes: 0, enviando: false, progresso: null };
  private ouvintes = new Set<() => void>();
  private repetir = false;
  private proxima: unknown = null;
  private readonly armazenamento: ArmazenamentoFila;
  private readonly destino: DestinoChecklist;
  private readonly uidAtual: () => string | null;
  private readonly relogio: Relogio;

  constructor(opcoes: { armazenamento: ArmazenamentoFila; destino: DestinoChecklist; uidAtual: () => string | null; relogio?: Partial<Relogio> }) {
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

  /** A fila é do aparelho, mas as Rules só aceitam o checklist de quem o fez: os de outra pessoa esperam ela entrar. */
  async pendentesDoUsuario(): Promise<ChecklistPendente[]> {
    const uid = this.uidAtual();
    if (!uid) return [];
    return (await this.armazenamento.listarPendentes()).filter((p) => p.autor.uid === uid);
  }

  /** Atualiza a contagem sem enviar (ao abrir a tela). */
  async atualizarContagem(): Promise<void> {
    if (!this.estado.enviando) this.mudar({ pendentes: (await this.pendentesDoUsuario()).length });
  }

  /** Envia o que estiver pendente. Sem `forcar`, respeita a espera entre tentativas; chamadas durante um envio viram nova rodada. */
  async enviarPendentes({ forcar = false } = {}): Promise<void> {
    if (this.estado.enviando) {
      this.repetir = true;
      return;
    }
    if (this.proxima != null) this.relogio.cancelar(this.proxima);
    this.proxima = null;
    this.mudar({ enviando: true });
    try {
      do {
        this.repetir = false;
        const lista = await this.pendentesDoUsuario();
        this.mudar({ pendentes: lista.length });
        for (const pendente of lista) {
          if (!forcar && pendente.proximaTentativa && pendente.proximaTentativa > this.relogio.agora()) continue;
          await this.enviar(pendente);
        }
        forcar = false;
      } while (this.repetir);
    } finally {
      this.mudar({ enviando: false, progresso: null });
      await this.agendarProxima();
    }
  }

  private async enviar(inicial: ChecklistPendente): Promise<void> {
    let pendente = inicial;
    const arquivos = arquivosParaEnvio(pendente);
    const avancar = () => this.mudar({ progresso: { enviados: pendente.enviados.length, total: arquivos.length } });
    try {
      avancar();
      for (const { caminho, local } of arquivos) {
        if (pendente.enviados.includes(caminho)) continue;
        if (!(await this.destino.arquivoExiste(caminho))) {
          const arquivo = await this.armazenamento.lerArquivo(local);
          if (!arquivo) throw new Error(`Arquivo ${local} não está mais no aparelho.`);
          await this.destino.enviarArquivo(caminho, arquivo);
        }
        pendente = { ...pendente, enviados: [...pendente.enviados, caminho] };
        await this.armazenamento.salvarPendente(pendente);
        avancar();
      }
      await this.destino.gravar(pendente);
      await this.armazenamento.removerPendente(pendente.rascunho.id);
      await this.armazenamento.apagarArquivosDoChecklist(pendente.rascunho.id);
      this.mudar({ pendentes: Math.max(0, this.estado.pendentes - 1) });
    } catch (error) {
      console.warn(`Checklist ${pendente.rascunho.id}: envio falhou`, error);
      const tentativas = pendente.tentativas + 1;
      const proximaTentativa = new Date(this.relogio.agora().getTime() + esperaApos(tentativas));
      await this.armazenamento.salvarPendente({ ...pendente, tentativas, proximaTentativa });
    }
  }

  private async agendarProxima(): Promise<void> {
    const lista = await this.pendentesDoUsuario();
    this.mudar({ pendentes: lista.length });
    if (lista.length === 0) return;
    const agora = this.relogio.agora().getTime();
    const primeira = Math.min(...lista.map((p) => (p.proximaTentativa ?? this.relogio.agora()).getTime()));
    this.proxima = this.relogio.agendar(() => {
      this.proxima = null;
      void this.enviarPendentes();
    }, Math.max(0, primeira - agora));
  }
}
