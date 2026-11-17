import { getMestreColor, normalizeMestreKey } from "../../cronograma-obras/domain/mestres";

/**
 * /testes/mkiii: ao arrastar um mestre da paleta, um bonequinho na cor do mestre acompanha o ponteiro, como o do Google
 * Maps: balança para o lado conforme a velocidade do arraste (até 50°) e volta ao prumo quando o ponteiro para;
 * pendurado, levanta os braços e as pernas balançam; sobre uma linha do calendário, abre os braços para pousar. Os pés
 * ficam no ponteiro, que marca o dia em que ele cai. A paleta é a da produção: o ouvinte roda no document, depois
 * dela, e troca só a imagem do arraste (por uma transparente). NT e "+" ficam como estão.
 */
const INCLINACAO_MAXIMA = 50;
const GANHO = 2.4;
const FIGURA = `<svg viewBox="0 0 40 64" width="44" height="70" aria-hidden="true">
  <g class="qg-pm-braco is-esq"><rect x="7.5" y="22" width="6" height="15" rx="3"/></g>
  <g class="qg-pm-braco is-dir"><rect x="26.5" y="22" width="6" height="15" rx="3"/></g>
  <g class="qg-pm-perna is-esq"><rect x="12.5" y="38" width="7" height="20" rx="3.5"/></g>
  <g class="qg-pm-perna is-dir"><rect x="20.5" y="38" width="7" height="20" rx="3.5"/></g>
  <rect class="qg-pm-tronco" x="10" y="19" width="20" height="25" rx="8"/>
  <circle class="qg-pm-cabeca" cx="20" cy="10" r="8.5"/>
  <ellipse cx="17" cy="7" rx="3" ry="2" fill="rgba(255,255,255,.55)"/>
</svg>`;
/** Transparent drag image, so only the figure shows. */
const TRANSPARENTE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export function ligarBonequinho(): () => void {
  const vazio = new Image();
  vazio.src = TRANSPARENTE;
  const boneco = document.createElement("div");
  boneco.className = "qg-pegman";
  boneco.setAttribute("aria-hidden", "true");
  boneco.innerHTML = `<span class="qg-pegman-nome"></span><div class="qg-pegman-corpo">${FIGURA}</div><span class="qg-pegman-alvo"></span>`;
  document.body.appendChild(boneco);
  const nome = boneco.querySelector<HTMLElement>(".qg-pegman-nome")!;

  let ativo = false;
  let ultimoX = 0;
  let parado = 0;
  const posicionar = (x: number, y: number) => {
    boneco.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    const inclinacao = Math.max(-INCLINACAO_MAXIMA, Math.min(INCLINACAO_MAXIMA, (x - ultimoX) * GANHO));
    ultimoX = x;
    boneco.style.setProperty("--r", `${inclinacao}deg`);
    // Back to plumb when the pointer stops (dragover keeps firing, but not always).
    window.clearTimeout(parado);
    parado = window.setTimeout(() => boneco.style.setProperty("--r", "0deg"), 60);
  };

  const aoArrastar = (event: DragEvent) => {
    const chip = (event.target as HTMLElement | null)?.closest?.<HTMLElement>(".co-master-chip");
    if (!chip || !event.dataTransfer || chip.matches(".co-master-chip--nt, .co-master-add")) return;
    const mestre = chip.textContent?.trim() ?? "";
    const cor = getMestreColor(normalizeMestreKey(mestre));
    boneco.style.setProperty("--qg-boneco", cor.background);
    nome.textContent = mestre;
    nome.style.background = cor.background;
    nome.style.color = cor.text;
    event.dataTransfer.setDragImage(vazio, 0, 0);
    ultimoX = event.clientX;
    boneco.classList.remove("is-pousou", "is-pousando");
    boneco.classList.add("is-ativo");
    ativo = true;
    posicionar(event.clientX, event.clientY);
  };
  const aoMover = (event: DragEvent) => {
    if (!ativo || (event.clientX === 0 && event.clientY === 0)) return;
    posicionar(event.clientX, event.clientY);
    boneco.classList.toggle("is-pousando", Boolean((event.target as HTMLElement | null)?.closest?.(".qg-trilho.is-recebendo")));
  };
  const aoSoltar = (event: DragEvent) => {
    if (!ativo) return;
    ativo = false;
    window.clearTimeout(parado);
    boneco.style.setProperty("--r", "0deg");
    const pousou = boneco.classList.contains("is-pousando") && event.dataTransfer?.dropEffect !== "none";
    boneco.classList.remove("is-pousando");
    if (pousou) {
      boneco.classList.add("is-pousou");
      window.setTimeout(() => boneco.classList.remove("is-ativo", "is-pousou"), 320);
    } else boneco.classList.remove("is-ativo");
  };
  document.addEventListener("dragstart", aoArrastar);
  document.addEventListener("dragover", aoMover, true);
  document.addEventListener("dragend", aoSoltar);
  return () => {
    document.removeEventListener("dragstart", aoArrastar);
    document.removeEventListener("dragover", aoMover, true);
    document.removeEventListener("dragend", aoSoltar);
    window.clearTimeout(parado);
    boneco.remove();
  };
}
