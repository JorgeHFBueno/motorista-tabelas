import { getMestreColor, normalizeMestreKey } from "../../cronograma-obras/domain/mestres";

/**
 * /testes/mkiii: ao arrastar um mestre da paleta, a imagem do arraste vira um bonequinho na cor do mestre, com o nome
 * embaixo (como o do Google Maps); o ponteiro fica nos pés, que marcam o dia em que ele vai cair. A paleta é a da
 * produção: este ouvinte roda no document, depois dela, e troca só a imagem do arraste. NT e "+" ficam como estão.
 */
export function ligarBonequinho(): () => void {
  const imagem = document.createElement("div");
  imagem.className = "qg-bonequinho";
  imagem.setAttribute("aria-hidden", "true");
  document.body.appendChild(imagem);

  const aoArrastar = (event: DragEvent) => {
    const chip = (event.target as HTMLElement | null)?.closest?.<HTMLElement>(".co-master-chip");
    if (!chip || !event.dataTransfer || chip.matches(".co-master-chip--nt, .co-master-add")) return;
    const nome = chip.textContent?.trim() ?? "";
    const cor = getMestreColor(normalizeMestreKey(nome));
    imagem.replaceChildren();
    imagem.style.setProperty("--qg-boneco", cor.background);
    imagem.insertAdjacentHTML("beforeend", `<svg viewBox="0 0 40 56" width="40" height="56"><ellipse cx="20" cy="53" rx="9" ry="3" fill="rgba(15,23,42,.35)"/><circle cx="20" cy="10" r="8" fill="var(--qg-boneco)" stroke="#fff" stroke-width="2.5"/><path d="M8 34c0-8 5-14 12-14s12 6 12 14v4h-5v13h-14v-13H8z" fill="var(--qg-boneco)" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg>`);
    const etiqueta = document.createElement("span");
    etiqueta.textContent = nome;
    etiqueta.style.background = cor.background;
    etiqueta.style.color = cor.text;
    imagem.appendChild(etiqueta);
    const largura = imagem.offsetWidth;
    // Pointer on the feet (bottom of the figure).
    event.dataTransfer.setDragImage(imagem, largura / 2, 54);
  };
  document.addEventListener("dragstart", aoArrastar);
  return () => {
    document.removeEventListener("dragstart", aoArrastar);
    imagem.remove();
  };
}
