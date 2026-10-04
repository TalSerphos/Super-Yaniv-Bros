/**
 * Asset registry for World 5 (contract: docs/levels/w5-assets.md). Files found under src/assets/w5/ are
 * loaded; any id without a file gets a procedural placeholder, so the game always runs while art is in
 * progress. Art is 2× resolution and drawn at ART_SCALE.
 */
import type Phaser from 'phaser';

const FILES = import.meta.glob<string>('../assets/w5/*.webp', { eager: true, query: '?url', import: 'default' });
const urlFor = (id: string): string | undefined => FILES[`../assets/w5/${id}.webp`];

export interface SheetSpec {
  frame: [number, number];
  frames: string[];
}

export const SHEETS: Record<string, SheetSpec> = {
  'yaniv.small': {
    frame: [48, 64],
    frames: ['idle0', 'idle1', 'run0', 'run1', 'run2', 'run3', 'run4', 'run5', 'jump', 'fall', 'hurt'],
  },
  'enemy.trolley': { frame: [64, 56], frames: ['roll0', 'roll1', 'roll2', 'flat'] },
  'item.nut': { frame: [16, 16], frames: ['spin0', 'spin1', 'spin2', 'spin3'] },
  'block.call': { frame: [32, 32], frames: ['active', 'used'] },
  'w5.seat': { frame: [48, 64], frames: ['empty', 'sleeper', 'reader', 'kid'] },
  'hud.icons': { frame: [16, 16], frames: ['heart', 'heartEmpty', 'nut', 'plane'] },
};

export const IMAGES: Record<string, [number, number]> = {
  'w5.curtain': [64, 128],
  'w5.bg.wall': [640, 360],
  'w5.tex.floor': [64, 32],
  'w5.tex.bin': [64, 32],
};

/** Frame index by name, e.g. frameIndex('yaniv.small', 'jump'). */
export function frameIndex(sheet: string, name: string): number {
  const i = SHEETS[sheet].frames.indexOf(name);
  if (i < 0) throw new Error(`${sheet} has no frame ${name}`);
  return i;
}

/** URL of a HUD/DOM icon strip, if the art exists (the DOM HUD falls back to CSS shapes). */
export const hudIconsUrl = (): string | undefined => urlFor('hud.icons');

export const missingAssets = (): string[] => [...Object.keys(SHEETS), ...Object.keys(IMAGES)].filter((id) => !urlFor(id));

export function preloadAssets(scene: Phaser.Scene): void {
  for (const [id, spec] of Object.entries(SHEETS)) {
    const url = urlFor(id);
    if (url) scene.load.spritesheet(id, url, { frameWidth: spec.frame[0] * 2, frameHeight: spec.frame[1] * 2 });
  }
  for (const id of Object.keys(IMAGES)) {
    const url = urlFor(id);
    if (url) scene.load.image(id, url);
  }
}

/** Call in create(): builds placeholders for everything that did not load. */
export function ensurePlaceholders(scene: Phaser.Scene): void {
  for (const [id, spec] of Object.entries(SHEETS)) {
    if (scene.textures.exists(id)) continue;
    const [fw, fh] = [spec.frame[0] * 2, spec.frame[1] * 2];
    const tex = scene.textures.createCanvas(id, fw * spec.frames.length, fh)!;
    const ctx = tex.getContext();
    spec.frames.forEach((name, i) => {
      drawPlaceholderFrame(ctx, id, name, i * fw, fw, fh);
      tex.add(i, 0, i * fw, 0, fw, fh);
    });
    tex.refresh();
  }
  for (const [id, [w, h]] of Object.entries(IMAGES)) {
    if (scene.textures.exists(id)) continue;
    const tex = scene.textures.createCanvas(id, w * 2, h * 2)!;
    drawPlaceholderImage(tex.getContext(), id, w * 2, h * 2);
    tex.refresh();
  }
}

const COLORS: Record<string, string> = {
  'yaniv.small': '#1f3a8a',
  'enemy.trolley': '#334155',
  'item.nut': '#d4a017',
  'block.call': '#f59e0b',
  'w5.seat': '#0f766e',
  'hud.icons': '#dc2626',
};

