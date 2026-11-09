const VERTEX = `in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}`;

const SCANLINE = `in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform float uAmount;
uniform float uTime;
void main(void) {
  vec4 c = texture(uTexture, vTextureCoord);
  float line = 0.5 + 0.5 * sin(vTextureCoord.y * uInputSize.y * 1.2 + uTime * 8.0);
  c.rgb *= 1.0 - uAmount * 0.35 * line;
  c.rgb += uAmount * 0.08 * vec3(0.3, 0.8, 1.0) * c.a;
  finalColor = c;
}`;

const GLITCH = `in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uAmount;
uniform float uTime;
float rnd(float x) { return fract(sin(x * 12.9898) * 43758.5453); }
void main(void) {
  vec2 uv = vTextureCoord;
  float tick = floor(uTime * 12.0);
  float band = floor(uv.y * 24.0);
  float shift = (rnd(band + tick) - 0.5) * 0.06 * uAmount * step(0.7, rnd(band * 3.1 + tick));
  float split = 0.006 * uAmount;
  vec4 r = texture(uTexture, uv + vec2(shift + split, 0.0));
  vec4 g = texture(uTexture, uv + vec2(shift, 0.0));
  vec4 b = texture(uTexture, uv + vec2(shift - split, 0.0));
  finalColor = vec4(r.r, g.g, b.b, max(max(r.a, g.a), b.a));
}`;

export type FilterKind = 'grayscale' | 'sepia' | 'silhouette' | 'scanline' | 'glitch' | 'blur';

// Inferred look: the game's filters are render-texture shaders; these reproduce each effect's intent, scaled by its amount.
export class FilterStack {
  readonly amounts: Record<FilterKind, number> = { grayscale: 0, sepia: 0, silhouette: 0, scanline: 0, glitch: 0, blur: 0 };
  private built: Partial<Record<FilterKind, any>> = {};
  // RenderTextureMeshRenderer `_Color.a`: applied to the whole character after its filters, so overlapping slots don't show through.
  opacity = 1;
  private opacityFilter: any = null;

  constructor(private readonly PIXI: any, private readonly target: () => any, private readonly pixel: () => number) {}

  private make(kind: FilterKind): any {
    const { PIXI } = this;
    if (kind === 'grayscale' || kind === 'sepia' || kind === 'silhouette') {
      const filter = new PIXI.ColorMatrixFilter();
      if (kind === 'grayscale') filter.greyscale(0.4, false);
      else if (kind === 'sepia') filter.sepia(false);
      else filter.matrix = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0];
      return filter;
    }
    if (kind === 'blur') return new PIXI.BlurFilter({ strength: 0, quality: 3 });
    return new PIXI.Filter({
      glProgram: PIXI.GlProgram.from({ vertex: VERTEX, fragment: kind === 'scanline' ? SCANLINE : GLITCH }),
      resources: { fx: { uAmount: { value: 0, type: 'f32' }, uTime: { value: 0, type: 'f32' } } },
    });
  }

  apply(time: number): void {
    const target = this.target();
    if (!target) return;
    const list: any[] = [];
    for (const kind of Object.keys(this.amounts) as FilterKind[]) {
      const amount = this.amounts[kind];
      if (amount <= 0.001) continue;
      const filter = this.built[kind] ??= this.make(kind);
      if (kind === 'blur') filter.strength = amount * 6 * this.pixel();
      else if (kind === 'scanline' || kind === 'glitch') {
        filter.resources.fx.uniforms.uAmount = amount;
        filter.resources.fx.uniforms.uTime = time;
      } else filter.alpha = Math.min(1, amount);
      list.push(filter);
    }
    if (this.opacity < 0.999) {
      this.opacityFilter ??= new this.PIXI.AlphaFilter({ resolution: 'inherit' });
      this.opacityFilter.alpha = this.opacity;
      list.push(this.opacityFilter);
    }
    target.filters = list.length ? list : null;
  }

  get active(): boolean {
    return Object.values(this.amounts).some((v) => v > 0.001);
  }
}
