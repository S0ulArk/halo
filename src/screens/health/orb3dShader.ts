// The Pulse Age orb in 3D, drawn by one Skia runtime shader: each pixel casts a ray at a living blob (a sphere whose
// surface swells and folds with slow travelling waves, so its outline never holds still) and lights what it hits. The
// orb keeps its old character: a pale glowing core (the number sits on it) fading out to the rim colour of the
// Pulse Age (greens younger, oranges and rust older), the top and bottom tones blended up its height, a soft halo, and
// fine specks of light inside that turn with the orb, so it reads as a solid in space. A key highlight and a rim light
// finish it. No mesh and no per-frame JavaScript beyond one clock: the time, the turn and a press's "energy" are
// uniforms. Kept free of React Native imports so a Node script can render it with CanvasKit to check the look.

export const ORB3D_SKSL = `
uniform float2 center;
uniform float R;          // the orb's radius in canvas units
uniform float t;          // seconds
uniform float spin;       // radians turned about the vertical
uniform float energy;     // 0 at rest, 1 while held: livelier waves
uniform float3 top;       // rim colour up top
uniform float3 bottom;    // rim colour below
uniform float3 core;      // the glowing core
uniform float3 hilite;    // highlight and specks
uniform float night;      // 1 in the dark theme

// The surface: a unit sphere displaced by three slow travelling waves (stronger when held).
float waves(float3 p) {
  float a = 0.06 + 0.045 * energy;
  return a * sin(2.7 * p.x + t * 0.9) * sin(2.3 * p.y - t * 0.7) * sin(2.9 * p.z + t * 1.1)
       + a * 0.7 * sin(4.1 * p.y + 1.7 + t * 0.6) * sin(3.6 * p.z - t * 0.8 + 0.4)
       + a * 0.45 * sin(5.3 * p.x - t * 1.3 + 2.1) * sin(4.7 * p.z + t * 0.5);
}

float map(float3 p) { return (length(p) - 1.0 - waves(p)) * 0.72; }

float3 nrm(float3 p) {
  const float e = 0.002;
  return normalize(float3(1.0, -1.0, -1.0) * map(p + float3(e, -e, -e)) + float3(-1.0, -1.0, 1.0) * map(p + float3(-e, -e, e)) +
                   float3(-1.0, 1.0, -1.0) * map(p + float3(-e, e, -e)) + float3(1.0, 1.0, 1.0) * map(p + float3(e, e, e)));
}

float hash3(float3 q) { return fract(sin(dot(q, float3(127.1, 311.7, 74.7))) * 43758.5453); }

half4 main(float2 xy) {
  float2 uv = (xy - center) / R;
  float3 ro = float3(0.0, 0.0, 4.0);
  float3 rd = normalize(float3(uv.x, -uv.y, -4.0));
  float b = dot(ro, rd);
  float h = b * b - dot(ro, ro) + 1.3 * 1.3;
  // Outside the bound: only the halo.
  float r2 = length(uv);
  float halo = exp(-max(r2 - 0.95, 0.0) * 6.0) * smoothstep(1.7, 1.0, r2);
  float3 rimAvg = mix(top, bottom, 0.5);
  if (h < 0.0) return half4(half3(rimAvg) * half(halo * 0.3), half(halo * 0.3));
  h = sqrt(h);
  float tt = -b - h;
  float tEnd = -b + h;
  // The turn: the waves and specks are fixed to the orb, so turning it moves them across, in depth.
  float cs = cos(spin); float sn = sin(spin);
  float3x3 Ry = float3x3(cs, 0.0, -sn, 0.0, 1.0, 0.0, sn, 0.0, cs);
  float tilt = 0.32;
  float3x3 Rx = float3x3(1.0, 0.0, 0.0, 0.0, cos(tilt), sin(tilt), 0.0, -sin(tilt), cos(tilt));
  float3x3 M = Rx * Ry;
  float3 o = ro * M;
  float3 dir = rd * M;
  bool hit = false;
  float minD = 1e9;
  for (int i = 0; i < 56; i++) {
    float d = map(o + dir * tt);
    minD = min(minD, d);
    if (d < 0.0008) { hit = true; break; }
    tt += d;
    if (tt > tEnd) break;
  }
  if (!hit) {
    float g = halo * 0.3 + exp(-minD * 18.0) * 0.18;
    return half4(half3(rimAvg) * half(g), half(g));
  }
  float3 p = o + dir * tt;
  float3 nO = nrm(p);
  float3 n = M * nO;
  float3 v = -rd;
  float facing = clamp(dot(n, v), 0.0, 1.0);
  // Rim colour by height on the orb (world space, so up stays up as it turns).
  float3 pw = M * p;
  float3 rim = mix(bottom, top, smoothstep(-0.9, 0.9, pw.y));
  // The glowing core: pale where the surface faces you, the rim colour toward the edge.
  float3 col = mix(rim, core, pow(facing, 1.6) * mix(0.92, 0.55, night));
  // Light: a soft key from the upper left, a cool rim from behind, a gentle shade underneath.
  float3 L = normalize(float3(-0.5, 0.65, 0.6));
  float dif = clamp(dot(n, L), 0.0, 1.0);
  col *= 0.84 + 0.22 * dif;
  float spec = pow(clamp(dot(n, normalize(L + v)), 0.0, 1.0), 90.0);
  col += hilite * spec * mix(0.42, 0.3, night);
  float fres = pow(1.0 - facing, 3.0);
  col = mix(col, rim * 1.15, fres * 0.55);
  col += rim * fres * 0.25;
  // Specks suspended inside the orb, in six layers of depth and fixed to it: as it turns, the near ones sweep past
  // the far ones, so it reads as a volume. Rim-coloured dust, about one in five lit, and the lit ones glint as they twinkle.
  for (int k = 0; k < 6; k++) {
    float depth = 0.03 + 0.12 * float(k);
    float3 q = (p + dir * depth) * (15.0 - 1.6 * float(k));
    float3 cell = floor(q);
    float rnd = hash3(cell + float(k) * 17.0);
    float3 f = fract(q) - 0.5 - 0.32 * float3(hash3(cell + 1.7) - 0.5, hash3(cell + 3.1) - 0.5, hash3(cell + 5.3) - 0.5);
    float speck = step(0.2, rnd) * (1.0 - smoothstep(0.08, 0.16, length(f)));
    float lit = step(0.8, rnd);
    float twinkle = 0.5 + 0.5 * sin(t * (1.2 + rnd * 2.5) + rnd * 40.0);
    float3 dust = mix(rim * 0.9, hilite, lit * 0.85);
    col = mix(col, dust, speck * (0.35 + 0.65 * twinkle) * (0.65 - 0.08 * float(k)));
    col += hilite * speck * lit * pow(twinkle, 3.0) * 0.5;
  }
  // A soft edge where the ray only grazes the surface.
  float a = smoothstep(0.0, 0.08, facing + 0.02);
  return half4(half3(col) * half(a), half(a));
}
`;
