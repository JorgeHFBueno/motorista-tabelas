import { useState } from 'react';
import { Link, useNavigate } from '../rotas.tsx';
import { Folder, LayoutGrid, Plus, Star } from 'lucide-react';
import { useNav } from '../nav.tsx';
import { fmtData, hojeISO } from '../util.ts';
import { NovoQuadroModal } from '../layout/Lateral.tsx';
import { agrupar, concluido, useMeuTrabalho } from './MeuTrabalho.tsx';

export default function Inicio() {
  const nav = useNav();
  const navigate = useNavigate();
  const meus = useMeuTrabalho();
  const [novo, setNovo] = useState(false);
  const area = nav.areas.find(a => a.id === nav.areaId);
  const pendentes = (meus ?? []).filter(i => !concluido(i));
  const grupos = agrupar(pendentes);
  const favoritos = nav.quadros.filter(q => q.favorito);
  const daArea = nav.quadros.filter(q => q.area_id === nav.areaId);
  const pastas = nav.pastas.filter(p => p.area_id === nav.areaId);
  const hora = new Date().getHours();

  const Cartao = ({ q }: { q: (typeof nav.quadros)[number] }) => (
    <button className="cartao-quadro" onClick={() => navigate(`/quadros/${q.id}`)}>
      <span className="cq-capa"><LayoutGrid size={22} /></span>
      <span className="cq-nome">{q.nome}{q.favorito ? <Star size={13} className="cq-fav" /> : null}</span>
      <small className="muted">{nav.areas.find(a => a.id === q.area_id)?.nome}{q.pasta_id ? ` · ${nav.pastas.find(p => p.id === q.pasta_id)?.nome ?? ''}` : ''}</small>
    </button>
  );

  return (
    <div className="pagina">
      <header className="pagina-cab">
        <div>
          <p className="muted">{fmtData(hojeISO(), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1>{hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'}, {String(nav.usuario?.nome ?? '').split(' ')[0]}!</h1>
        </div>
        <button className="fr-btn btn-primario" onClick={() => setNovo(true)}><Plus size={16} /> Criar quadro</button>
      </header>

      <section className="inicio-resumo">
        {grupos.slice(0, 4).map(g => (
          <Link key={g.nome} to="/meu-trabalho" className="resumo-cartao" style={{ borderTopColor: g.cor }}>
            <strong>{meus ? g.itens.length : '–'}</strong><span>{g.nome}</span>
          </Link>
        ))}
      </section>

      {favoritos.length > 0 && (
        <section className="inicio-secao">
          <h2><Star size={18} /> Favoritos</h2>
          <div className="grade-quadros">{favoritos.map(q => <Cartao key={q.id} q={q} />)}</div>
        </section>
      )}

      <section className="inicio-secao">
        <h2>Quadros em {area?.nome}</h2>
        {pastas.filter(p => daArea.some(q => q.pasta_id === p.id)).map(p => (
          <div key={p.id} className="inicio-pasta">
            <h3><Folder size={15} /> {p.nome}</h3>
            <div className="grade-quadros">{daArea.filter(q => q.pasta_id === p.id).map(q => <Cartao key={q.id} q={q} />)}</div>
          </div>
        ))}
        {daArea.some(q => !q.pasta_id) && (
          <div className="inicio-pasta">
            {pastas.length > 0 && <h3>Sem pasta</h3>}
            <div className="grade-quadros">{daArea.filter(q => !q.pasta_id).map(q => <Cartao key={q.id} q={q} />)}</div>
          </div>
        )}
        {!daArea.length && <p className="muted">Nenhum quadro nesta área ainda.</p>}
      </section>
      {novo && <NovoQuadroModal pastaId={null} onFechar={() => setNovo(false)} />}
    </div>
  );
}
