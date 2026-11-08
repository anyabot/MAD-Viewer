import { valueAt, type Particle } from '@/components/skinViewer/particles';
import type { EmoteEmitter } from '@/lib/emoticons';

const VERTEX = `in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main(void) {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}`;

// FX Shader Graphs (1.11.6 GLES3): main at Unity uv * tile + offset, times sRGB(_HDR_Color) when HDR is on, times vertex colour;
// alpha = main.a * vertex.a * mask channel * _Alpha_STR. Pixi textures are premultiplied, so the main colour is un-premultiplied first.
const FRAGMENT = `in vec2 vUV;
out vec4 finalColor;
uniform sampler2D uMain;
uniform sampler2D uMask;
uniform vec4 uTileOffset;
uniform vec4 uHdr;
uniform vec4 uVertexColor;
uniform vec4 uFlags;
float srgb(float c) { return c <= 0.0031308 ? c * 12.9232101 : 1.05499995 * pow(abs(c), 0.416666657) - 0.0549999997; }
void main(void) {
  vec2 unity = vec2(vUV.x, 1.0 - vUV.y);
  vec2 sampled = uFlags.x > 0.5 ? unity * uTileOffset.xy + uTileOffset.zw : unity;
  vec4 main = texture(uMain, vec2(sampled.x, 1.0 - sampled.y));
  vec3 straight = main.a > 0.0 ? main.rgb / main.a : vec3(0.0);
  vec3 hdr = vec3(srgb(uHdr.r), srgb(uHdr.g), srgb(uHdr.b));
  vec3 color = mix(straight, straight * hdr, uHdr.w) * uVertexColor.rgb;
  float mask = 1.0;
  if (uFlags.y > 0.5) {
    vec4 m = texture(uMask, vUV);
    float masked = uFlags.y > 1.5 ? (m.a > 0.0 ? m.r / m.a : 0.0) : m.a;
    mask = masked * uFlags.z;
  }
  float alpha = main.a * uVertexColor.a * mask;
  finalColor = vec4(min(color, vec3(1.0)) * alpha, alpha);
}`;

export type GraphQuad = {
  mesh: any;
  // a quad from its top-left corner, or (mesh mode) the caller's own positions already written to `positions`
  draw: (left: number, top: number, w: number, h: number, particle: Particle) => void;
  shade: (particle: Particle) => void;
  positions: Float32Array;
  commit: () => void;
};

// One particle drawn by its emitter's Shader Graph; `main` is the whole sheet, `mask` the alpha texture (clamped), `shape` mesh-mode geometry.
export function createGraphQuad(PIXI: any, def: EmoteEmitter, main: any, mask: any | null, shape?: { uvs: number[]; tris: number[]; count: number }): GraphQuad {
  const graph = def.shaderGraph!;
  main.source.style.addressMode = 'repeat';
  const uniforms = new PIXI.UniformGroup({
    uTileOffset: { value: new Float32Array([1, 1, 0, 0]), type: 'vec4<f32>' },
    uHdr: { value: new Float32Array([...graph.hdr, graph.hdrOn ? 1 : 0]), type: 'vec4<f32>' },
    uVertexColor: { value: new Float32Array([1, 1, 1, 1]), type: 'vec4<f32>' },
    uFlags: {
      value: new Float32Array([graph.tile ? 1 : 0, !graph.maskChannel || !mask ? 0 : graph.maskChannel === 'r' ? 2 : 1, graph.alphaStrength, 0]),
      type: 'vec4<f32>',
    },
  });
  const shader = new PIXI.Shader({
    glProgram: PIXI.GlProgram.from({ vertex: VERTEX, fragment: FRAGMENT }),
    resources: { graph: uniforms, uMain: main.source, uMask: (mask ?? main).source },
  });
  const geometry = new PIXI.MeshGeometry({
    positions: new Float32Array(shape ? shape.count * 2 : 8),
    uvs: new Float32Array(shape ? shape.uvs : [0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint32Array(shape ? shape.tris : [0, 1, 2, 0, 2, 3]),
  });
  const mesh = new PIXI.Mesh({ geometry, shader });
  mesh.eventMode = 'none';
  mesh.blendMode = def.blend ?? 'normal';
  const positions = geometry.getBuffer('aPosition').data as Float32Array;
  const commit = () => geometry.getBuffer('aPosition').update();
  const shade = (particle: Particle) => {
      const u = uniforms.uniforms;
      if (graph.tile && graph.offset) {
        u.uTileOffset[0] = valueAt(graph.tile[0], particle.life, particle.pick);
        u.uTileOffset[1] = valueAt(graph.tile[1], particle.life, particle.pick);
        u.uTileOffset[2] = valueAt(graph.offset[0], particle.life, particle.pick);
        u.uTileOffset[3] = valueAt(graph.offset[1], particle.life, particle.pick);
      } else {
        u.uTileOffset.set([0, 0, 0, 0]);
      }
      u.uVertexColor[0] = Math.min(1, Math.max(0, particle.r));
      u.uVertexColor[1] = Math.min(1, Math.max(0, particle.g));
      u.uVertexColor[2] = Math.min(1, Math.max(0, particle.b));
      u.uVertexColor[3] = Math.min(1, Math.max(0, particle.a));
      mesh.visible = true;
  };
  return {
    mesh,
    positions,
    commit,
    shade,
    draw: (left, top, w, h, particle) => {
      positions.set([left, top, left + w, top, left + w, top + h, left, top + h]);
      commit();
      shade(particle);
    },
  };
}
