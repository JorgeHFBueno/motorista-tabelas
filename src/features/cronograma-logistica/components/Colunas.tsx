import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import BoltRounded from '@mui/icons-material/BoltRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import MoreHorizRounded from '@mui/icons-material/MoreHorizRounded';
import PushPinOutlined from '@mui/icons-material/PushPinOutlined';
import SwapVertRounded from '@mui/icons-material/SwapVertRounded';
import ViewColumnOutlined from '@mui/icons-material/ViewColumnOutlined';
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined';
import Checkbox from '@mui/material/Checkbox';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useState } from 'react';
import { automacaoDaColuna } from '../domain/automacoes';
import { COLUNAS, fixacao, LARGURA_MAX, LARGURA_MIN, type ColunaVisivel, type PrefsColunas } from '../domain/colunas';

export type MudarPrefs = (alterar: (atuais: PrefsColunas) => PrefsColunas) => void;

/** Arrasta a borda do cabeçalho; mostra a largura ao vivo e grava ao soltar (como no Friday). */
function arrastarBorda(x0: number, w0: number, aoMover: (w: number) => void, aoSoltar: (w: number) => void) {
  let w = w0;
  const mover = (event: MouseEvent) => { w = Math.max(LARGURA_MIN, Math.min(LARGURA_MAX, w0 + event.clientX - x0)); aoMover(w); };
  const soltar = () => {
    document.removeEventListener('mousemove', mover);
    document.removeEventListener('mouseup', soltar);
    document.body.classList.remove('lg-redimensionando');
    aoSoltar(Math.round(w));
  };
  document.body.classList.add('lg-redimensionando');
  document.addEventListener('mousemove', mover);
  document.addEventListener('mouseup', soltar);
}

/** Cabeçalho da coluna: seta de ordenar, menu (ordenar, fixar, ocultar) e borda para mudar a largura. */
export function CabecalhoColuna({ coluna, prefs, mudar, onLarguraAoVivo }: {
  coluna: ColunaVisivel;
  prefs: PrefsColunas;
  mudar: MudarPrefs;
  onLarguraAoVivo: (largura: { chave: ColunaVisivel['chave']; valor: number } | null) => void;
}) {
  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  const dir = prefs.ordem?.chave === coluna.chave ? prefs.ordem.dir : null;
  const fixa = prefs.fixas.includes(coluna.chave);
  const ordenar = (novo: 1 | -1 | null) => mudar((atuais) => ({ ...atuais, ordem: novo ? { chave: coluna.chave, dir: novo } : null }));
  const fechar = () => setAncora(null);
  const { className, style } = fixacao(coluna);
  const automacao = automacaoDaColuna(coluna.chave);
  return (
    <th className={`lg-th ${className}${dir ? ' is-ordenada' : ''}`} style={style}>
      <div className="lg-th-conteudo">
        {coluna.ordenavel && (
          <button
            type="button"
            className="lg-th-ordem"
            onClick={() => ordenar(dir === 1 ? -1 : 1)}
            title={dir === 1 ? 'Crescente (clique para decrescente)' : dir === -1 ? 'Decrescente (clique para crescente)' : 'Ordenar por esta coluna'}
            aria-label={`Ordenar por ${coluna.titulo}`}
          >
            {dir === 1 ? <ArrowUpwardRounded fontSize="inherit" /> : dir === -1 ? <ArrowDownwardRounded fontSize="inherit" /> : <SwapVertRounded fontSize="inherit" />}
          </button>
        )}
        <span className="lg-th-titulo">{fixa && <PushPinOutlined fontSize="inherit" />}{coluna.titulo}</span>
        {automacao && <span className="lg-th-automacao" title={automacao} aria-label={automacao}><BoltRounded fontSize="inherit" /></span>}
        <button type="button" className="lg-th-menu" onClick={(event) => setAncora(event.currentTarget)} aria-label={`Menu da coluna ${coluna.titulo}`}>
          <MoreHorizRounded fontSize="inherit" />
        </button>
      </div>
      <span
        className="lg-th-borda"
        title="Arraste para ajustar a largura; clique duas vezes para voltar à padrão"
        onMouseDown={(event) => {
          event.preventDefault();
          arrastarBorda(event.clientX, coluna.largura, (valor) => onLarguraAoVivo({ chave: coluna.chave, valor }), (valor) => {
            onLarguraAoVivo(null);
            mudar((atuais) => ({ ...atuais, larguras: { ...atuais.larguras, [coluna.chave]: valor } }));
          });
        }}
        onDoubleClick={() => mudar((atuais) => {
          const larguras = { ...atuais.larguras };
          delete larguras[coluna.chave];
          return { ...atuais, larguras };
        })}
      />
      <Menu anchorEl={ancora} open={ancora !== null} onClose={fechar} slotProps={{ paper: { className: 'lg-menu-coluna' } }}>
        {coluna.ordenavel && <MenuItem onClick={() => { ordenar(1); fechar(); }}><ListItemIcon><ArrowUpwardRounded fontSize="small" /></ListItemIcon>Ordenar crescente</MenuItem>}
        {coluna.ordenavel && <MenuItem onClick={() => { ordenar(-1); fechar(); }}><ListItemIcon><ArrowDownwardRounded fontSize="small" /></ListItemIcon>Ordenar decrescente</MenuItem>}
        {dir && <MenuItem onClick={() => { ordenar(null); fechar(); }}><ListItemIcon><CloseRounded fontSize="small" /></ListItemIcon>Tirar ordenação</MenuItem>}
        <MenuItem onClick={() => {
          mudar((atuais) => ({ ...atuais, fixas: fixa ? atuais.fixas.filter((chave) => chave !== coluna.chave) : [...atuais.fixas, coluna.chave] }));
          fechar();
        }}>
          <ListItemIcon><PushPinOutlined fontSize="small" /></ListItemIcon>{fixa ? 'Desafixar coluna' : 'Fixar coluna'}
        </MenuItem>
        {coluna.ocultavel && (
          <MenuItem onClick={() => { mudar((atuais) => ({ ...atuais, ocultas: [...atuais.ocultas, coluna.chave] })); fechar(); }}>
            <ListItemIcon><VisibilityOffOutlined fontSize="small" /></ListItemIcon>Ocultar coluna
          </MenuItem>
        )}
      </Menu>
    </th>
  );
}

