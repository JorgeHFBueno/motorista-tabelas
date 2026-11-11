import Autocomplete from '@mui/material/Autocomplete';
import Popover from '@mui/material/Popover';
import TextField from '@mui/material/TextField';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditOutlined from '@mui/icons-material/EditOutlined';
import { useEffect, useState } from 'react';
import type { CivilDate } from '../domain/models';
import {
  COR_SEM_STATUS, CORES_ETIQUETA, MAX_ETIQUETAS, etiquetasLimpas, novoIdEtiqueta, statusExibido, textoEscuro,
  type EtiquetaStatus,
} from '../domain/status';

export interface Opcao { id: string; nome: string; /** Texto menor ao lado do nome na lista (ex.: a função desejada). */ detalhe?: string }

/** Texto que grava ao sair do campo ou no Enter; Esc desfaz. */
export function CampoTexto({ valor, onSalvar, placeholder, obrigatorio = false, maximo, className = '' }: {
  valor: string;
  onSalvar: (valor: string) => void;
  placeholder?: string;
  obrigatorio?: boolean;
  maximo: number;
  className?: string;
}) {
  const [rascunho, setRascunho] = useState(valor);
  useEffect(() => setRascunho(valor), [valor]);
  const salvar = () => {
    const limpo = rascunho.trim();
    if (limpo === valor) return;
    if (obrigatorio && !limpo) { setRascunho(valor); return; }
    onSalvar(limpo);
  };
  return (
    <input
      className={`lg-input ${className}`}
      value={rascunho}
      maxLength={maximo}
      placeholder={placeholder}
      onChange={(event) => setRascunho(event.target.value)}
      onBlur={salvar}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') { setRascunho(valor); event.currentTarget.blur(); }
      }}
    />
  );
}

/** De/até; o "até" não aceita data antes do "de". */
export function CampoPeriodo({ inicio, fim, onSalvar }: {
  inicio: CivilDate | null;
  fim: CivilDate | null;
  onSalvar: (periodo: { inicio: CivilDate | null; fim: CivilDate | null }) => void;
}) {
  return (
    <span className="lg-periodo">
      <input
        type="date"
        className="lg-input lg-data"
        aria-label="De"
        value={inicio ?? ''}
        onChange={(event) => {
          const novo = event.target.value || null;
          onSalvar({ inicio: novo, fim: novo && fim && fim < novo ? novo : fim });
        }}
      />
      <span className="lg-ate">a</span>
      <input
        type="date"
        className="lg-input lg-data"
        aria-label="Até"
        value={fim ?? ''}
        min={inicio ?? undefined}
        onChange={(event) => {
          const novo = event.target.value || null;
          onSalvar({ inicio: novo && inicio && novo < inicio ? novo : inicio, fim: novo });
        }}
      />
    </span>
  );
}

const semAcento = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

/** Escolha num cadastro, com busca. O valor atual entra nas opções mesmo que tenha saído do cadastro. */
export function CampoEscolha({ valor, opcoes, onSalvar, rotulo }: {
  valor: Opcao | null;
  opcoes: readonly Opcao[];
  onSalvar: (valor: Opcao | null) => void;
  rotulo: string;
}) {
  const lista = valor && !opcoes.some((opcao) => opcao.id === valor.id) ? [valor, ...opcoes] : opcoes;
  return (
    <Autocomplete
      size="small"
      className="lg-escolha"
      options={lista}
      value={valor}
      getOptionLabel={(opcao) => opcao.nome}
      isOptionEqualToValue={(opcao, atual) => opcao.id === atual.id}
      filterOptions={(lista, { inputValue }) => {
        const busca = semAcento(inputValue);
        return busca ? lista.filter((opcao) => semAcento(`${opcao.nome} ${opcao.detalhe ?? ''}`).includes(busca)) : lista;
      }}
      renderOption={({ key, ...props }, opcao) => (
        <li key={key} {...props}>
          <span className="lg-opcao"><span>{opcao.nome}</span>{opcao.detalhe && <small>{opcao.detalhe}</small>}</span>
        </li>
      )}
      onChange={(_event, novo) => onSalvar(novo)}
      noOptionsText="Nada encontrado"
      renderInput={(params) => (
        <TextField
          {...params}
          variant="standard"
          placeholder="—"
          slotProps={{ input: { ...params.InputProps, disableUnderline: true }, htmlInput: { ...params.inputProps, 'aria-label': rotulo } }}
        />
      )}
    />
  );
}

