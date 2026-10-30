// Primeira janela do Desktop: diz o que é a área DEV. Textos sem acento: a Monaco não tem os glifos acentuados.
export default function SobreToy() {
  return (
    <div className="dt-sobre">
      <p className="dt-sobre-titulo">LEDUR MOTORISTA WEB</p>
      <p>Area DEV: brinquedos visuais, sem funcao no sistema.</p>
      <p>Nada aqui grava no Firestore ou no Storage.</p>
      <hr />
      <p>Build: {import.meta.env.MODE}</p>
      <p>Esc fecha a janela da frente; sem janelas, volta para a Home.</p>
    </div>
  );
}
