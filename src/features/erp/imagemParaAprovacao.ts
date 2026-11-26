// Ponte entre o Canvas (CanvasTela.tsx, nas Ferramentas) e a caixa Aprovar página (AprovarPagina.tsx): quando a caixa
// está na tela e a pessoa pode aprovar, ela se registra aqui; o Canvas então mostra "Mandar para Aprovar página", captura
// a tela com o rabisco e entrega a imagem, que entra na decisão da página. Sem Firebase: só o recado entre os dois.

type Receptor = (imagem: Blob) => void;
const receptores = new Set<Receptor>();

/** A caixa passa a receber imagens; devolve a função que para de receber. */
export function receberImagensParaAprovacao(receptor: Receptor) {
  receptores.add(receptor);
  return () => { receptores.delete(receptor); };
}

/** Há uma caixa Aprovar página que aceita imagem nesta tela. */
export const temQuemRecebaImagem = () => receptores.size > 0;

/** Entrega a imagem à caixa Aprovar página. */
export function mandarImagemParaAprovacao(imagem: Blob) {
  receptores.forEach((r) => r(imagem));
}
