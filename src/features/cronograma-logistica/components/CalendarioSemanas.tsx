import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import Popover from '@mui/material/Popover';
import { useMemo, useState, type CSSProperties } from 'react';
import { barrasDaLinha, dicaDaBarra, linhasDoCalendario, type LinhasPor } from '../domain/calendario';
import { textoConflito } from '../domain/conflitos';
import type { CivilDate, Programacao } from '../domain/models';
import { ddmm, diasDoCalendario, semanaDoId, semanaIdDe } from '../domain/semanas';
import { COR_SEM_STATUS, statusExibido, textoEscuro } from '../domain/status';
import type { AcoesLogistica, CadastrosLogistica, ConflitosLogistica } from './contexto';

const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MODOS: readonly (readonly [LinhasPor, string])[] = [['cod', 'Cod'], ['motorista', 'Motorista'], ['veiculo', 'Veículo']];

export function CalendarioSemanas({ programacoes, hoje, cadastros, conflitos, acoes }: {
  programacoes: readonly Programacao[];
  hoje: CivilDate;
  cadastros: CadastrosLogistica;
  conflitos: ConflitosLogistica;
  acoes: AcoesLogistica;
}) {
  const [por, setPor] = useState<LinhasPor>('motorista');
  /** Clique direito na barra: a dica aberta e maior, ainda no calendário. */
  const [zoom, setZoom] = useState<{ ancora: HTMLElement; dica: string[]; avisos: string[] } | null>(null);
  const dias = useMemo(() => diasDoCalendario(hoje), [hoje]);
  const linhas = useMemo(() => linhasDoCalendario(programacoes, dias, por, cadastros), [programacoes, dias, por, cadastros]);
  const semanas = [0, 7, 14, 21].map((indice) => semanaDoId(semanaIdDe(dias[indice])));
  const semanaAtual = semanaIdDe(hoje);
  const grade = { '--lg-dias': dias.length } as CSSProperties;

  return (
    <div className="lg-calendario">
      <div className="lg-cal-barra">
        <span className="lg-cal-alcance">{ddmm(dias[0])} a {ddmm(dias.at(-1)!)}</span>
        <span className="lg-espaco" />
        <div className="lg-cal-controles">
          <span className="lg-cal-rotulo">Linhas por</span>
          <div className="lg-alternador" role="group" aria-label="Linhas por">
            {MODOS.map(([valor, rotulo]) => (
              <button type="button" key={valor} className={por === valor ? 'is-active' : ''} aria-pressed={por === valor} onClick={() => setPor(valor)}>{rotulo}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="lg-cal-rolagem">
        <div className="lg-cal-grade" style={grade}>
          <div className="lg-cal-cab">
            <div className="lg-cal-nome lg-cal-canto">{MODOS.find(([valor]) => valor === por)![1]}</div>
            <div className="lg-cal-semanas">
              {semanas.map((semana) => (
                <div key={semana.id} className={semana.id === semanaAtual ? 'is-atual' : ''}>
                  Semana {semana.numero}{semana.id === semanaAtual ? ' (atual)' : ''}
                </div>
              ))}
            </div>
            <div className="lg-cal-dias">
              {dias.map((dia) => {
                const diaSemana = new Date(`${dia}T00:00:00Z`).getUTCDay();
                return (
                  <div key={dia} className={`${dia === hoje ? 'is-hoje ' : ''}${diaSemana === 0 || diaSemana === 6 ? 'is-fim-semana' : ''}`}>
                    <small>{DIAS_SEMANA[diaSemana]}</small>{dia.slice(8, 10)}
                  </div>
                );
              })}
            </div>
          </div>
          {linhas.length === 0 && <div className="lg-vazio">Nenhuma programação com data nestas 4 semanas.</div>}
          {linhas.map((linha) => {
            const { barras, faixas } = barrasDaLinha(linha.programacoes, dias);
            return (
              <div className="lg-cal-linha" key={linha.chave} style={{ '--lg-faixas': faixas } as CSSProperties}>
                <div className="lg-cal-nome" title={linha.nome}>{linha.nome}</div>
                <div className="lg-cal-trilho">
                  {dias.map((dia, indice) => {
                    const diaSemana = new Date(`${dia}T00:00:00Z`).getUTCDay();
                    return <i key={dia} className={`lg-cal-celula ${dia === hoje ? 'is-hoje' : ''} ${diaSemana === 0 || diaSemana === 6 ? 'is-fim-semana' : ''} ${indice % 7 === 0 ? 'is-segunda' : ''}`} />;
                  })}
                  {barras.map((barra) => {
                    const { programacao } = barra;
                    const lista = conflitos.get(programacao.id) ?? [];
                    const obra = programacao.obra ? cadastros.nomeObra(programacao.obra.id, programacao.obra.nome) : null;
                    const cor = statusExibido(programacao.status, cadastros.etiquetas).cor;
                    const dica = dicaDaBarra(programacao, por, linha.chave, cadastros);
                    const avisos = lista.map((conflito) => `⚠ ${textoConflito(conflito)}`);
                    const titulo = [...dica, ...avisos].join('\n');
                    return (
                      <button
                        type="button"
                        key={programacao.id}
                        className={`lg-cal-barra-item ${textoEscuro(cor) ? 'is-texto-escuro' : ''} ${lista.length ? 'is-conflito' : ''} ${barra.cortadaAntes ? 'is-cortada-antes' : ''} ${barra.cortadaDepois ? 'is-cortada-depois' : ''}`}
                        style={{
                          '--lg-cor': cor,
                          left: `calc(${barra.de} * var(--lg-dia))`,
                          width: `calc(${barra.ate - barra.de + 1} * var(--lg-dia) - 4px)`,
                          top: `calc(${barra.faixa} * var(--lg-faixa) + 4px)`,
                        } as CSSProperties}
                        title={titulo}
                        onClick={() => acoes.abrir(programacao.id)}
                        onContextMenu={(event) => { event.preventDefault(); setZoom({ ancora: event.currentTarget, dica, avisos }); }}
                      >
                        {lista.length > 0 && <WarningAmberRounded fontSize="inherit" />}
                        <span>{obra ?? 'Sem obra'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <Legenda cadastros={cadastros} />
      <Popover
        open={zoom !== null}
        anchorEl={zoom?.ancora}
        onClose={() => setZoom(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { className: 'lg-cal-zoom' } }}
      >
        {zoom && (
          <>
            {zoom.dica.map((linha, indice) => <p key={linha} className={indice === 0 ? 'lg-cal-zoom-titulo' : ''}>{linha}</p>)}
            {zoom.avisos.map((linha) => <p key={linha} className="lg-cal-zoom-conflito">{linha}</p>)}
          </>
        )}
      </Popover>
    </div>
  );
}

/** Cor de cada status (as etiquetas da lista editável) e a cinza de sem status. */
function Legenda({ cadastros }: { cadastros: CadastrosLogistica }) {
  return (
    <div className="lg-cal-legenda" aria-label="Legenda de status">
      <span className="lg-cal-rotulo">Status</span>
      {[...cadastros.etiquetas.map((etiqueta) => ({ chave: etiqueta.id, nome: etiqueta.nome, cor: etiqueta.cor })), { chave: '__sem__', nome: 'Sem status', cor: COR_SEM_STATUS }].map((item) => (
        <span key={item.chave} className="lg-cal-legenda-item"><i style={{ background: item.cor }} />{item.nome}</span>
      ))}
    </div>
  );
}