/** Vários itens de um cadastro (os veículos), sem repetir, até `maximo`. Os que saíram do cadastro continuam visíveis. */
export function CampoEscolhaVarios({ valores, opcoes, onSalvar, rotulo, maximo }: {
  valores: readonly Opcao[];
  opcoes: readonly Opcao[];
  onSalvar: (valores: Opcao[]) => void;
  rotulo: string;
  maximo: number;
}) {
  const fora = valores.filter((valor) => !opcoes.some((opcao) => opcao.id === valor.id));
  const cheio = valores.length >= maximo;
  return (
    <Autocomplete
      multiple
      size="small"
      className="lg-escolha lg-escolha-varios"
      options={[...fora, ...opcoes]}
      value={[...valores]}
      disableCloseOnSelect
      filterSelectedOptions
      getOptionLabel={(opcao) => opcao.nome}
      getOptionDisabled={() => cheio}
      isOptionEqualToValue={(opcao, atual) => opcao.id === atual.id}
      onChange={(_event, novos) => onSalvar(novos.slice(0, maximo))}
      noOptionsText={cheio ? `No máximo ${maximo}` : 'Nada encontrado'}
      renderValue={(selecionados, getItemProps) => selecionados.map((opcao, indice) => {
        const { key, onDelete } = getItemProps({ index: indice });
        return (
          <span key={key} className="lg-etiqueta-cadastro" title={opcao.nome}>
            <span>{opcao.nome}</span>
            <button type="button" aria-label={`Tirar ${opcao.nome}`} onClick={onDelete} tabIndex={-1}>×</button>
          </span>
        );
      })}
      renderInput={(params) => (
        <TextField
          {...params}
          variant="standard"
          placeholder={valores.length ? '' : '—'}
          slotProps={{ input: { ...params.InputProps, disableUnderline: true }, htmlInput: { ...params.inputProps, 'aria-label': rotulo } }}
        />
      )}
    />
  );
}

/** Nome, cor e exclusão de cada etiqueta, e "Nova etiqueta" (o editor de rótulos do Friday). Só grava no Aplicar. */
function EditorEtiquetas({ etiquetas, onAplicar, onCancelar }: {
  etiquetas: readonly EtiquetaStatus[];
  onAplicar: (etiquetas: EtiquetaStatus[]) => void;
  onCancelar: () => void;
}) {
  const [lista, setLista] = useState<EtiquetaStatus[]>(() => etiquetas.map((etiqueta) => ({ ...etiqueta })));
  const [paleta, setPaleta] = useState<string | null>(null);
  const mudar = (id: string, campos: Partial<EtiquetaStatus>) => setLista((atual) => atual.map((item) => (item.id === id ? { ...item, ...campos } : item)));
  const nomes = lista.map((item) => item.nome.trim().toLocaleLowerCase('pt-BR'));
  const repetido = nomes.some((nome, indice) => nome && nomes.indexOf(nome) !== indice);
  const vazio = nomes.some((nome) => !nome);
  return (
    <div className="lg-etiquetas-editor">
      {lista.map((etiqueta) => (
        <div key={etiqueta.id} className="lg-etiquetas-linha">
          <button type="button" className="lg-etiquetas-cor" style={{ background: etiqueta.cor }} aria-label={`Cor de ${etiqueta.nome || 'etiqueta'}`} onClick={() => setPaleta(paleta === etiqueta.id ? null : etiqueta.id)} />
          <input value={etiqueta.nome} maxLength={60} placeholder="Nome da etiqueta" aria-label="Nome da etiqueta" onChange={(event) => mudar(etiqueta.id, { nome: event.target.value })} />
          <button type="button" className="lg-btn-icone" aria-label={`Excluir ${etiqueta.nome || 'etiqueta'}`} title="Excluir etiqueta" onClick={() => setLista((atual) => atual.filter((item) => item.id !== etiqueta.id))}>
            <DeleteOutlineRounded fontSize="small" />
          </button>
          {paleta === etiqueta.id && (
            <div className="lg-etiquetas-paleta">
              {CORES_ETIQUETA.map((cor) => (
                <button key={cor} type="button" style={{ background: cor }} aria-label={cor} onClick={() => { mudar(etiqueta.id, { cor }); setPaleta(null); }} />
              ))}
            </div>
          )}
        </div>
      ))}
      <button
        type="button"
        className="lg-etiquetas-nova"
        disabled={lista.length >= MAX_ETIQUETAS}
        onClick={() => setLista((atual) => [...atual, { id: novoIdEtiqueta(atual), nome: 'Nova etiqueta', cor: CORES_ETIQUETA[(atual.length * 7) % CORES_ETIQUETA.length] }])}
      >
        <AddRounded fontSize="small" /> Nova etiqueta
      </button>
      <small className="lg-etiquetas-dica">
        {repetido ? 'Há nomes repetidos.' : vazio ? 'Toda etiqueta precisa de nome.' : 'A linha com uma etiqueta excluída fica sem status.'}
      </small>
      <div className="lg-etiquetas-acoes">
        <button type="button" className="lg-btn" onClick={onCancelar}>Cancelar</button>
        <button type="button" className="lg-btn lg-btn-primario" disabled={repetido || vazio} onClick={() => onAplicar(etiquetasLimpas(lista))}>Aplicar</button>
      </div>
    </div>
  );
}

