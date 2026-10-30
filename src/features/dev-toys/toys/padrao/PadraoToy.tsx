import CrtView, { type Desenhar } from '../../crt/CrtView';

const L = 320;
const A = 240;
const TINTA = '#ffb000';

// FPS suavizado, guardado fora do React: o desenho roda a cada quadro.
let fps = 60;

// Padrão de teste de TV em âmbar: mostra o CRT em WebGL (curvatura, aberração, scanlines) e o FPS do laço.
const desenhar: Desenhar = (ctx, { tempo, dt, largura, altura, modo }) => {
  if (dt > 0) fps += (1 / dt - fps) * 0.05;

  ctx.fillStyle = '#080603';
  ctx.fillRect(0, 0, largura, altura);

  // grade
  ctx.strokeStyle = '#7a5400';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0.5; x < largura; x += 20) { ctx.moveTo(x, 0); ctx.lineTo(x, altura); }
  for (let y = 0.5; y < altura; y += 20) { ctx.moveTo(0, y); ctx.lineTo(largura, y); }
  ctx.stroke();

  // barras de intensidade
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = `rgb(255 176 0 / ${(i + 1) / 8})`;
    ctx.fillRect(40 + i * 30, 40, 30, 50);
  }

  // círculo central e cruz
  ctx.strokeStyle = TINTA;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(largura / 2, altura / 2 + 20, 60, 0, Math.PI * 2);
  ctx.moveTo(largura / 2 - 70, altura / 2 + 20); ctx.lineTo(largura / 2 + 70, altura / 2 + 20);
  ctx.moveTo(largura / 2, altura / 2 - 50); ctx.lineTo(largura / 2, altura / 2 + 90);
  ctx.stroke();

  // faixa que desce, como um vazamento de sinal
  const y = (tempo * 40) % (altura + 30) - 15;
  ctx.fillStyle = 'rgb(255 176 0 / 0.12)';
  ctx.fillRect(0, y, largura, 15);

  ctx.fillStyle = TINTA;
  ctx.font = '16px "DevToys Monaco", monospace';
  ctx.fillText('LEDUR TV', 12, 22);
  ctx.textAlign = 'right';
  ctx.fillText(`${modo === 'webgl' ? 'WEBGL' : 'SEM WEBGL'}  ${Math.round(fps)} FPS`, largura - 12, altura - 12);
  ctx.textAlign = 'left';
};

export default function PadraoToy() {
  return <CrtView largura={L} altura={A} desenhar={desenhar} />;
}
