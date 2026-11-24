import { useContext, useEffect, useState } from 'react';
import { EyeOff } from 'lucide-react';
import { listar, restringirColuna } from '../api.ts';
import { Modal } from '../ui/base.tsx';
import { ColaboradoresDoQuadro } from './colaboradores.ts';
import { entradasLivres, TIPOS_RESTRINGIVEIS } from './restritas.ts';
import type { Coluna } from './tipos.ts';

// "Coluna restrita…" (só adm2): quem está marcado (e os adm2) vê e edita a coluna; para os demais ela não existe,
// nem na API. Ligar tira os valores dos itens e guarda à parte; desligar devolve. Regras em restritas.ts.
export function ColunaRestritaDialogo({ coluna, onFechar, onPronto }: { coluna: Coluna; onFechar: () => void; onPronto: () => void }) {
  const pessoas = (useContext(ColaboradoresDoQuadro) ?? []).slice().sort((a, b) => a.nome.localeCompare(b.nome));
  const [ver, setVer] = useState<string[]>(((coluna.restrita as { ver?: string[] } | undefined)?.ver ?? []).slice());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const restrita = !!coluna.restrita;
  const podeTipo = TIPOS_RESTRINGIVEIS.has(coluna.tipo);
  // Fórmula: avisa quando usa colunas livres (quem as vê consegue chegar ao resultado).
  const [livres, setLivres] = useState<string[]>([]);
  useEffect(() => {
    if (coluna.tipo !== 'formula') return;
    listar('colunas', { quadro_id: coluna.quadro_id }).then(cs => setLivres(entradasLivres(coluna as never, cs as never[]).map(c => String((c as unknown as Coluna).titulo)))).catch(() => undefined);
  }, [coluna]);
  const salvar = async (lista: string[] | null) => {
    setSalvando(true); setErro(null);
    try { await restringirColuna(coluna.id, lista); onPronto(); } catch (e) { setErro((e as Error).message); } finally { setSalvando(false); }
  };
  const alternar = (uid: string) => setVer(v => (v.includes(uid) ? v.filter(x => x !== uid) : [...v, uid]));
  return (
    <Modal titulo={<><EyeOff size={18} /> Coluna restrita: {coluna.titulo}</>} onClose={onFechar} largura={500} rodape={
      <>
        {restrita && <button className="fr-btn" disabled={salvando} onClick={() => salvar(null)} style={{ marginRight: 'auto' }}>Tirar a restrição</button>}
        <button className="fr-btn" onClick={onFechar} disabled={salvando}>Cancelar</button>
        <button className="fr-btn btn-primario" disabled={salvando || !podeTipo} onClick={() => salvar(ver)}>{salvando ? 'Salvando…' : restrita ? 'Salvar' : 'Restringir'}</button>
      </>
    }>
      <p className="muted">Só as pessoas marcadas e os adm2 veem e editam esta coluna. Para os demais ela não aparece: nem no quadro, nem no painel do item, no Excel ou na API. Os valores saem dos itens e ficam guardados à parte; o histórico registra que houve mudança, sem os valores.</p>
      {!podeTipo && <p className="aviso-erro">Colunas deste tipo (tempo, pessoa, arquivos ou conexão) ainda não podem ser restritas.</p>}
      {coluna.tipo === 'formula' && <p className="muted">Fórmula não guarda valor: restringir só a esconde de quem não está na lista. Ela também some para quem não vê uma coluna restrita que ela usa.</p>}
      {livres.length > 0 && <p className="aviso-erro">Esta fórmula usa colunas que não são restritas ({livres.join(', ')}): quem as vê consegue calcular o resultado por conta própria. Para proteger de verdade, restrinja também essas colunas.</p>}
      {erro && <p className="aviso-erro">{erro}</p>}
      <div className="cr-lista">
        {pessoas.map(p => (
          <label key={p.id} className="cr-pessoa">
            <input type="checkbox" className="caixa" checked={p.adm2 || ver.includes(p.id)} disabled={p.adm2 || salvando} onChange={() => alternar(p.id)} />
            <span>{p.nome}</span>
            {p.adm2 && <small className="muted">adm2, sempre vê</small>}
          </label>
        ))}
        {!pessoas.length && <span className="muted">Ninguém além dos adm2 tem acesso a este quadro.</span>}
      </div>
    </Modal>
  );
}
