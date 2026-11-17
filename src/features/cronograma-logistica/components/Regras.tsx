import BoltRounded from '@mui/icons-material/BoltRounded';
import Popover from '@mui/material/Popover';
import { useState } from 'react';
import { REGRAS, regraAtiva } from '../domain/automacoes';
import type { EtiquetaStatus } from '../domain/status';
import type { PapeisAvisos } from '../data/logisticaFirestore';

/**
 * "Regras" na barra do quadro: as regras em vigor, de mudança de status e de aviso no sino (domain/automacoes.ts).
 * Só leitura; as regras são fixas no código. A que depende de uma etiqueta que não está mais na lista aparece sem efeito.
 */
export function BotaoRegras({ etiquetas, papeis, nome }: {
  etiquetas: readonly EtiquetaStatus[];
  /** Quem está em cada papel do Atribuir (quem recebe o aviso da regra). */
  papeis: PapeisAvisos;
  nome: (uid: string) => string;
}) {
  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  return (
    <>
      <button type="button" className="lg-btn" onClick={(event) => setAncora(event.currentTarget)} title="Regras de status e de aviso em vigor">
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
        <p className="lg-regras-titulo">Regras em vigor</p>
        <ul>
          {REGRAS.map((regra) => {
            const ativa = regraAtiva(regra, etiquetas);
            return (
              <li key={regra.etiqueta} className={ativa ? '' : 'is-inativa'}>
                <BoltRounded fontSize="inherit" />
                <span>
                  <strong>Quando</strong> {regra.quando}, <strong>então</strong> {regra.entao.join(' e ')}.
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
      </Popover>
    </>
  );
}
