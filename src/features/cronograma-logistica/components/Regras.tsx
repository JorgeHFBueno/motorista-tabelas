import BoltRounded from '@mui/icons-material/BoltRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import Popover from '@mui/material/Popover';
import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PapeisAvisos } from '../data/logisticaFirestore';
import { REGRAS, regraAtiva, type Trecho } from '../domain/automacoes';
import { linkDoQuadro, ORIGENS, PREENCHIDAS_NA_CELULA } from '../domain/origens';
import { COR_SEM_STATUS, mesmoNome, textoEscuro, type EtiquetaStatus } from '../domain/status';

type Aba = 'regras' | 'colunas';

/** Um trecho da regra: coluna sublinhada, status com a cor da etiqueta, aviso em itálico. */
function TrechoRegra({ trecho, etiquetas }: { trecho: Trecho; etiquetas: readonly EtiquetaStatus[] }) {
  if (typeof trecho === 'string') return <>{trecho}</>;
  if ('coluna' in trecho) return <span className="lg-regra-coluna">{trecho.coluna}</span>;
  if ('aviso' in trecho) return <em className="lg-regra-aviso">"{trecho.aviso}"</em>;
  const cor = etiquetas.find((etiqueta) => mesmoNome(etiqueta.nome, trecho.status))?.cor ?? COR_SEM_STATUS;
  return <span className={`lg-regra-status${textoEscuro(cor) ? ' is-texto-escuro' : ''}`} style={{ background: cor }}>{trecho.status}</span>;
}

const Trechos = ({ trechos, etiquetas }: { trechos: readonly Trecho[]; etiquetas: readonly EtiquetaStatus[] }) => (
  <>{trechos.map((trecho, indice) => <TrechoRegra key={indice} trecho={trecho} etiquetas={etiquetas} />)}</>
);

/**
 * "Regras" na barra do quadro, com duas abas: as regras em vigor, de mudança de status e de aviso no sino
 * (domain/automacoes.ts), e de onde cada coluna puxa os dados (domain/origens.ts). Só leitura; as regras são fixas no
 * código. A que depende de uma etiqueta que não está mais na lista aparece sem efeito.
 */
export function BotaoRegras({ etiquetas, papeis, nome }: {
  etiquetas: readonly EtiquetaStatus[];
  /** Quem está em cada papel do Atribuir (quem recebe o aviso da regra). */
  papeis: PapeisAvisos;
  nome: (uid: string) => string;
}) {
  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  const [aba, setAba] = useState<Aba>('regras');
  return (
    <>
      <button type="button" className="lg-btn" onClick={(event) => setAncora(event.currentTarget)} title="Regras de status e de aviso em vigor e de onde as colunas puxam os dados">
        <BoltRounded fontSize="small" /> Regras
      </button>
      <Popover
        open={ancora !== null}
        anchorEl={ancora}
        onClose={() => setAncora(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { className: 'lg-regras' } }}
      >
        <nav className="lg-regras-abas" role="tablist">
          <button type="button" role="tab" aria-selected={aba === 'regras'} className={aba === 'regras' ? 'on' : ''} onClick={() => setAba('regras')}>Regras em vigor</button>
          <button type="button" role="tab" aria-selected={aba === 'colunas'} className={aba === 'colunas' ? 'on' : ''} onClick={() => setAba('colunas')}>Colunas</button>
        </nav>
        {aba === 'regras' ? (
          <>
            <ul>
              {REGRAS.map((regra, indice) => {
                const ativa = regraAtiva(regra, etiquetas);
                return (
                  <li key={indice} className={ativa ? '' : 'is-inativa'}>
                    <BoltRounded fontSize="inherit" />
                    <span>
                      <strong>Quando</strong> <Trechos trechos={regra.quando} etiquetas={etiquetas} />, <strong>então</strong>{' '}
                      {regra.entao.map((parte, indice) => (
                        <Fragment key={indice}>{indice > 0 && ' e '}<Trechos trechos={parte} etiquetas={etiquetas} /></Fragment>
                      ))}.
                      {regra.papel && (
                        <small className="lg-regras-quem">Recebem: {papeis[regra.papel].map(nome).join(', ') || 'ninguém atribuído'}</small>
                      )}
                      {!ativa && <small>Sem efeito: não há a etiqueta de status "{regra.etiqueta}".</small>}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="lg-regras-nota">Valem só quando o campo estava vazio (ou o status era outro). ADMINISTRATIVO e ENGENHARIA são os papéis do botão Atribuir; quem fez a alteração não recebe o aviso.</p>
          </>
        ) : (
          <>
            <ul className="lg-origens">
              {ORIGENS.map(({ chave, titulo, origem }) => (
                <li key={chave}>
                  <span className="lg-regra-coluna">{titulo}</span>
                  <span>
                    {origem.tipo === 'quadro' ? (
                      <>Quadro do Friday <Link className="lg-origem-quadro" to={linkDoQuadro(origem.id)} target="_blank" rel="noopener noreferrer">
                        {origem.id} | {origem.nome} <OpenInNewRounded fontSize="inherit" />
                      </Link></>
                    ) : origem.tipo === 'colecao' ? (
                      <>Coleção <code>{origem.nome}</code></>
                    ) : null}
                    <small>{origem.detalhe}</small>
                  </span>
                </li>
              ))}
            </ul>
            <p className="lg-regras-nota">Preenchidas na própria célula: {PREENCHIDAS_NA_CELULA.join(', ')}.</p>
          </>
        )}
      </Popover>
    </>
  );
}
