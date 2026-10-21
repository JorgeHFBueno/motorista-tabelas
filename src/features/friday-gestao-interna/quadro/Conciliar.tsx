import { useEffect, useState } from 'react';
import { conciliarCadastro } from '../api.ts';
import { useNavigate } from '../rotas.tsx';
import { Modal } from '../ui/base.tsx';
import type { Coluna } from './tipos.ts';
import { COMPATIVEIS, NOME, NOME_PREFIXO, type Cadastro } from './conciliacao.ts';

// Cadastros oficiais, modo "existente" (C5): liga o quadro a uma coleção que já existe no sistema (ex.: veiculos-v2).
// Este diálogo escolhe o cadastro e a chave; "Analisar" abre a página da conciliação (paginas/Conciliacao.tsx), com a
// análise dos itens (parte 1), a ligação das colunas aos campos (parte 2), a simulação e a conciliação.
// Contrato: The Manuscript, 03_APLICACAO_WEB/14_FRIDAY_CADASTROS_OFICIAIS.md.

export function Conciliar({ quadroId, colunas, onFechar }: { quadroId: number; colunas: Coluna[]; onFechar: () => void }) {
  const navigate = useNavigate();
  const [catalogo, setCatalogo] = useState<Cadastro[]>([]);
  const [colecao, setColecao] = useState('');
  const cadastro = catalogo.find(c => c.colecao === colecao);
  // "começa com" atende quadros do monday cujo nome junta placa e modelo ("JBJ-4J22 Mercedez Atego").
  const [colunaChave, setColunaChave] = useState<string>(NOME_PREFIXO);
  const [caminhoChave, setCaminhoChave] = useState('');
  const [erro, setErro] = useState('');

  useEffect(() => {
    conciliarCadastro({ op: 'catalogo' }).then(r => {
      const lista = (r.cadastros ?? []) as Cadastro[];
      setCatalogo(lista);
      if (lista.length === 1) setColecao(lista[0].colecao);
    }).catch(e => setErro((e as Error).message));
  }, []);
  useEffect(() => { if (cadastro && !caminhoChave) setCaminhoChave(cadastro.chaves[0]); }, [cadastro, caminhoChave]);

  const analisar = () => navigate(`/quadros/${quadroId}/conciliar?${new URLSearchParams({ colecao, chave: colunaChave, campo: caminhoChave })}`);

  return (
    <Modal titulo="Conciliar com um cadastro existente" largura={620} onClose={onFechar}
      rodape={<div className="form-acoes">
        <button type="button" className="fr-btn" onClick={onFechar}>Cancelar</button>
        <button className="fr-btn btn-primario" disabled={!cadastro || !caminhoChave} onClick={analisar}>Analisar</button>
      </div>}>
      <p className="muted fr-small">
        Os itens do quadro são casados com os registros que já existem pela chave (sem diferença de maiúsculas, espaços e traços).
        “Analisar” abre a página da conciliação, onde você confere os itens e liga as colunas aos campos. Nada é gravado até conciliar.
      </p>
      <div className="conc-linha">
        <label className="campo-form">Cadastro
          <select className="input-cheio" value={colecao} onChange={e => { setColecao(e.target.value); setCaminhoChave(''); }}>
            <option value="">Escolha…</option>
            {catalogo.map(c => <option key={c.colecao} value={c.colecao}>{c.nome} ({c.colecao})</option>)}
          </select>
        </label>
        <label className="campo-form">Chave no quadro
          <select className="input-cheio" value={colunaChave} onChange={e => setColunaChave(e.target.value)}>
            <option value={NOME_PREFIXO}>Nome do item começa com a chave</option>
            <option value={NOME}>Nome do item (igual)</option>
            {colunas.filter(c => COMPATIVEIS.texto.includes(c.tipo)).map(c => <option key={c.id} value={c.id}>{c.titulo}</option>)}
          </select>
        </label>
        <label className="campo-form">Campo-chave do cadastro
          <select className="input-cheio" value={caminhoChave} disabled={!cadastro} onChange={e => setCaminhoChave(e.target.value)}>
            {(cadastro?.chaves ?? []).map(k => <option key={k} value={k}>{cadastro?.campos.find(c => c.caminho === k)?.titulo ?? k}</option>)}
          </select>
        </label>
      </div>
      {cadastro && <p className="muted fr-small">{cadastro.descricao}{!cadastro.liberado && <> <strong>Só simulação:</strong> a conciliação com este cadastro ainda não está liberada.</>}</p>}
      {erro && <p className="aviso-erro">{erro}</p>}
    </Modal>
  );
}
