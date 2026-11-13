import { useCallback, useEffect, useRef, useState } from 'react';
import { atualizar, completo, criar, criarSubitens, duplicarItem, excluir, gravarValor, mudarEstado, observarAutomacoes, operarTempoItem, type Row } from '../api.ts';
import { useAvisoRapido } from '../ui/base.tsx';
import { posEntre } from '../util.ts';
import { colunaDoMenu, type Coluna, type Grupo, type Item, type Sub, type TipoMenu, type Visao } from './tipos.ts';
import type { OpTempo } from './tempo.ts';

// sub: quadro de subitens (colunas próprias) com os subitens dos itens visíveis.
export type Dados = { quadro: Row; grupos: Grupo[]; colunas: Coluna[]; itens: Item[]; visoes: Visao[]; sub: Sub | null };

const porPosicao = <T extends { posicao: number; id: number }>(a: T, b: T) => a.posicao - b.posicao || a.id - b.id;

// Itens e colunas podem estar no quadro principal ou no de subitens (ids não se repetem).
const comItens = (d: Dados, f: (lista: Item[]) => Item[]): Dados => ({ ...d, itens: f(d.itens), sub: d.sub && { ...d.sub, itens: f(d.sub.itens) } });
const comColunas = (d: Dados, f: (lista: Coluna[]) => Coluna[]): Dados => ({ ...d, colunas: f(d.colunas), sub: d.sub && { ...d.sub, colunas: f(d.sub.colunas) } });

