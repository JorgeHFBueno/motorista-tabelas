import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import Popover from '@mui/material/Popover';
import { useState, type ReactNode } from 'react';
import { textoCodigo } from '../domain/codigo';
import type { ItemConflito } from '../domain/conflitos';
import { ddmm } from '../domain/semanas';
import type { AcoesLogistica } from './contexto';


const comCodigo = (cod: number | null, item: string) => (cod === null ? item : `${textoCodigo(cod)} ${item}`);

export function ListaConflitos({ itens, acoes, mostrarLinha = true }: { itens: readonly ItemConflito[]; acoes: AcoesLogistica; mostrarLinha?: boolean }) {
  if (!itens.length) return <p className="lg-conflitos-vazio">Nenhum conflito.</p>;
  return (
    <ul className="lg-conflitos">
      {itens.map(({ programacao, conflito }) => (
        <li key={`${programacao.id}-${conflito.chave}`} className={conflito.ignorado ? 'is-ignorado' : ''}>
          <div>
            {mostrarLinha && <strong>{comCodigo(programacao.cod, programacao.item)}</strong>}
            <span>{conflito.nome} também em "{comCodigo(conflito.outroCod, conflito.outroItem)}" ({ddmm(conflito.primeiroDia)})</span>
            {conflito.ignorado && <small>Ignorado</small>}
          </div>
          <button type="button" className="lg-conflitos-acao" onClick={() => acoes.ignorarConflito(programacao, conflito, !conflito.ignorado)}>
            {conflito.ignorado ? 'Voltar a avisar' : 'Ignorar'}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Botão que abre a lista de conflitos num balão (cabeçalho da semana e ícone da linha). */
export function BotaoConflitos({ itens, acoes, rotulo, className, titulo, mostrarLinha }: {
  itens: readonly ItemConflito[];
  acoes: AcoesLogistica;
  rotulo: ReactNode;
  className: string;
  titulo: string;
  mostrarLinha?: boolean;
}) {
  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  return (
    <>
      <button type="button" className={className} title={titulo} aria-label={titulo} onClick={(event) => setAncora(event.currentTarget)}>
        {rotulo}
      </button>
      <Popover
        open={ancora !== null}
        anchorEl={ancora}
        onClose={() => setAncora(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { className: 'lg-conflitos-balao' } }}
      >
        <div className="lg-conflitos-titulo"><WarningAmberRounded fontSize="small" /> Conflitos</div>
        <p className="lg-conflitos-ajuda">Mesma pessoa ou mesmo veículo em duas programações no mesmo dia. Quando for de propósito (horários diferentes), ignore.</p>
        <ListaConflitos itens={itens} acoes={acoes} {...(mostrarLinha === undefined ? {} : { mostrarLinha })} />
      </Popover>
    </>
  );
}
