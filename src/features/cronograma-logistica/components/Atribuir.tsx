import PersonAddAltOutlined from '@mui/icons-material/PersonAddAltOutlined';
import Avatar from '@mui/material/Avatar';
import AvatarGroup from '@mui/material/AvatarGroup';
import Checkbox from '@mui/material/Checkbox';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useState } from 'react';

const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';

/**
 * "Atribuir" na barra do quadro: até `maximo` pessoas (logistica ou adm2) que recebem no sino o aviso "Novo Pedido de
 * Nota" quando uma programação passa para "Ag. NF". Vale para o cronograma inteiro; cada marcação grava na hora.
 */
export function BotaoAtribuir({ atribuidos, pessoas, nome, maximo, onSalvar }: {
  atribuidos: string[];
  /** Quem pode ser atribuído (ativo, com logistica ou adm2), por nome. */
  pessoas: { uid: string; nome: string }[];
  nome: (uid: string) => string;
  maximo: number;
  onSalvar: (uids: string[]) => void;
}) {
  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  const cheio = atribuidos.length >= maximo;
  // Quem já está atribuído e perdeu a credencial continua na lista, para poder ser tirado.
  const fora = atribuidos.filter((uid) => !pessoas.some((pessoa) => pessoa.uid === uid)).map((uid) => ({ uid, nome: nome(uid) }));
  const alternar = (uid: string) => onSalvar(atribuidos.includes(uid) ? atribuidos.filter((u) => u !== uid) : [...atribuidos, uid]);
  return (
    <>
      <button
        type="button"
        className={`lg-btn${atribuidos.length ? ' lg-btn-ativo' : ''}`}
        onClick={(event) => setAncora(event.currentTarget)}
        title={atribuidos.length ? `Pedido de nota: ${atribuidos.map(nome).join(', ')}` : 'Quem recebe o aviso de pedido de nota (Ag. NF)'}
      >
        {atribuidos.length ? (
          <AvatarGroup max={maximo} sx={{ '& .MuiAvatar-root': { width: 22, height: 22, fontSize: 10, borderWidth: 1 } }}>
            {atribuidos.map((uid) => <Avatar key={uid} alt={nome(uid)}>{iniciais(nome(uid))}</Avatar>)}
          </AvatarGroup>
        ) : <PersonAddAltOutlined fontSize="small" />}
        Atribuir
      </button>
      <Menu anchorEl={ancora} open={ancora !== null} onClose={() => setAncora(null)} slotProps={{ paper: { className: 'lg-menu-coluna' } }}>
        <li className="lg-menu-ajuda">Recebem o aviso "Novo Pedido de Nota" quando uma programação passa para Ag. NF (até {maximo}).</li>
        {[...pessoas, ...fora].map((pessoa) => {
          const marcado = atribuidos.includes(pessoa.uid);
          return (
            <MenuItem key={pessoa.uid} dense disabled={!marcado && cheio} onClick={() => alternar(pessoa.uid)}>
              <Checkbox size="small" checked={marcado} tabIndex={-1} disableRipple sx={{ p: 0, mr: 1 }} />
              {pessoa.nome}
            </MenuItem>
          );
        })}
        {!pessoas.length && !fora.length && <li className="lg-menu-ajuda">Ninguém com a credencial logistica ou adm2.</li>}
      </Menu>
    </>
  );
}
