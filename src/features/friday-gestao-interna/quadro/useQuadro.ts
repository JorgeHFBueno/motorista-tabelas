import { useCallback, useEffect, useRef, useState } from 'react';
import { api, req, type Row } from '../api.ts';
import { useAvisoRapido } from '../ui/base.tsx';
import { posEntre } from '../util.ts';
import type { Coluna, Grupo, Item, Sub, TipoColuna, Visao } from './tipos.ts';

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
      const d = await req<Dados>('GET', `quadros/${quadroId}/completo`);
      if (atual.current === quadroId) { setDados(d); setErro(null); }
    } catch (e) { setErro((e as Error).message); }
  }, [quadroId]);
  useEffect(() => { setDados(null); recarregar(); }, [recarregar]);

  const mudar = (f: (d: Dados) => Dados) => setDados(d => (d ? f(d) : d));
  // Se a gravação disparou automações (_automacoes > 0), o servidor pode ter mudado outros itens: recarrega.
  const gravar = async (p: Promise<unknown>) => {
    try {
      const r = await p;
      const lista = Array.isArray(r) ? r : [r];
      if (lista.some(x => (x as { _automacoes?: number } | undefined)?._automacoes)) recarregar();
      return r;
    } catch (e) { alert(`Não foi possível salvar: ${(e as Error).message}`); recarregar(); }
  };
  const tirarItens = (ids: number[]) => mudar(d => comItens(d, l => l.filter(i => !ids.includes(i.id) && !ids.includes(i.item_pai_id ?? -1))));

  // Cria o quadro de subitens na primeira vez que alguém adiciona um subitem.
  const garantirSub = async (): Promise<Sub> => {
    const s = dados?.sub;
    if (s?.grupo_id) return s;
    const q = await req<Row>('POST', `quadros/${quadroId}/subitens`);
    const novo: Sub = { quadro_id: q.id, grupo_id: q.grupo_id, nome_item: s?.nome_item ?? q.nome_item, colunas: s?.colunas.length ? s.colunas : (q.colunas as Coluna[]), itens: s?.itens ?? [] };
    mudar(d => ({ ...d, sub: { ...novo, itens: d.sub?.itens ?? [] } }));
    return novo;
  };

  const acoes = {
    recarregar,

    // ---------------- quadro e visões
    atualizarQuadro: (campos: Record<string, unknown>) => {
      mudar(d => ({ ...d, quadro: { ...d.quadro, ...campos } }));
      return gravar(api.update('quadros', quadroId, campos));
    },
    criarVisao: async (nome: string, tipo: Visao['tipo'], coluna_id?: number, config: Visao['config'] = {}) => {
      const v = (await api.create('visoes', { quadro_id: quadroId, nome, tipo, config: { ...config, ...(coluna_id ? { coluna_id } : {}) } })) as Visao;
      mudar(d => ({ ...d, visoes: [...d.visoes, v] }));
      return v;
    },
    atualizarVisao: (id: number, campos: Partial<Visao>) => {
      mudar(d => ({ ...d, visoes: d.visoes.map(v => (v.id === id ? { ...v, ...campos } : v)) }));
      return gravar(api.update('visoes', id, campos));
    },
    excluirVisao: (id: number) => {
      mudar(d => ({ ...d, visoes: d.visoes.filter(v => v.id !== id) }));
      return gravar(api.remove('visoes', id));
    },

    // ---------------- grupos
    criarGrupo: async (nome = 'Novo grupo', noTopo = true, cor?: string) => {
      const gs = dados?.grupos ?? [];
      const posicao = noTopo ? posEntre(null, gs[0]?.posicao) : posEntre(gs.at(-1)?.posicao, null);
      const g = (await api.create('grupos', { quadro_id: quadroId, nome, posicao, cor: cor ?? '#579bfc' })) as Grupo;
      mudar(d => ({ ...d, grupos: [...d.grupos, g].sort(porPosicao) }));
      return g;
    },
    atualizarGrupo: (id: number, campos: Partial<Grupo>) => {
      mudar(d => ({ ...d, grupos: d.grupos.map(g => (g.id === id ? { ...g, ...campos } : g)).sort(porPosicao) }));
      return gravar(api.update('grupos', id, campos));
    },
    // Excluir manda para a lixeira; arquivar guarda fora da vista. Os dois podem ser restaurados.
    excluirGrupo: (id: number) => {
      mudar(d => ({ ...d, grupos: d.grupos.filter(g => g.id !== id), itens: d.itens.filter(i => i.grupo_id !== id) }));
      return gravar(api.remove('grupos', id));
    },
    arquivarGrupo: (id: number) => {
      mudar(d => ({ ...d, grupos: d.grupos.filter(g => g.id !== id), itens: d.itens.filter(i => i.grupo_id !== id) }));
      return gravar(req('POST', `grupos/${id}/arquivar`));
    },
    restaurar: async (r: 'itens' | 'grupos', ids: number[]) => {
      await gravar(Promise.all(ids.map(id => req('POST', `${r}/${id}/restaurar`))));
      await recarregar();
    },

    // ---------------- colunas (do quadro ou dos subitens)
    criarColuna: async (tipo: TipoColuna, titulo: string, aposPosicao?: number) => {
      const cs = dados?.colunas ?? [];
      const idx = aposPosicao == null ? cs.length - 1 : cs.findIndex(c => c.posicao === aposPosicao);
      const posicao = posEntre(cs[idx]?.posicao ?? null, cs[idx + 1]?.posicao ?? null);
      const c = (await api.create('colunas', { quadro_id: quadroId, tipo, titulo, posicao })) as Coluna;
      mudar(d => ({ ...d, colunas: [...d.colunas, c].sort(porPosicao) }));
      return c;
    },
    criarColunaSub: async (tipo: TipoColuna, titulo: string) => {
      const s = await garantirSub();
      const c = (await api.create('colunas', { quadro_id: s.quadro_id, tipo, titulo })) as Coluna;
      mudar(d => (d.sub ? { ...d, sub: { ...d.sub, colunas: [...d.sub.colunas, c].sort(porPosicao) } } : d));
      return c;
    },
    renomearItensSub: async (nome: string) => {
      const s = await garantirSub();
      mudar(d => (d.sub ? { ...d, sub: { ...d.sub, nome_item: nome } } : d));
      return gravar(api.update('quadros', s.quadro_id, { nome_item: nome }));
    },
    atualizarColuna: (id: number, campos: Partial<Coluna>) => {
      mudar(d => comColunas(d, l => l.map(c => (c.id === id ? { ...c, ...campos } : c)).sort(porPosicao)));
      return gravar(api.update('colunas', id, campos));
    },
    excluirColuna: (id: number) => {
      mudar(d => comColunas(d, l => l.filter(c => c.id !== id)));
      return gravar(api.remove('colunas', id));
    },

    // ---------------- itens e subitens
    criarItem: async (grupoId: number, nome: string, noTopo = false, valores: Record<string, unknown> = {}) => {
      const doGrupo = (dados?.itens ?? []).filter(i => i.grupo_id === grupoId && !i.item_pai_id).sort(porPosicao);
      const posicao = noTopo ? posEntre(null, doGrupo[0]?.posicao) : posEntre(doGrupo.at(-1)?.posicao, null);
      const it = (await api.create('itens', { quadro_id: quadroId, grupo_id: grupoId, nome, posicao, valores })) as Item;
      mudar(d => ({ ...d, itens: [...d.itens, { ...it, n_atualizacoes: 0 }] }));
      if ((it as { _automacoes?: number })._automacoes) recarregar();
      return it;
    },
    criarSubitem: async (paiId: number, nome: string) => {
      const s = await garantirSub();
      // Sem "posicao": o servidor coloca no fim dos subitens do mesmo pai.
      const it = (await api.create('itens', { quadro_id: s.quadro_id, grupo_id: s.grupo_id, item_pai_id: paiId, nome })) as Item;
      mudar(d => (d.sub ? { ...d, sub: { ...d.sub, itens: [...d.sub.itens, { ...it, n_atualizacoes: 0 }] } } : d));
      return it;
    },
    renomearItem: (id: number, nome: string) => {
      mudar(d => comItens(d, l => l.map(i => (i.id === id ? { ...i, nome } : i))));
      return gravar(api.update('itens', id, { nome }));
    },
    definirValor: (itemId: number, colunaId: number, valor: unknown) => {
      mudar(d => comItens(d, l => l.map(i => {
        if (i.id !== itemId) return i;
        const valores = { ...i.valores };
        if (valor == null || valor === '' || (Array.isArray(valor) && valor.length === 0)) delete valores[colunaId];
        else valores[colunaId] = valor;
        return { ...i, valores };
      })));
      return gravar(req('PATCH', `itens/${itemId}/valor`, { coluna_id: colunaId, valor }));
    },
    moverItem: (id: number, grupoId: number, posicao: number) => {
      mudar(d => ({ ...d, itens: d.itens.map(i => (i.id === id ? { ...i, grupo_id: grupoId, posicao } : i)) }));
      return gravar(api.update('itens', id, { grupo_id: grupoId, posicao }));
    },
    excluirItens: async (ids: number[]) => {
      tirarItens(ids);
      await gravar(Promise.all(ids.map(id => api.remove('itens', id))));
    },
    arquivarItens: async (ids: number[]) => {
      tirarItens(ids);
      await gravar(Promise.all(ids.map(id => req('POST', `itens/${id}/arquivar`))));
    },
    duplicarItens: async (ids: number[]) => {
      const novos = await Promise.all(ids.map(id => req<Item>('POST', `itens/${id}/duplicar`)));
      const marcar = (l: Item[]) => l.map(n => ({ ...n, n_atualizacoes: 0 }));
      mudar(d => ({
        ...d,
        itens: [...d.itens, ...marcar(novos.filter(n => !n.item_pai_id))],
        sub: d.sub && { ...d.sub, itens: [...d.sub.itens, ...marcar(novos.filter(n => n.item_pai_id))] },
      }));
    },
    moverItens: async (ids: number[], grupoId: number) => {
      const fim = Math.max(0, ...(dados?.itens ?? []).filter(i => i.grupo_id === grupoId).map(i => i.posicao));
      mudar(d => ({ ...d, itens: d.itens.map(i => (ids.includes(i.id) ? { ...i, grupo_id: grupoId, posicao: fim + 1 + ids.indexOf(i.id) } : i)) }));
      await gravar(Promise.all(ids.map((id, k) => api.update('itens', id, { grupo_id: grupoId, posicao: fim + 1 + k }))));
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
  const LOCAIS = new Set(['recarregar', 'ajustarItem', 'contarAtualizacao']);
  const finais = dados?.quadro.permissao === 'ver'
    ? (Object.fromEntries(Object.entries(acoes).map(([k, f]) => [k, LOCAIS.has(k) ? f : () => {
      avisar('Você só pode ver este quadro.');
      return Promise.reject(new Error('somente leitura'));
    }])) as typeof acoes)
    : acoes;
  // Cadastro oficial do quadro (menus de campo oficial nas colunas); fica fora de `finais`, que só tem funções.
  const oficial = dados?.quadro.oficial
    ? { quadroId, ...dados.quadro.oficial } as { quadroId: number; chave: string; nome: string; subitens: string | null; sub_chave: string | null; grupo: string | null; grupo_chave: string | null } : null;
  return { dados, erro, oficial, ...finais };
}

export type Acoes = Omit<ReturnType<typeof useQuadro>, 'dados' | 'erro'>;
export { porPosicao };
