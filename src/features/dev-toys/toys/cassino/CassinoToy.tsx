import { DEV_TOYS } from '../../registry';
import { IconesSetores } from '../../shell/IconesSetores';

// Pasta Cassino: os jogos de fichas contra a casa e a mesa (21, Poker, Slot Machine, NEO). Abre como o Desktop:
// dois cliques (ou Enter) no ícone.
const DA_PASTA = DEV_TOYS.filter((t) => t.pasta === 'cassino');
const abrir = (id: string) => window.dispatchEvent(new CustomEvent('ledur:dev-abrir', { detail: id }));

export default function CassinoToy() {
  return <IconesSetores toys={DA_PASTA} className="dt-pasta" onAbrir={abrir} />;
}
