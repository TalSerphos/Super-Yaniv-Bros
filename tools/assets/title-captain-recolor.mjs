// Captain Machchhar on the title: black hair and moustache, a darker skin tone. Pixel recolor of the approved
// composite (no regeneration), limited to hand-measured boxes around his head and arm.
// Usage: node tools/assets/title-captain-recolor.mjs <composite.png> <out.png> [maxHairValue=0.74]
import sharp from "sharp";
const [src, out, vmaxHair] = process.argv.slice(2);
const VH = Number(vmaxHair ?? 0.74);
(async () => {
  const { data, info } = await sharp(src)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width,
    o = Buffer.from(data);
  const toHsv = (r, g, b) => {
    const mx = Math.max(r, g, b),
      mn = Math.min(r, g, b),
      d = mx - mn;
    let h = 0;
    if (d) {
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return [h, mx ? d / mx : 0, mx];
  };
  const toRgb = (h, s, v) => {
    const c = v * s,
      x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
      m = v - c;
    const [r, g, b] =
      h < 60
        ? [c, x, 0]
        : h < 120
          ? [x, c, 0]
          : h < 180
            ? [0, c, x]
            : h < 240
              ? [0, x, c]
              : h < 300
                ? [x, 0, c]
                : [c, 0, x];
    return [r + m, g + m, b + m];
  };
  const inBox = (x, y, [x0, y0, x1, y1, slope = 0]) =>
    x >= x0 && x <= x1 && y >= y0 + (x - x0) * slope && y <= y1;
  const HAIR = [
    [1283, 623, 1326, 637],
    [1336, 605, 1375, 634, 0.33],
  ];
  let nh = 0,
    ns = 0;
  for (let y = 560; y < 680; y++)
    for (let x = 1200; x < 1400; x++) {
      const i = (y * W + x) * 3;
      const [h, s, v] = toHsv(
        data[i] / 255,
        data[i + 1] / 255,
        data[i + 2] / 255,
      );
      if (HAIR.some((b) => inBox(x, y, b)) && s < 0.3 && v > 0.12 && v < VH) {
        const nv = 0.04 + 0.2 * v;
        const [r, g, b] = toRgb(25, 0.18, nv);
        o[i] = r * 255;
        o[i + 1] = g * 255;
        o[i + 2] = b * 255;
        nh++;
        continue;
      }
      if (
        inBox(x, y, [1205, 578, 1385, 665]) &&
        h >= 8 &&
        h <= 36 &&
        s > 0.35 &&
        v > 0.2
      ) {
        const [r, g, b] = toRgb(h - 2, Math.min(1, s * 1.08), v * 0.8);
        o[i] = r * 255;
        o[i + 1] = g * 255;
        o[i + 2] = b * 255;
        ns++;
      }
    }
  await sharp(o, { raw: { width: W, height: info.height, channels: 3 } })
    .png()
    .toFile(out);
  console.log("hair px", nh, "skin px", ns);
})();
