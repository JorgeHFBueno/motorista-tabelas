import PersonAddAltOutlined from '@mui/icons-material/PersonAddAltOutlined';
import Avatar from '@mui/material/Avatar';
import AvatarGroup from '@mui/material/AvatarGroup';
import Checkbox from '@mui/material/Checkbox';
import Popover from '@mui/material/Popover';
import { useState } from 'react';
import type { PapeisAvisos } from '../data/logisticaFirestore';

const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';

type Papel = keyof PapeisAvisos;
export interface Pessoa { uid: string; nome: string }

/** Os papéis do Atribuir, na ordem das colunas, e o que cada um recebe (as regras estão no botão Regras). */
const PAPEIS: readonly { chave: Papel; titulo: string; recebe: string }[] = [
  { chave: 'administrativo', titulo: 'ADMINISTRATIVO', recebe: '"Novo Pedido de Nota" (Ag. NF) e "Nota anexada"' },
  { chave: 'engenharia', titulo: 'ENGENHARIA', recebe: 'o aviso de Ag. Lista de Materiais' },
];

/**
 * "Atribuir" na barra do quadro: as pessoas de cada papel, ADMINISTRATIVO e ENGENHARIA, que recebem no sino os avisos
 * das regras (domain/automacoes.ts). Sem limite; vale para o cronograma inteiro; cada marcação grava na hora.
 */
export function BotaoAtribuir({ papeis, pessoas, nome, onSalvar }: {
  papeis: PapeisAvisos;
  /** Quem pode estar em cada papel (ativo; ADMINISTRATIVO: logistica ou adm2; ENGENHARIA: engenharia ou adm2), por nome. */
  pessoas: Record<Papel, Pessoa[]>;
  nome: (uid: string) => string;
  onSalvar: (papeis: PapeisAvisos) => void;
}) {
  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  const todos = [...new Set([...papeis.administrativo, ...papeis.engenharia])];
  const alternar = (papel: Papel, uid: string) => {
    const lista = papeis[papel];
    onSalvar({ ...papeis, [papel]: lista.includes(uid) ? lista.filter((u) => u !== uid) : [...lista, uid] });
  };
  const titulo = PAPEIS.map(({ chave, titulo: t }) => `${t}: ${papeis[chave].map(nome).join(', ') || 'ninguém'}`).join(' · ');
  return (
    <>
      <button
        type="button"
        className={`lg-btn${todos.length ? ' lg-btn-ativo' : ''}`}
        onClick={(event) => setAncora(event.currentTarget)}
        title={todos.length ? titulo : 'Quem recebe os avisos das regras, por papel'}
      >
        {todos.length ? (
          <AvatarGroup max={4} sx={{ '& .MuiAvatar-root': { width: 22, height: 22, fontSize: 10, borderWidth: 1 } }}>
            {todos.map((uid) => <Avatar key={uid} alt={nome(uid)}>{iniciais(nome(uid))}</Avatar>)}
          </AvatarGroup>
        ) : <PersonAddAltOutlined fontSize="small" />}
        Atribuir
      </button>
      <Popover
        open={ancora !== null}
        anchorEl={ancora}
        onClose={() => setAncora(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { className: 'lg-atribuir' } }}
      >
        {PAPEIS.map(({ chave, titulo: t, recebe }) => {
          const marcados = papeis[chave];
          // Quem está no papel e perdeu o acesso continua na lista, para poder ser tirado.
          const fora = marcados.filter((uid) => !pessoas[chave].some((pessoa) => pessoa.uid === uid)).map((uid) => ({ uid, nome: nome(uid) }));
          const lista = [...pessoas[chave], ...fora];
          return (
            <section key={chave} className="lg-atribuir-coluna">
              <p className="lg-atribuir-titulo">{t}</p>
              <p className="lg-atribuir-ajuda">Recebe {recebe}.</p>
              <ul>
                {lista.map((pessoa) => (
                  <li key={pessoa.uid}>
                    <label>
                      <Checkbox size="small" checked={marcados.includes(pessoa.uid)} onChange={() => alternar(chave, pessoa.uid)} sx={{ p: 0, mr: 1 }} />
                      {pessoa.nome}
                    </label>
                  </li>
                ))}
              </ul>
              {!lista.length && <p className="lg-atribuir-ajuda">Ninguém com acesso a {chave === 'engenharia' ? 'Engenharia' : 'Logística'}.</p>}
            </section>
          );
        })}
      </Popover>
    </>
  );
}
