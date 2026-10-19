import { useMemo, useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { req, type Row } from '../api.ts';
import { Modal } from '../ui/base.tsx';
import { CORES, fmtData, hojeISO } from '../util.ts';
import { lerPlanilhas, type Bruto, type Planilha } from './excel.ts';
import { infoTipo, type Coluna, type Grupo, type Rotulo, type Sub, type TipoColuna } from './tipos.ts';
import type { Acoes } from './useQuadro.ts';

// Tipos que dá para preencher a partir de uma planilha (fórmula, arquivos e ligações não).
const NAO_IMPORTA = new Set(['formula', 'arquivos', 'ligacao']);
const TIPOS_NOVOS: TipoColuna[] = ['texto', 'numero', 'data', 'periodo', 'status', 'lista', 'pessoa', 'texto_longo', 'telefone', 'email', 'link', 'caixa'];
const LOTE = 400;

const normal = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const pad = (n: number | string) => String(n).padStart(2, '0');
const vazio = (v: Bruto) => v === '' || v == null;
const textoDe = (v: Bruto): string => (v instanceof Date ? paraISO(v) ?? '' : typeof v === 'object' && v ? v.texto || v.url : String(v)).trim();

function paraISO(v: Bruto): string | null {
  if (v instanceof Date) return Number.isNaN(+v) ? null : `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === 'number' && v > 20000 && v < 80000) return paraISO(new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000));
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return null;
}
function paraNumero(v: Bruto): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[R$\s%]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function adivinharTipo(vals: Bruto[]): TipoColuna {
  const ok = vals.filter(v => !vazio(v));
  if (!ok.length) return 'texto';
  if (ok.every(v => v instanceof Date || (typeof v === 'string' && paraISO(v)))) return 'data';
  if (ok.every(v => typeof v === 'number' || (typeof v === 'string' && /^[R$\s]*-?[\d.]+(,\d+)?%?$/.test(v.trim())))) return 'numero';
  if (ok.every(v => typeof v === 'object' && v && 'url' in v)) return 'link';
  const distintos = new Set(ok.map(v => normal(textoDe(v))));
  if (ok.length >= 6 && distintos.size <= 8 && distintos.size <= ok.length / 2) return 'status';
  return 'texto';
}
const novoId = (lista: Rotulo[]) => String(Math.max(0, ...lista.map(r => Number(r.id) || 0)) + 1);

type Avisos = { pessoas: Set<string> };
// Converte o valor da planilha para o formato da coluna. Rótulos e opções que não existem são criados em "config".
function converter(tipo: string, config: Record<string, any>, v: Bruto, usuarios: Row[], avisos: Avisos): unknown {
  if (vazio(v)) return undefined;
  const t = textoDe(v);
  switch (tipo) {
    case 'numero': case 'avaliacao': return paraNumero(v) ?? undefined;
    case 'data': return paraISO(v) ?? undefined;
    case 'periodo': {
      if (v instanceof Date) { const d = paraISO(v); return d ? { inicio: d, fim: d } : undefined; }
      const ds = (String(v).match(/\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4}/g) ?? []).map(x => paraISO(x)).filter(Boolean) as string[];
      return ds.length ? { inicio: ds[0], fim: ds.at(-1) } : undefined;
    }
    case 'caixa': return v === true || /^(sim|s|x|1|true|verdadeiro|v|ok|✓|✔|marcado|yes|checked)$/i.test(t) ? true : undefined;
    case 'link': return typeof v === 'object' && !(v instanceof Date) && v ? { url: v.url, texto: v.texto && v.texto !== v.url ? v.texto : undefined } : { url: t };
    case 'status': {
      config.rotulos ??= [];
      const rs = config.rotulos as Rotulo[];
      let r = rs.find(x => normal(x.texto) === normal(t));
      // Rótulo novo entra antes do rótulo vazio ("0"), que fica sempre por último.
      if (!r) { r = { id: novoId(rs), texto: t, cor: CORES[(rs.length * 3 + 1) % 17] }; const k = rs.findIndex(x => x.id === '0'); rs.splice(k < 0 ? rs.length : k, 0, r); }
      return r.id === '0' ? undefined : r.id;
    }
    case 'lista': {
      config.opcoes ??= [];
      const os = config.opcoes as Rotulo[];
      return t.split(/[,;]/).map(x => x.trim()).filter(Boolean).map(x => {
        let o = os.find(y => normal(y.texto) === normal(x));
        if (!o) { o = { id: novoId(os), texto: x, cor: '#c4c4c4' }; os.push(o); }
        return o.id;
      });
    }
    case 'pessoa': {
      const ids = t.split(/[,;]/).map(x => x.trim()).filter(Boolean).map(nome => {
        const n = normal(nome);
        const u = usuarios.find(x => normal(x.nome) === n) ?? usuarios.find(x => normal(x.nome).startsWith(n) || n.startsWith(normal(x.nome)));
        if (!u) avisos.pessoas.add(nome);
        return u?.id as number | undefined;
      }).filter((x): x is number => x != null);
      return ids.length ? [...new Set(ids)] : undefined;
    }
    default: return t || undefined;
  }
}

// Importar itens de uma planilha: escolher a aba, dizer para onde vai cada coluna e enviar.
export function ImportarExcel({ quadroId, nomeItem, colunas, grupos, sub, acoes, usuarios, onFechar }: {
  quadroId: number; nomeItem: string; colunas: Coluna[]; grupos: Grupo[]; sub: Sub | null; acoes: Acoes; usuarios: Row[]; onFechar: () => void;
}) {
  const [planilhas, setPlanilhas] = useState<Planilha[] | null>(null);
  const [arquivo, setArquivo] = useState('');
  const [aba, setAba] = useState(0);
  const [destinos, setDestinos] = useState<string[]>([]);
  const [grupoDestino, setGrupoDestino] = useState('');
  const [comSubitens, setComSubitens] = useState(true);
  const [fase, setFase] = useState<'escolher' | 'mapear' | 'enviando' | 'pronto'>('escolher');
  const [progresso, setProgresso] = useState('');
  const [resultado, setResultado] = useState('');
  const [erro, setErro] = useState('');
  const [arrastando, setArrastando] = useState(false);

  const importaveis = colunas.filter(c => !NAO_IMPORTA.has(c.tipo));
  const p = planilhas?.[aba];
  const abaSub = planilhas?.find((x, k) => k !== aba && normal(x.nome) === 'subitens' && x.cabecalho.some(h => normal(h) === 'item pai'));
  const temGruposPlanilha = !!p?.linhas.some(l => l.grupo);
  const nomeNovoGrupo = `Importados ${fmtData(hojeISO())}`;

  const mapearAuto = (pl: Planilha) => {
    const usados = new Set<string>();
    const d = pl.cabecalho.map((h, k) => {
      const n = normal(h);
      if (!usados.has('nome') && ['nome', 'name', 'item', 'titulo', 'tarefa', normal(nomeItem)].includes(n)) { usados.add('nome'); return 'nome'; }
      if (!usados.has('grupo') && ['grupo', 'group'].includes(n)) { usados.add('grupo'); return 'grupo'; }
      const c = importaveis.find(x => normal(x.titulo) === n && !usados.has(`col:${x.id}`));
      if (c) { usados.add(`col:${c.id}`); return `col:${c.id}`; }
      if (['subitems', 'subitens', 'item id', 'id do item', 'id'].includes(n)) return 'ignorar';
      return `novo:${adivinharTipo(pl.linhas.slice(0, 200).map(l => l.valores[k]))}`;
    });
    if (!d.includes('nome') && d.length) d[0] = 'nome';
    setDestinos(d);
    setGrupoDestino(pl.linhas.some(l => l.grupo) ? 'planilha' : 'novo');
  };

  const abrir = async (f?: File | null) => {
    if (!f) return;
    setErro('');
    if (!/\.xlsx$/i.test(f.name)) { setErro('Use um arquivo .xlsx (Excel). Arquivos .xls antigos ou .csv: abra no Excel e salve como .xlsx.'); return; }
    try {
      const ps = (await lerPlanilhas(f)).filter(x => x.linhas.length || x.cabecalho.length);
      if (!ps.length) { setErro('A planilha está vazia.'); return; }
      const k = Math.max(0, ps.findIndex(x => normal(x.nome) !== 'subitens'));
      setPlanilhas(ps); setArquivo(f.name); setAba(k); mapearAuto(ps[k]); setFase('mapear');
    } catch (e) { setErro(`Não foi possível ler a planilha: ${(e as Error).message}`); }
  };

  const exemplo = (k: number) => { const v = p?.linhas.find(l => !vazio(l.valores[k]))?.valores[k]; return v == null || v === '' ? '' : textoDe(v); };
  const linhasValidas = useMemo(() => {
    const kn = destinos.indexOf('nome');
    return (p?.linhas ?? []).filter(l => kn >= 0 && !vazio(l.valores[kn]));
  }, [p, destinos]);

  const importar = async () => {
    if (!p) return;
    setFase('enviando');
    try {
      const avisos: Avisos = { pessoas: new Set() };
      // 1) colunas novas; cada coluna de destino com uma cópia da configuração (para rótulos novos)
      const alvo = new Map<number, { c: Coluna; config: Record<string, any>; original: string }>();
      for (let k = 0; k < destinos.length; k++) {
        const d = destinos[k];
        let c: Coluna | undefined;
        if (d.startsWith('novo:')) { setProgresso(`Criando a coluna “${p.cabecalho[k]}”…`); c = await acoes.criarColuna(d.slice(5) as TipoColuna, p.cabecalho[k]); }
        else if (d.startsWith('col:')) c = colunas.find(x => x.id === Number(d.slice(4)));
        if (c) alvo.set(k, { c, config: structuredClone(c.config ?? {}), original: JSON.stringify(c.config ?? {}) });
      }
      // 2) itens
      const kn = destinos.indexOf('nome'), kg = destinos.indexOf('grupo');
      const itens = linhasValidas.map(l => {
        const valores: Record<string, unknown> = {};
        for (const [k, a] of alvo) { const v = converter(a.c.tipo, a.config, l.valores[k], usuarios, avisos); if (v !== undefined) valores[a.c.id] = v; }
        const gPlanilha = kg >= 0 ? textoDe(l.valores[kg]) : '';
        const destino = gPlanilha
          ? { grupo_nome: gPlanilha }
          : grupoDestino === 'planilha' ? { grupo_nome: l.grupo || nomeNovoGrupo }
          : grupoDestino === 'novo' || !grupoDestino ? { grupo_nome: nomeNovoGrupo } : { grupo_id: Number(grupoDestino) };
        return { ...destino, nome: textoDe(l.valores[kn]).slice(0, 500), valores, subitens: [] as { nome: string; valores: Record<string, unknown> }[] };
      });
      // 3) aba "Subitens" (como a exportada pelo app): liga pelo nome do item pai, colunas pelo título
      let nSub = 0;
      if (abaSub && comSubitens) {
        let colsSub = sub?.colunas ?? [];
        if (!sub) colsSub = ((await req<Row>('POST', `quadros/${quadroId}/subitens`)).colunas ?? []) as Coluna[];
        const kp = abaSub.cabecalho.findIndex(h => normal(h) === 'item pai');
        const ks = abaSub.cabecalho.findIndex(h => normal(h) === 'subitem');
        const porNome = new Map<string, (typeof itens)[number]>();
        for (const it of itens) if (!porNome.has(normal(it.nome))) porNome.set(normal(it.nome), it);
        const alvoSub = new Map<number, { c: Coluna; config: Record<string, any>; original: string }>();
        abaSub.cabecalho.forEach((h, k) => {
          const c = colsSub.find(x => !NAO_IMPORTA.has(x.tipo) && normal(x.titulo) === normal(h));
          if (c && k !== kp && k !== ks) alvoSub.set(k, { c, config: structuredClone(c.config ?? {}), original: JSON.stringify(c.config ?? {}) });
        });
        for (const l of abaSub.linhas) {
          const pai = porNome.get(normal(textoDe(l.valores[kp])));
          const nome = ks >= 0 ? textoDe(l.valores[ks]) : '';
          if (!pai || !nome) continue;
          const valores: Record<string, unknown> = {};
          for (const [k, a] of alvoSub) { const v = converter(a.c.tipo, a.config, l.valores[k], usuarios, avisos); if (v !== undefined) valores[a.c.id] = v; }
          pai.subitens.push({ nome: nome.slice(0, 500), valores });
          nSub++;
        }
        for (const [k, a] of alvoSub) alvo.set(-1 - k, a);
      }
      // 4) grava rótulos e opções novos antes dos itens que os usam
      for (const a of alvo.values()) if (JSON.stringify(a.config) !== a.original) await acoes.atualizarColuna(a.c.id, { config: a.config });
      // 5) envia em lotes
      let criados = 0;
      for (let k = 0; k < itens.length; k += LOTE) {
        setProgresso(`Enviando ${Math.min(k + LOTE, itens.length)} de ${itens.length}…`);
        const r = await req<{ criados: number }>('POST', `quadros/${quadroId}/importar`, { itens: itens.slice(k, k + LOTE) });
        criados += r.criados;
      }
      await acoes.recarregar();
      const extra = avisos.pessoas.size ? ` Pessoas não encontradas (ficaram em branco): ${[...avisos.pessoas].slice(0, 8).join(', ')}${avisos.pessoas.size > 8 ? '…' : ''}.` : '';
      setResultado(`${criados} ${criados === 1 ? 'item importado' : 'itens importados'}${nSub ? ` e ${nSub} subitens` : ''}.${extra}`);
      setFase('pronto');
    } catch (e) {
      setErro(`A importação parou: ${(e as Error).message}. O que já foi enviado continua no quadro.`);
      await acoes.recarregar();
      setFase('mapear');
    }
  };

  return (
    <Modal titulo={<><FileSpreadsheet size={18} /> Importar do Excel</>} largura={860} onClose={fase === 'enviando' ? () => {} : onFechar}
      rodape={fase === 'mapear' ? (
        <>
          <span className="muted fr-small espaco">{linhasValidas.length} {linhasValidas.length === 1 ? 'linha' : 'linhas'} com nome{p && p.linhas.length > linhasValidas.length ? ` (${p.linhas.length - linhasValidas.length} sem nome serão ignoradas)` : ''}</span>
          <button className="fr-btn" onClick={onFechar}>Cancelar</button>
          <button className="fr-btn btn-primario" disabled={!linhasValidas.length} onClick={importar}>Importar {linhasValidas.length} {linhasValidas.length === 1 ? nomeItem.toLowerCase() : 'itens'}</button>
        </>
      ) : fase === 'pronto' ? <button className="fr-btn btn-primario" onClick={onFechar}>Fechar</button> : undefined}>
      {erro && <p className="aviso-erro">{erro}</p>}
      {fase === 'escolher' && (
        <label className={`importar-zona${arrastando ? ' arrastando' : ''}`}
          onDragOver={e => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)}
          onDrop={e => { e.preventDefault(); setArrastando(false); abrir(e.dataTransfer.files[0]); }}>
          <Upload size={28} />
          <strong>Escolha ou arraste uma planilha .xlsx</strong>
          <span className="muted fr-small">A primeira linha com títulos vira o cabeçalho. Cada linha vira um {nomeItem.toLowerCase()}; nada no quadro é apagado.</span>
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={e => abrir(e.target.files?.[0])} />
        </label>
      )}
      {fase === 'mapear' && p && planilhas && (
        <div className="importar">
          <div className="importar-topo">
            <span><FileSpreadsheet size={15} /> {arquivo}</span>
            {planilhas.length > 1 && (
              <label>Aba
                <select value={aba} onChange={e => { const k = Number(e.target.value); setAba(k); mapearAuto(planilhas[k]); }}>
                  {planilhas.map((x, k) => <option key={k} value={k}>{x.nome} ({x.linhas.length} linhas)</option>)}
                </select>
              </label>
            )}
            {!destinos.includes('grupo') && (
              <label>Grupo de destino
                <select value={grupoDestino} onChange={e => setGrupoDestino(e.target.value)}>
                  {temGruposPlanilha && <option value="planilha">Grupos da planilha (criados se não existirem)</option>}
                  <option value="novo">Novo grupo “{nomeNovoGrupo}”</option>
                  {grupos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
                </select>
              </label>
            )}
          </div>
          <table className="importar-mapa">
            <thead><tr><th>Coluna da planilha</th><th>Exemplo</th><th>Vai para</th></tr></thead>
            <tbody>
              {p.cabecalho.map((h, k) => (
                <tr key={k} className={destinos[k] === 'ignorar' ? 'ignorada' : ''}>
                  <td><strong>{h}</strong></td>
                  <td className="muted" title={exemplo(k)}>{exemplo(k) || '—'}</td>
                  <td>
                    <select value={destinos[k]} onChange={e => setDestinos(d => d.map((x, j) => (j === k ? e.target.value : x === e.target.value && ['nome', 'grupo'].includes(x) ? 'ignorar' : x)))}>
                      <option value="ignorar">Não importar</option>
                      <option value="nome">Nome do {nomeItem.toLowerCase()}</option>
                      <option value="grupo">Grupo</option>
                      <optgroup label="Colunas do quadro">
                        {importaveis.map(c => <option key={c.id} value={`col:${c.id}`}>{c.titulo} ({infoTipo(c.tipo).rotulo.toLowerCase()})</option>)}
                      </optgroup>
                      <optgroup label="Criar coluna nova">
                        {TIPOS_NOVOS.map(t => <option key={t} value={`novo:${t}`}>Nova coluna: {infoTipo(t).rotulo}</option>)}
                      </optgroup>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {abaSub && (
            <label className="check-form"><input type="checkbox" className="caixa" checked={comSubitens} onChange={e => setComSubitens(e.target.checked)} />
              Importar também a aba “{abaSub.nome}” ({abaSub.linhas.length} subitens, ligados pelo nome do item pai)</label>
          )}
          <p className="muted fr-small">Status e listas: rótulos que não existem são criados. Pessoas são encontradas pelo nome. Datas aceitam 17/10/2026 ou 2026-10-17.</p>
        </div>
      )}
      {fase === 'enviando' && <div className="importar-status"><span className="girando" /> {progresso || 'Importando…'}</div>}
      {fase === 'pronto' && <div className="importar-status ok">{resultado}</div>}
    </Modal>
  );
}