function drawPlaceholderFrame(ctx: CanvasRenderingContext2D, id: string, name: string, x: number, w: number, h: number) {
  ctx.save();
  ctx.translate(x, 0);
  if (id === 'item.nut') {
    ctx.fillStyle = '#d4a017';
    ctx.beginPath();
    for (let k = 0; k < 6; k++) ctx.lineTo(w / 2 + (w / 2.4) * Math.cos((k * Math.PI) / 3), h / 2 + (h / 2.4) * Math.sin((k * Math.PI) / 3));
    ctx.fill();
    ctx.fillStyle = '#5b3a00';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 6, 0, Math.PI * 2);
    ctx.fill();
  } else if (id === 'yaniv.small') {
    // Navy polo, brown belt, jeans, red plunger: the three Yaniv colours, readable at a glance.
    const hurt = name === 'hurt';
    ctx.fillStyle = '#e0ac7a';
    ctx.fillRect(w * 0.36, h * 0.08, w * 0.3, h * 0.18);
    ctx.fillStyle = '#2b1a10';
    ctx.fillRect(w * 0.34, h * 0.05, w * 0.34, h * 0.07);
    ctx.fillStyle = hurt ? '#7f1d1d' : '#1e2a5a';
    ctx.fillRect(w * 0.3, h * 0.26, w * 0.42, h * 0.3);
    ctx.fillStyle = '#7c4a1e';
    ctx.fillRect(w * 0.3, h * 0.54, w * 0.42, h * 0.06);
    ctx.fillStyle = '#2f5b9a';
    const stride = name.startsWith('run') ? Math.sin(Number(name.slice(3)) * 1.05) * w * 0.08 : 0;
    ctx.fillRect(w * 0.32 + stride, h * 0.6, w * 0.16, h * 0.34);
    ctx.fillRect(w * 0.52 - stride, h * 0.6, w * 0.16, h * 0.34);
    ctx.fillStyle = '#5a3415';
    ctx.fillRect(w * 0.3 + stride, h * 0.92, w * 0.2, h * 0.08);
    ctx.fillRect(w * 0.5 - stride, h * 0.92, w * 0.2, h * 0.08);
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(w * 0.74, h * 0.2, w * 0.05, h * 0.3);
    ctx.fillStyle = '#d61f1f';
    ctx.fillRect(w * 0.68, h * 0.12, w * 0.17, h * 0.1);
  } else {
    ctx.fillStyle = COLORS[id] ?? '#888';
    const flat = name === 'flat' || name === 'used';
    ctx.fillRect(2, flat ? h * 0.6 : 2, w - 4, flat ? h * 0.4 - 2 : h - 4);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, flat ? h * 0.6 : 2, w - 4, flat ? h * 0.4 - 2 : h - 4);
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(10, Math.floor(w / 5))}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(name, w / 2, h / 2);
  }
  ctx.restore();
}

function drawPlaceholderImage(ctx: CanvasRenderingContext2D, id: string, w: number, h: number) {
  if (id === 'w5.bg.wall') {
    ctx.fillStyle = '#e8dcc4';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c9b99c';
    ctx.fillRect(0, 0, w, h * 0.22); // overhead bins
    ctx.fillStyle = '#ffb347';
    ctx.fillRect(0, h * 0.22, w, h * 0.02); // amber light strip
    const n = 5;
    for (let i = 0; i < n; i++) {
      const cx = (w / n) * (i + 0.5);
      const g = ctx.createLinearGradient(0, h * 0.35, 0, h * 0.62);
      g.addColorStop(0, '#6b4fa0');
      g.addColorStop(0.6, '#f08a4b');
      g.addColorStop(1, '#ffd27a');
      ctx.fillStyle = '#b8a888';
      ctx.beginPath();
      ctx.ellipse(cx, h * 0.48, w * 0.05, h * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, h * 0.48, w * 0.04, h * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (id === 'w5.tex.floor') {
    ctx.fillStyle = '#2a2b45';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffb347';
    for (let x = 6; x < w; x += 32) ctx.fillRect(x, 4, 14, 5);
    ctx.fillStyle = '#1b1c30';
    ctx.fillRect(0, h * 0.4, w, 3);
  } else if (id === 'w5.tex.bin') {
    ctx.fillStyle = '#c9c2b4';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#8f887a';
    ctx.fillRect(0, h - 6, w, 6);
    ctx.fillRect(w / 2 - 6, h / 2 - 4, 12, 8);
  } else {
    // Curtain: dark doorway with teal-lit curtain.
    ctx.fillStyle = '#1b2a3a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2dd4bf';
    for (let x = 6; x < w - 6; x += 12) ctx.fillRect(x, 10, 6, h - 10);
    ctx.strokeStyle = '#9ff';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);
  }
}
