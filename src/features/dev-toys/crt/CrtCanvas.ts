import fragmento from './crt.frag.glsl?raw';
import type { UniformsCrt } from './parametros';

// Pós-processamento CRT em WebGL1, sem biblioteca: o brinquedo desenha num canvas 2D fora da tela, que vira textura
// a cada quadro e passa pelo shader num quadrado de tela cheia. Sem WebGL, quem chama usa o canvas 2D direto.
const VERTICE = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

export type CrtGl = {
  /** `transparente`: o canvas fica sobre o DOM e só o desenho aparece (sem fundo nem borda preta). */
  desenhar: (fonte: HTMLCanvasElement, u: UniformsCrt, tempoSeg: number, transparente?: boolean) => void;
  liberar: () => void;
};

function compilar(gl: WebGLRenderingContext, tipo: number, codigo: string): WebGLShader | null {
  const s = gl.createShader(tipo);
  if (!s) return null;
  gl.shaderSource(s, codigo);
  gl.compileShader(s);
  if (gl.getShaderParameter(s, gl.COMPILE_STATUS)) return s;
  console.warn('[dev-toys] shader CRT:', gl.getShaderInfoLog(s));
  gl.deleteShader(s);
  return null;
}

export function criarCrtGl(canvas: HTMLCanvasElement): CrtGl | null {
  const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
  if (!gl) return null;

  const vs = compilar(gl, gl.VERTEX_SHADER, VERTICE);
  const fs = compilar(gl, gl.FRAGMENT_SHADER, fragmento);
  const programa = gl.createProgram();
  if (!vs || !fs || !programa) return null;
  gl.attachShader(programa, vs);
  gl.attachShader(programa, fs);
  gl.linkProgram(programa);
  if (!gl.getProgramParameter(programa, gl.LINK_STATUS)) {
    console.warn('[dev-toys] programa CRT:', gl.getProgramInfoLog(programa));
    return null;
  }
  gl.useProgram(programa);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(programa, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  // Textura de tamanho qualquer (WebGL1): sem mipmap e presa na borda.
  const textura = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, textura);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  const u = (nome: string) => gl.getUniformLocation(programa, nome);
  const loc = {
    tex: u('uTex'), res: u('uRes'), tempo: u('uTime'), curva: u('uCurve'), scan: u('uScan'),
    vinheta: u('uVig'), aberracao: u('uAberr'), ruido: u('uNoise'), flicker: u('uFlicker'), transparente: u('uTransparente'),
  };
  gl.uniform1i(loc.tex, 0);

  return {
    desenhar(fonte, p, tempoSeg, transparente = false) {
      if (gl.isContextLost()) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fonte);
      gl.uniform2f(loc.res, fonte.width, fonte.height);
      gl.uniform1f(loc.tempo, tempoSeg);
      gl.uniform1f(loc.curva, p.curva);
      gl.uniform1f(loc.scan, p.scan);
      gl.uniform1f(loc.vinheta, p.vinheta);
      gl.uniform1f(loc.aberracao, p.aberracao);
      gl.uniform1f(loc.ruido, p.ruido);
      gl.uniform1f(loc.flicker, p.flicker);
      gl.uniform1f(loc.transparente, transparente ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    liberar() {
      gl.deleteTexture(textura);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(programa);
      gl.deleteShader(vs);
      // Sem loseContext: no StrictMode o efeito monta de novo no mesmo canvas, e o contexto precisa seguir vivo.
      gl.deleteShader(fs);
    },
  };
}
