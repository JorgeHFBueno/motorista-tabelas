import PlaceOutlined from '@mui/icons-material/PlaceOutlined';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import { useState } from 'react';
import type { LoteV2 } from '../../../utils/cadastrosV2';
import { coordenadaCurta } from '../domain/local';

/**
 * Depois de escolher a Obra: qual LOTE preenche o Local (a coordenada do LOTE, coluna Coordenada dos subitens no
 * Friday). Os LOTEs sem coordenada aparecem desligados. "Agora não" fecha sem mexer no Local.
 */
export function EscolherLote({ obra, lotes, onEscolher, onFechar }: {
  obra: string;
  lotes: readonly LoteV2[];
  /** Lê a cidade pela coordenada e grava o Local; true quando gravou. */
  onEscolher: (lote: LoteV2) => Promise<boolean>;
  onFechar: () => void;
}) {
  const [lendo, setLendo] = useState<string | null>(null);
  const escolher = (lote: LoteV2) => {
    setLendo(lote.chave);
    onEscolher(lote).then((gravou) => { setLendo(null); if (gravou) onFechar(); });
  };
  return (
    <Dialog open onClose={lendo ? undefined : onFechar} maxWidth="xs" fullWidth>
      <DialogTitle>Qual LOTE?</DialogTitle>
      <DialogContent>
        <p className="lg-lote-ajuda">O Local da programação recebe a coordenada do LOTE de <strong>{obra}</strong>.</p>
        <ul className="lg-lotes">
          {lotes.map((lote) => (
            <li key={lote.chave}>
              <button type="button" className="lg-lote" disabled={!lote.coordenada || lendo !== null} onClick={() => escolher(lote)}>
                <span className="lg-lote-nome">{lote.nome}</span>
                <small>
                  {lendo === lote.chave ? 'Lendo a cidade…' : lote.coordenada ? <><PlaceOutlined fontSize="inherit" /> {coordenadaCurta(lote.coordenada)}</> : 'Sem coordenada'}
                </small>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
      <DialogActions>
        <Button onClick={onFechar} disabled={lendo !== null}>Agora não</Button>
      </DialogActions>
    </Dialog>
  );
}