/**
 * Etiqueta colorida do status; o clique abre a grade de etiquetas (como no Monday e no Friday), com "Editar
 * etiquetas" para renomear, mudar a cor, excluir ou criar.
 */
export function CampoStatus({ valor, etiquetas, onSalvar, onSalvarEtiquetas, grande = false }: {
  valor: string;
  etiquetas: readonly EtiquetaStatus[];
  onSalvar: (valor: string) => void;
  onSalvarEtiquetas: (etiquetas: EtiquetaStatus[]) => void;
  grande?: boolean;
}) {
  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  const [editando, setEditando] = useState(false);
  const atual = statusExibido(valor, etiquetas);
  const fechar = () => { setAncora(null); setEditando(false); };
  const escolher = (novo: string) => { fechar(); if (novo !== valor) onSalvar(novo); };
  return (
    <>
      <button
        type="button"
        className={`lg-status${grande ? ' lg-status-grande' : ''}${textoEscuro(atual.cor) ? ' is-escuro' : ''}`}
        style={{ background: atual.cor }}
        onClick={(event) => setAncora(event.currentTarget)}
        aria-label={`Status: ${atual.nome || 'sem status'}`}
        aria-haspopup="dialog"
      >
        {atual.nome}
      </button>
      <Popover
        open={ancora !== null}
        anchorEl={ancora}
        onClose={fechar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        slotProps={{ paper: { className: 'lg-status-menu' } }}
      >
        {editando ? (
          <EditorEtiquetas etiquetas={etiquetas} onCancelar={() => setEditando(false)} onAplicar={(lista) => { onSalvarEtiquetas(lista); setEditando(false); }} />
        ) : (
          <>
            <div className="lg-status-grade" role="listbox" aria-label="Status">
              {etiquetas.map((etiqueta) => (
                <button
                  key={etiqueta.id}
                  type="button"
                  role="option"
                  aria-selected={etiqueta.id === atual.etiqueta?.id}
                  className={`lg-status${textoEscuro(etiqueta.cor) ? ' is-escuro' : ''}${etiqueta.id === atual.etiqueta?.id ? ' is-atual' : ''}`}
                  style={{ background: etiqueta.cor }}
                  onClick={() => escolher(etiqueta.id)}
                >
                  {etiqueta.nome}
                </button>
              ))}
              <button
                type="button"
                role="option"
                aria-selected={valor === ''}
                className={`lg-status${valor === '' ? ' is-atual' : ''}`}
                style={{ background: COR_SEM_STATUS }}
                onClick={() => escolher('')}
                aria-label="Sem status"
                title="Sem status"
              />
            </div>
            <button type="button" className="lg-status-editar" onClick={() => setEditando(true)}>
              <EditOutlined fontSize="small" /> Editar etiquetas
            </button>
          </>
        )}
      </Popover>
    </>
  );
}
