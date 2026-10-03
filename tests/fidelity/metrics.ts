import sharp from 'sharp';

/** Resize to w×h RGB raw pixels (fills, center-crop) so images of different sizes compare. */
async function rgb(file: string | Buffer, w: number, h: number): Promise<Buffer> {
  return sharp(file).resize(w, h, { fit: 'cover' }).removeAlpha().raw().toBuffer();
}

/**
 * Palette similarity in [0,1]: histogram intersection over an 8×8×8 RGB cube.
 * 1 = identical color distribution. Insensitive to layout.
 */
export async function paletteSimilarity(a: string | Buffer, b: string | Buffer): Promise<number> {
  const [pa, pb] = await Promise.all([rgb(a, 160, 90), rgb(b, 160, 90)]);
  const hist = (p: Buffer) => {
    const h = new Float64Array(512);
    for (let i = 0; i < p.length; i += 3) h[((p[i] >> 5) << 6) | ((p[i + 1] >> 5) << 3) | (p[i + 2] >> 5)]++;
    const n = p.length / 3;
    return h.map((v) => v / n);
  };
  const [ha, hb] = [hist(pa), hist(pb)];
  let s = 0;
  for (let i = 0; i < 512; i++) s += Math.min(ha[i], hb[i]);
  return s;
}

/**
 * Composition similarity in [-1,1] (typically 0..1): mean SSIM over 8×8 windows of blurred
 * 64×36 grayscale thumbnails. Captures where big light/dark masses sit, not fine detail.
 */
export async function compositionSsim(a: string | Buffer, b: string | Buffer): Promise<number> {
  const W = 64;
  const H = 36;
  const gray = (f: string | Buffer) => sharp(f).resize(W, H, { fit: 'cover' }).blur(1).grayscale().raw().toBuffer();
  const [ga, gb] = await Promise.all([gray(a), gray(b)]);
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  let total = 0;
  let n = 0;
  for (let y = 0; y + 8 <= H; y += 4) {
    for (let x = 0; x + 8 <= W; x += 4) {
      let ma = 0, mb = 0;
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
        ma += ga[(y + j) * W + x + i];
        mb += gb[(y + j) * W + x + i];
      }
      ma /= 64;
      mb /= 64;
      let va = 0, vb = 0, cov = 0;
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
        const da = ga[(y + j) * W + x + i] - ma;
        const db = gb[(y + j) * W + x + i] - mb;
        va += da * da;
        vb += db * db;
        cov += da * db;
      }
      va /= 63;
      vb /= 63;
      cov /= 63;
      total += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      n++;
    }
  }
  return total / n;
}
