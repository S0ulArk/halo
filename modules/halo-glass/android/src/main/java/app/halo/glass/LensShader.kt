package app.halo.glass

/**
 * The Liquid Glass lens, in AGSL (Android 13+). It runs once per pixel of a glass's small layer, over the backdrop
 * the RenderEffect blur under it has already softened, and costs one texture sample and about forty ALU operations:
 * no loops, no second sample, the blur done by RenderEffect. In order:
 *
 *  1. The rounded rect's signed distance and the outward normal of its nearest edge (a capsule, a circle and a
 *     rounded rect all fall out of the same formula), with a one-pixel anti-aliased edge.
 *  2. The lens: the sample moves toward the centre by `shift` at the rim, fading over `band` px inward
 *     ((1 - d / band)^2.6, the profile of the mockups' displacement map), and the middle is magnified by `magnify`.
 *  3. Saturation and brightness around the sample's luma (glass makes colour richer).
 *  4. The frost: the tint laid over the backdrop, thinner in the lens band so the bending reads at the edge.
 *  5. The rim: a bright line on the edges facing the top-left light, a fainter one bottom-right, a soft inner glow
 *     and a diagonal sheen, all mixed toward white.
 *
 * Every uniform below is set by HaloGlassView.lensEffect (RuntimeShader throws on a name it doesn't declare). The
 * source was compiled and rendered over the design mockups with Skia's SkSL compiler, which AGSL is built on.
 */
internal const val LENS_AGSL = """
uniform shader content;
uniform float2 origin;
uniform float2 size;
uniform float radius;
uniform float shift;
uniform float band;
uniform float magnify;
uniform float saturation;
uniform float brightness;
uniform float4 tint;
uniform float4 rim;
uniform float dp;

half4 main(float2 coord) {
    float2 halfSize = size * 0.5;
    float2 centre = origin + halfSize;
    float2 p = coord - centre;
    float2 q = abs(p) - (halfSize - float2(radius));
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
    float inside = -sd;
    float mask = clamp(inside + 0.5, 0.0, 1.0);
    float2 side = float2(p.x < 0.0 ? -1.0 : 1.0, p.y < 0.0 ? -1.0 : 1.0);
    float2 n = (q.x > 0.0 && q.y > 0.0) ? normalize(q) : (q.x > q.y ? float2(1.0, 0.0) : float2(0.0, 1.0));
    n *= side;
    float t = 1.0 - clamp(inside / band, 0.0, 1.0);
    float bend = shift * pow(t, 2.6);
    half4 c = content.eval(centre + p * (1.0 - magnify) - n * bend);
    half l = dot(c.rgb, half3(0.2126, 0.7152, 0.0722));
    half3 rgb = clamp(mix(half3(l), c.rgb, half(saturation)) * half(brightness), half3(0.0), half3(c.a));
    half frost = half(tint.a * mix(1.0, 0.62, t));
    half4 col = mix(half4(rgb, c.a), half4(half3(tint.rgb), 1.0), frost);
    float facing = dot(n, float2(-0.7071, -0.7071));
    float line = 1.0 - smoothstep(0.0, 1.7 * dp, inside);
    float lit = line * (rim.x * smoothstep(-0.3, 0.5, facing) + rim.y * smoothstep(-0.3, 0.5, -facing));
    float glow = rim.z * (1.0 - smoothstep(0.0, 9.0 * dp, inside));
    float g = dot((coord - origin) / size, float2(0.5, 0.5));
    float sheen = rim.w * ((1.0 - smoothstep(0.0, 0.34, g)) + 0.4 * smoothstep(0.7, 1.0, g));
    half white = half(clamp(lit + glow + sheen, 0.0, 1.0));
    col.rgb = col.rgb + (half3(col.a) - col.rgb) * white;
    return col * half(mask);
}
"""
