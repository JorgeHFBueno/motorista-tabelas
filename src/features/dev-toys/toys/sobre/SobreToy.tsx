// Primeira janela do Desktop: diz o que é a área DEV. Textos sem acento: a Monaco não tem os glifos acentuados.
export default function SobreToy() {
  return (
    <div className="dt-sobre">
      <p className="dt-sobre-titulo">LEDUR MOTORISTA WEB</p>
      <p>Area DEV: setores visuais, sem funcao no sistema.</p>
      <p>Tudo fica neste navegador, menos as salas online do Xadrez e do NEO (Firestore, colecao dev-salas).</p>
      <hr />
      <p>Build: {import.meta.env.MODE}</p>
      <p>Esc fecha a janela da frente; sem janelas, volta para a Home.</p>
    </div>
  );
}
