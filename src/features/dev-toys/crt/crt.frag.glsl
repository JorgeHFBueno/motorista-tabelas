// CRT dos brinquedos em canvas: curvatura, aberração cromática, scanlines, vinheta, ruído e flicker.
precision mediump float;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uTime, uCurve, uScan, uVig, uAberr, uNoise, uFlicker;
uniform float uTransparente; // 1: o canvas fica sobre o DOM e só o desenho aparece (alfa da textura)
varying vec2 vUv;

vec2 curve(vec2 uv) { // barrel distortion
  uv = uv * 2.0 - 1.0;
  uv *= 1.0 + uCurve * dot(uv, uv);
  return uv * 0.5 + 0.5;
}

float rand(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 uv = curve(vUv);
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0 - uTransparente); // fora do "vidro"
    return;
  }
  vec2 off = vec2(uAberr / uRes.x, 0.0);
  vec4 r = texture2D(uTex, uv + off);
  vec4 g = texture2D(uTex, uv);
  vec4 b = texture2D(uTex, uv - off);
  vec3 c = vec3(r.r, g.g, b.b);
  float a = mix(1.0, max(r.a, max(g.a, b.a)), uTransparente);
  c *= 1.0 - uScan * (0.5 + 0.5 * sin(uv.y * uRes.y * 3.14159));
  vec2 v = uv * (1.0 - uv);
  c *= pow(clamp(v.x * v.y * 16.0, 0.0001, 1.0), uVig);
  c += (rand(uv + fract(uTime)) - 0.5) * uNoise;
  c *= 1.0 - uFlicker * (0.02 + 0.02 * sin(uTime * 60.0));
  gl_FragColor = vec4(c, a);
}
