// CRT dos brinquedos em canvas: curvatura, aberração cromática, scanlines, vinheta, ruído e flicker.
precision mediump float;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uTime, uCurve, uScan, uVig, uAberr, uNoise, uFlicker;
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
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); // fora do "vidro"
    return;
  }
  vec2 off = vec2(uAberr / uRes.x, 0.0);
  vec3 c = vec3(texture2D(uTex, uv + off).r, texture2D(uTex, uv).g, texture2D(uTex, uv - off).b);
  c *= 1.0 - uScan * (0.5 + 0.5 * sin(uv.y * uRes.y * 3.14159));
  vec2 v = uv * (1.0 - uv);
  c *= pow(clamp(v.x * v.y * 16.0, 0.0001, 1.0), uVig);
  c += (rand(uv + fract(uTime)) - 0.5) * uNoise;
  c *= 1.0 - uFlicker * (0.02 + 0.02 * sin(uTime * 60.0));
  gl_FragColor = vec4(c, 1.0);
}