// Carrega um quadro completo e expõe as ações de edição. Toda ação atualiza a tela na hora
// (otimista) e depois grava; se a gravação falhar, recarrega do servidor.
export function useQuadro(quadroId: number) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const avisar = useAvisoRapido();
  const atual = useRef(quadroId);
  atual.current = quadroId;

  const recarregar = useCallback(async () => {
    try {
      const d = (await completo(quadroId)) as unknown as Dados;
      if (atual.current === quadroId) { setDados(d); setErro(null); }
    } catch (e) { setErro((e as Error).message); }
  }, [quadroId]);
  useEffect(() => { setDados(null); recarregar(); }, [recarregar]);
  // Quadro com automações ligadas: quando uma roda no servidor (pode mover, arquivar ou mudar itens), recarrega.
  const comAutomacoes = !!dados?.quadro.n_automacoes;
  useEffect(() => (comAutomacoes ? observarAutomacoes(quadroId, recarregar) : undefined), [comAutomacoes, quadroId, recarregar]);

  const mudar = (f: (d: Dados) => Dados) => setDados(d => (d ? f(d) : d));
  const gravar = async (p: Promise<unknown>) => {
    try {
      return await p;
    } catch (e) { alert(`Não foi possível salvar: ${(e as Error).message}`); recarregar(); }
  };
  const tirarItens = (ids: number[]) => mudar(d => comItens(d, l => l.filter(i => !ids.includes(i.id) && !ids.includes(i.item_pai_id ?? -1))));

  // Desfazer: as últimas mudanças de valor, nome e grupo dos itens (da mais nova para a mais antiga), pelo botão do
  // aviso ou por Ctrl+Z (QuadroPage). Vale só na tela aberta; trocar de quadro esvazia a lista.
  const pilha = useRef<{ id: number; desfazer: () => Promise<unknown> }[]>([]);
  useEffect(() => { pilha.current = []; }, [quadroId]);
  const desfazerPasso = async (id?: number) => {
    const passo = id == null ? pilha.current[pilha.current.length - 1] : pilha.current.find(p => p.id === id);
    if (!passo) return false;
    pilha.current = pilha.current.filter(p => p !== passo);
    await passo.desfazer();
    avisar('Desfeito.');
    return true;
  };
  const lembrar = (texto: string, desfazer: () => Promise<unknown>) => {
    const passo = { id: Date.now() + Math.random(), desfazer };
    pilha.current = [...pilha.current.slice(-29), passo];
    avisar(texto, { rotulo: 'Desfazer', onClick: () => { void desfazerPasso(passo.id); } });
  };
  const todosItens = () => [...(dados?.itens ?? []), ...(dados?.sub?.itens ?? [])];
  const colunaDe = (id: number) => [...(dados?.colunas ?? []), ...(dados?.sub?.colunas ?? [])].find(c => c.id === id);
  const vazioV = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0);
  // Gravações de valor em fila, na ordem em que foram feitas: o "Desfazer" logo depois de uma mudança em lote não pode
  // terminar antes dela (a gravação mais antiga chegaria por último e desfaria o desfazer).
  const fila = useRef<Promise<unknown>>(Promise.resolve());
  const naFila = (f: () => Promise<unknown>) => { const p = fila.current.then(f); fila.current = p.catch(() => undefined); return p; };
  // Grava o valor de vários itens de uma vez (tela na hora; servidor em partes de 10).
  const aplicarValores = (mudancas: { itemId: number; valor: unknown }[], colunaId: number) => {
    const novo = new Map(mudancas.map(m => [m.itemId, m.valor]));
    mudar(d => comItens(d, l => l.map(i => {
      if (!novo.has(i.id)) return i;
      const valores = { ...i.valores };
      const v = novo.get(i.id);
      if (vazioV(v)) delete valores[colunaId]; else valores[colunaId] = v;
      return { ...i, valores };
    })));
    return naFila(async () => {
      for (let k = 0; k < mudancas.length; k += 10) {
        await gravar(Promise.all(mudancas.slice(k, k + 10).map(m => gravarValor(m.itemId, { coluna_id: colunaId, valor: m.valor }))));
      }
    });
  };
  const definirValor = (itemId: number, colunaId: number, valor: unknown) => {
    const antes = todosItens().find(i => i.id === itemId)?.valores[colunaId];
    const igual = JSON.stringify(antes ?? null) === JSON.stringify(vazioV(valor) ? null : valor);
    if (!igual) lembrar(`“${colunaDe(colunaId)?.titulo ?? 'Campo'}” alterado.`, () => aplicarValores([{ itemId, valor: antes ?? null }], colunaId));
    return aplicarValores([{ itemId, valor }], colunaId);
  };
  // Vários itens selecionados: mudar o campo de um muda o de todos (os que são do quadro da coluna: item com item,
  // subitem com subitem). Um "Desfazer" volta todos ao valor que cada um tinha.
  const definirValorEmLote = (itemIds: number[], colunaId: number, valor: unknown) => {
    const coluna = colunaDe(colunaId);
    const alvos = todosItens().filter(i => itemIds.includes(i.id) && i.quadro_id === coluna?.quadro_id);
    const muda = alvos.filter(i => JSON.stringify(i.valores[colunaId] ?? null) !== JSON.stringify(vazioV(valor) ? null : valor));
    if (!muda.length) return Promise.resolve();
    const antes = muda.map(i => ({ itemId: i.id, valor: i.valores[colunaId] ?? null }));
    lembrar(`“${coluna?.titulo ?? 'Campo'}” alterado em ${muda.length} ${muda.length === 1 ? 'item' : 'itens'}.`, () => aplicarValores(antes, colunaId));
    return aplicarValores(muda.map(i => ({ itemId: i.id, valor })), colunaId);
  };

  // Cria o quadro de subitens na primeira vez que alguém adiciona um subitem.
  const garantirSub = async (): Promise<Sub> => {
    const s = dados?.sub;
    if (s?.grupo_id) return s;
    const q = (await criarSubitens(quadroId)) as Row;
    const novo: Sub = { quadro_id: q.id, grupo_id: q.grupo_id, nome_item: s?.nome_item ?? q.nome_item, colunas: s?.colunas.length ? s.colunas : (q.colunas as Coluna[]), itens: s?.itens ?? [] };
    mudar(d => ({ ...d, sub: { ...novo, itens: d.sub?.itens ?? [] } }));
    return novo;
  };

  const acoes = {
    recarregar,

    // ---------------- quadro e visões
    atualizarQuadro: (campos: Record<string, unknown>) => {
      mudar(d => ({ ...d, quadro: { ...d.quadro, ...campos } }));
      return gravar(atualizar('quadros', quadroId, campos));
    },
    criarVisao: async (nome: string, tipo: Visao['tipo'], coluna_id?: number, config: Visao['config'] = {}) => {
      const v = (await criar('visoes', { quadro_id: quadroId, nome, tipo, config: { ...config, ...(coluna_id ? { coluna_id } : {}) } })) as Visao;
      mudar(d => ({ ...d, visoes: [...d.visoes, v] }));
      return v;
    },
    atualizarVisao: (id: number, campos: Partial<Visao>) => {
      mudar(d => ({ ...d, visoes: d.visoes.map(v => (v.id === id ? { ...v, ...campos } : v)) }));
      return gravar(atualizar('visoes', id, campos));
    },
    excluirVisao: (id: number) => {
      mudar(d => ({ ...d, visoes: d.visoes.filter(v => v.id !== id) }));
      return gravar(excluir('visoes', id));
    },

    // ---------------- grupos
    criarGrupo: async (nome = 'Novo grupo', noTopo = true, cor?: string) => {
      const gs = dados?.grupos ?? [];
      const posicao = noTopo ? posEntre(null, gs[0]?.posicao) : posEntre(gs.at(-1)?.posicao, null);
      const g = (await criar('grupos', { quadro_id: quadroId, nome, posicao, cor: cor ?? '#579bfc' })) as Grupo;
      mudar(d => ({ ...d, grupos: [...d.grupos, g].sort(porPosicao) }));
      return g;
    },
    atualizarGrupo: (id: number, campos: Partial<Grupo>) => {
      mudar(d => ({ ...d, grupos: d.grupos.map(g => (g.id === id ? { ...g, ...campos } : g)).sort(porPosicao) }));
      return gravar(atualizar('grupos', id, campos));
    },
    // Excluir manda para a lixeira; arquivar guarda fora da vista. Os dois podem ser restaurados.
    excluirGrupo: (id: number) => {
      mudar(d => ({ ...d, grupos: d.grupos.filter(g => g.id !== id), itens: d.itens.filter(i => i.grupo_id !== id) }));
      return gravar(excluir('grupos', id));
    },
    arquivarGrupo: (id: number) => {
      mudar(d => ({ ...d, grupos: d.grupos.filter(g => g.id !== id), itens: d.itens.filter(i => i.grupo_id !== id) }));
      return gravar(mudarEstado('grupos', id, 'arquivar'));
    },
    restaurar: async (r: 'itens' | 'grupos', ids: number[]) => {
      await gravar(Promise.all(ids.map(id => mudarEstado(r, id, 'restaurar'))));
      await recarregar();
    },

    // ---------------- colunas (do quadro ou dos subitens)
    criarColuna: async (tipoMenu: TipoMenu, titulo: string, aposPosicao?: number) => {
      const cs = dados?.colunas ?? [];
      const idx = aposPosicao == null ? cs.length - 1 : cs.findIndex(c => c.posicao === aposPosicao);
      const posicao = posEntre(cs[idx]?.posicao ?? null, cs[idx + 1]?.posicao ?? null);
      const c = (await criar('colunas', { quadro_id: quadroId, ...colunaDoMenu(tipoMenu), titulo, posicao })) as Coluna;
      mudar(d => ({ ...d, colunas: [...d.colunas, c].sort(porPosicao) }));
      return c;
    },
    criarColunaSub: async (tipoMenu: TipoMenu, titulo: string) => {
      const s = await garantirSub();
      const c = (await criar('colunas', { quadro_id: s.quadro_id, ...colunaDoMenu(tipoMenu), titulo })) as Coluna;
      mudar(d => (d.sub ? { ...d, sub: { ...d.sub, colunas: [...d.sub.colunas, c].sort(porPosicao) } } : d));
      return c;
    },
    renomearItensSub: async (nome: string) => {
      const s = await garantirSub();
      mudar(d => (d.sub ? { ...d, sub: { ...d.sub, nome_item: nome } } : d));
      return gravar(atualizar('quadros', s.quadro_id, { nome_item: nome }));
    },
    atualizarColuna: (id: number, campos: Partial<Coluna>) => {
      mudar(d => comColunas(d, l => l.map(c => (c.id === id ? { ...c, ...campos } : c)).sort(porPosicao)));
      return gravar(atualizar('colunas', id, campos));
    },
    excluirColuna: (id: number) => {
      mudar(d => comColunas(d, l => l.filter(c => c.id !== id)));
      return gravar(excluir('colunas', id));
    },

    // ---------------- itens e subitens
    criarItem: async (grupoId: number, nome: string, noTopo = false, valores: Record<string, unknown> = {}) => {
      const doGrupo = (dados?.itens ?? []).filter(i => i.grupo_id === grupoId && !i.item_pai_id).sort(porPosicao);
      const posicao = noTopo ? posEntre(null, doGrupo[0]?.posicao) : posEntre(doGrupo.at(-1)?.posicao, null);
      const it = (await criar('itens', { quadro_id: quadroId, grupo_id: grupoId, nome, posicao, valores })) as Item;
      mudar(d => ({ ...d, itens: [...d.itens, { ...it, n_atualizacoes: 0 }] }));
      return it;
    },
    criarSubitem: async (paiId: number, nome: string) => {
      const s = await garantirSub();
      // Sem "posicao": o servidor coloca no fim dos subitens do mesmo pai.
      const it = (await criar('itens', { quadro_id: s.quadro_id, grupo_id: s.grupo_id, item_pai_id: paiId, nome })) as Item;
      mudar(d => (d.sub ? { ...d, sub: { ...d.sub, itens: [...d.sub.itens, { ...it, n_atualizacoes: 0 }] } } : d));
      return it;
    },
    renomearItem: (id: number, nome: string) => {
      const antes = todosItens().find(i => i.id === id)?.nome;
      const renomear = (n: string) => {
        mudar(d => comItens(d, l => l.map(i => (i.id === id ? { ...i, nome: n } : i))));
        return gravar(atualizar('itens', id, { nome: n }));
      };
      if (antes != null && antes !== nome) lembrar('Nome alterado.', () => renomear(antes));
      return renomear(nome);
    },
    definirValor,
    definirValorEmLote,
    // Célula da tabela: com mais de um item selecionado e este entre eles, a mudança vale para todos (Arquivos não:
    // os arquivos são de cada item).
    definirNaCelula: (selecionados: ReadonlySet<number>, itemId: number, coluna: Coluna, valor: unknown) =>
      (selecionados.size > 1 && selecionados.has(itemId) && coluna.tipo !== 'arquivos'
        ? definirValorEmLote([...selecionados], coluna.id, valor)
        : definirValor(itemId, coluna.id, valor)),
    desfazer: () => desfazerPasso(),
    // Controle de tempo: a conta é feita numa transação sobre o valor gravado (api.ts) e volta o item. Erros voltam
    // para quem chamou (o registro de tempo mostra a mensagem, como "o fim precisa ser depois do início"); a tela
    // recarrega, porque o erro pode vir de uma sessão que outra pessoa já mudou.
    tempo: async (itemId: number, colunaId: number, op: OpTempo) => {
      const it = await operarTempoItem(itemId, { coluna_id: colunaId, ...op }).catch(e => { recarregar(); throw e; });
      mudar(d => comItens(d, l => l.map(i => (i.id === itemId ? { ...i, valores: it.valores } : i))));
    },
    moverItem: (id: number, grupoId: number, posicao: number) => {
      const antes = dados?.itens.find(i => i.id === id);
      const mover = (g: number, p: number) => {
        mudar(d => ({ ...d, itens: d.itens.map(i => (i.id === id ? { ...i, grupo_id: g, posicao: p } : i)) }));
        return gravar(atualizar('itens', id, { grupo_id: g, posicao: p }));
      };
      if (antes) lembrar('Item movido.', () => mover(antes.grupo_id, antes.posicao));
      return mover(grupoId, posicao);
    },
    excluirItens: async (ids: number[]) => {
      tirarItens(ids);
      await gravar(Promise.all(ids.map(id => excluir('itens', id))));
    },
    arquivarItens: async (ids: number[]) => {
      tirarItens(ids);
      await gravar(Promise.all(ids.map(id => mudarEstado('itens', id, 'arquivar'))));
    },
    duplicarItens: async (ids: number[]) => {
      const novos = (await Promise.all(ids.map(id => duplicarItem(id)))) as Item[];
      const marcar = (l: Item[]) => l.map(n => ({ ...n, n_atualizacoes: 0 }));
      mudar(d => ({
        ...d,
        itens: [...d.itens, ...marcar(novos.filter(n => !n.item_pai_id))],
        sub: d.sub && { ...d.sub, itens: [...d.sub.itens, ...marcar(novos.filter(n => n.item_pai_id))] },
      }));
    },
    moverItens: async (ids: number[], grupoId: number) => {
      const fim = Math.max(0, ...(dados?.itens ?? []).filter(i => i.grupo_id === grupoId).map(i => i.posicao));
      const antes = (dados?.itens ?? []).filter(i => ids.includes(i.id)).map(i => ({ id: i.id, grupo_id: i.grupo_id, posicao: i.posicao }));
      const mover = async (l: { id: number; grupo_id: number; posicao: number }[]) => {
        const m = new Map(l.map(x => [x.id, x]));
        mudar(d => ({ ...d, itens: d.itens.map(i => (m.has(i.id) ? { ...i, grupo_id: m.get(i.id)!.grupo_id, posicao: m.get(i.id)!.posicao } : i)) }));
        await gravar(Promise.all(l.map(x => atualizar('itens', x.id, { grupo_id: x.grupo_id, posicao: x.posicao }))));
      };
      if (antes.length) lembrar(`${antes.length === 1 ? 'Item movido' : `${antes.length} itens movidos`}.`, () => mover(antes));
      await mover(ids.map((id, k) => ({ id, grupo_id: grupoId, posicao: fim + 1 + k })));
    },
    // Ajuste local de campos calculados (contadores), sem gravar; ignora se nada mudou.
    ajustarItem: (itemId: number, campos: Partial<Item>) =>
      setDados(d => {
        if (!d) return d;
        const it = [...d.itens, ...(d.sub?.itens ?? [])].find(i => i.id === itemId);
        if (!it || Object.entries(campos).every(([k, v]) => (it as Record<string, unknown>)[k] === v)) return d;
        return comItens(d, l => l.map(i => (i.id === itemId ? { ...i, ...campos } : i)));
      }),
    contarAtualizacao: (itemId: number, delta: number) =>
      mudar(d => comItens(d, l => l.map(i => (i.id === itemId ? { ...i, n_atualizacoes: (i.n_atualizacoes ?? 0) + delta } : i)))),
  };

  // Quadro só para ver: as ações que gravam viram um aviso (o servidor também recusa).
  const LOCAIS = new Set(['recarregar', 'ajustarItem', 'contarAtualizacao', 'desfazer']);
  const finais = dados?.quadro.permissao === 'ver'
    ? (Object.fromEntries(Object.entries(acoes).map(([k, f]) => [k, LOCAIS.has(k) ? f : () => {
      avisar('Você só pode ver este quadro.');
      return Promise.reject(new Error('somente leitura'));
    }])) as typeof acoes)
    : acoes;
  // Cadastro oficial do quadro (menus de campo oficial nas colunas); fica fora de `finais`, que só tem funções.
  const oficial = dados?.quadro.oficial
    ? { quadroId, ...dados.quadro.oficial } as { quadroId: number; chave: string; nome: string; subitens: string | null; sub_chave: string | null; grupo: string | null; grupo_chave: string | null; modo: 'novo' | 'existente'; colecao: string } : null;
  return { dados, erro, oficial, ...finais };
}

export type Acoes = Omit<ReturnType<typeof useQuadro>, 'dados' | 'erro'>;
export { porPosicao };