/** Barra do Quadro: a ordenação em uso (com o "x" para tirar) e as colunas ocultas (marcar para mostrar). */
export function BarraColunas({ prefs, mudar }: { prefs: PrefsColunas; mudar: MudarPrefs }) {
  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  const ordenada = prefs.ordem ? COLUNAS.find((coluna) => coluna.chave === prefs.ordem!.chave) : null;
  const ocultaveis = COLUNAS.filter((coluna) => coluna.ocultavel);
  return (
    <>
      {ordenada && prefs.ordem && (
        <span className="lg-chip-ordem">
          {prefs.ordem.dir === 1 ? <ArrowUpwardRounded fontSize="inherit" /> : <ArrowDownwardRounded fontSize="inherit" />}
          Ordenado por {ordenada.titulo}
          <button type="button" onClick={() => mudar((atuais) => ({ ...atuais, ordem: null }))} title="Tirar ordenação (volta à ordem da semana)" aria-label="Tirar ordenação">
            <CloseRounded fontSize="inherit" />
          </button>
        </span>
      )}
      <button type="button" className={`lg-btn${prefs.ocultas.length ? ' lg-btn-ativo' : ''}`} onClick={(event) => setAncora(event.currentTarget)}>
        <ViewColumnOutlined fontSize="small" /> Colunas{prefs.ocultas.length > 0 && ` (${prefs.ocultas.length} ocultas)`}
      </button>
      <Menu anchorEl={ancora} open={ancora !== null} onClose={() => setAncora(null)} slotProps={{ paper: { className: 'lg-menu-coluna' } }}>
        {ocultaveis.map((coluna) => {
          const visivel = !prefs.ocultas.includes(coluna.chave);
          return (
            <MenuItem
              key={coluna.chave}
              dense
              onClick={() => mudar((atuais) => ({
                ...atuais,
                ocultas: visivel ? [...atuais.ocultas, coluna.chave] : atuais.ocultas.filter((chave) => chave !== coluna.chave),
              }))}
            >
              <Checkbox size="small" checked={visivel} tabIndex={-1} disableRipple sx={{ p: 0, mr: 1 }} />
              {coluna.titulo}
            </MenuItem>
          );
        })}
        {prefs.ocultas.length > 0 && (
          <MenuItem dense onClick={() => mudar((atuais) => ({ ...atuais, ocultas: [] }))} sx={{ borderTop: '1px solid #e6e9ef', mt: 0.5 }}>
            Mostrar todas
          </MenuItem>
        )}
      </Menu>
    </>
  );
}
