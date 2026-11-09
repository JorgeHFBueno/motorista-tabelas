import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import { useMemo, useState, type CSSProperties } from 'react';
import { barrasDaLinha } from '../domain/calendario';
import { periodoDe, textoConflito } from '../domain/conflitos';
import type { CivilDate, Programacao } from '../domain/models';
import { ddmm, diasDoCalendario, semanaDoId, semanaIdDe } from '../domain/semanas';
import type { AcoesLogistica, CadastrosLogistica, ConflitosLogistica } from './contexto';

type LinhasPor = 'motorista' | 'veiculo';

const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const CORES = ['#2f6fde', '#2e9d6f', '#a0522d', '#654084', '#245f61', '#c2185b', '#4d548b', '#70483a', '#00838f', '#6a5136'];

function corDaObra(id: string | undefined): string {
  if (!id) return '#7b8494';
  let hash = 0;
  for (const letra of id) hash = (hash * 31 + letra.charCodeAt(0)) >>> 0;
  return CORES[hash % CORES.length];
}

interface Linha { chave: string; nome: string; programacoes: Programacao[] }

function montarLinhas(programacoes: readonly Programacao[], dias: readonly CivilDate[], por: LinhasPor, cadastros: CadastrosLogistica): Linha[] {
  const primeiro = dias[0];
  const ultimo = dias.at(-1)!;
  const noAlcance = programacoes.filter((programacao) => {
    const periodo = periodoDe(programacao);
    return periodo !== null && periodo.fim >= primeiro && periodo.inicio <= ultimo;
  });
  const linhas = new Map<string, Linha>();
  if (por === 'motorista') {
    // Todos os motoristas ativos, mais quem aparecer como motorista nas programações.
    for (const motorista of cadastros.motoristas) linhas.set(motorista.id, { chave: motorista.id, nome: motorista.nome, programacoes: [] });
  }
  const semRecurso: Programacao[] = [];
  // Por veículo, a programação com mais de um veículo aparece na linha de cada um.
  for (const programacao of noAlcance) {
    const recursos = por === 'motorista'
      ? (programacao.motorista ? [{ chave: programacao.motorista.uid, nome: cadastros.nomePessoa(programacao.motorista.uid, programacao.motorista.nome) }] : [])
      : programacao.veiculos.map((veiculo) => ({ chave: veiculo.id, nome: cadastros.nomeVeiculo(veiculo.id, veiculo.nome) }));
    if (!recursos.length) { semRecurso.push(programacao); continue; }
    for (const { chave, nome } of recursos) {
      const linha = linhas.get(chave) ?? { chave, nome, programacoes: [] };
      linha.programacoes.push(programacao);
      linhas.set(chave, linha);
    }
  }
  const ordenadas = [...linhas.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  if (semRecurso.length) ordenadas.push({ chave: '__sem__', nome: por === 'motorista' ? 'Sem motorista' : 'Sem veículo', programacoes: semRecurso });
  return ordenadas;
}

export function CalendarioSemanas({ programacoes, hoje, cadastros, conflitos, acoes }: {
  programacoes: readonly Programacao[];
  hoje: CivilDate;
  cadastros: CadastrosLogistica;
  conflitos: ConflitosLogistica;
  acoes: AcoesLogistica;
}) {
  const [por, setPor] = useState<LinhasPor>('motorista');
  const dias = useMemo(() => diasDoCalendario(hoje), [hoje]);
  const linhas = useMemo(() => montarLinhas(programacoes, dias, por, cadastros), [programacoes, dias, por, cadastros]);
  const semanas = [0, 7, 14, 21].map((indice) => semanaDoId(semanaIdDe(dias[indice])));
  const semanaAtual = semanaIdDe(hoje);
  const grade = { '--lg-dias': dias.length } as CSSProperties;

  return (
    <div className="lg-calendario">
      <div className="lg-cal-barra">
        <span className="lg-cal-alcance">{ddmm(dias[0])} a {ddmm(dias.at(-1)!)}</span>
        <span className="lg-espaco" />
        <span className="lg-cal-rotulo">Linhas por</span>
        <div className="lg-alternador" role="group" aria-label="Linhas por">
          <button type="button" className={por === 'motorista' ? 'on' : ''} onClick={() => setPor('motorista')}>Motorista</button>
          <button type="button" className={por === 'veiculo' ? 'on' : ''} onClick={() => setPor('veiculo')}>Veículo</button>
        </div>
      </div>
      <div className="lg-cal-rolagem">
        <div className="lg-cal-grade" style={grade}>
          <div className="lg-cal-cab">
            <div className="lg-cal-nome lg-cal-canto">{por === 'motorista' ? 'Motorista' : 'Veículo'}</div>
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
                    const outro = por === 'motorista'
                      ? programacao.veiculos.map((veiculo) => cadastros.nomeVeiculo(veiculo.id, veiculo.nome)).join(', ')
                      : (programacao.motorista ? cadastros.nomePessoa(programacao.motorista.uid, programacao.motorista.nome) : null);
                    const texto = [obra, programacao.item].filter(Boolean).join(' · ');
                    const rotuloOutro = por === 'motorista' ? (programacao.veiculos.length > 1 ? 'Veículos' : 'Veículo') : 'Motorista';
                    const titulo = [programacao.item, obra && `Obra: ${obra}`, outro && `${rotuloOutro}: ${outro}`, programacao.status && `Status: ${programacao.status}`, ...lista.map((conflito) => `⚠ ${textoConflito(conflito)}`)].filter(Boolean).join('\n');
                    return (
                      <button
                        type="button"
                        key={programacao.id}
                        className={`lg-cal-barra-item ${lista.length ? 'is-conflito' : ''} ${barra.cortadaAntes ? 'is-cortada-antes' : ''} ${barra.cortadaDepois ? 'is-cortada-depois' : ''}`}
                        style={{
                          '--lg-cor': corDaObra(programacao.obra?.id),
                          left: `calc(${barra.de} * var(--lg-dia))`,
                          width: `calc(${barra.ate - barra.de + 1} * var(--lg-dia) - 4px)`,
                          top: `calc(${barra.faixa} * var(--lg-faixa) + 4px)`,
                        } as CSSProperties}
                        title={titulo}
                        onClick={() => acoes.abrir(programacao.id)}
                      >
                        {lista.length > 0 && <WarningAmberRounded fontSize="inherit" />}
                        <span>{texto}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
