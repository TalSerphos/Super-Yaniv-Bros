# Asset pipeline

```
art/manifest/*.yaml ──generate.ts──▶ art/raw/<id>/<quality>-<hash>/<n>.png   (candidates, gitignored)
                                         │  pick (contact sheet + judge)
                     process.ts select ──▶ art/masters/<id>.webp               (committed source)
                     process.ts build  ──▶ src/assets/<id>.webp                 (web-ready, Vite hashes it)
```

## Manifest schema
| field | meaning |
|---|---|
| `id` | unique, dotted (`title.bg`, `yaniv.small.run`) |
| `kind` | background, parallax, spritesheet, tileset, prop, ui, screen |
| `prompt` | asset-specific prompt; the style prefix from `art/prompts/style.md` is prepended |
| `refs` | reference images → uses `images/edits` (keeps style and characters consistent) |
| `size` | `1024x1024`, `1536x1024` or `1024x1536` |
| `chroma` | flat background color to key out (preferred way to get alpha) |
| `transparent` | native alpha via the alpha model (gpt-image-1.5) |
| `candidates` | images per request |
| `out` | `width`, `height`, `fit`, `position`, `trim`, `quality` for the web build; also `dir` (subfolder of `src/assets`), `colors` (palette-quantize, lossless WebP), `alphaThreshold` (default 128: hard pixel-art edges), `span` (seamless: fraction of the master width one tile covers) |
| `frame` | `{w, h}` in **world units**. Output is 2x, frames left to right in one strip (`tools/assets/sheet.ts`) |
| `grid`, `cells` | pose grid painted in the master, and which cells (reading order) become frames, in output order |
| `fit` | `mode`: `common` (one scale per sheet from the median pose height: no size jitter), `each`, `stretch`; `height`: target content height at 2x |
| `anchor`, `valign` | horizontal placement (`mass` default, `bbox`, `left` = shared left edge); vertical `bottom` (feet on the last row, default), `middle`, or `top` (hanging things) |
| `seamless: x` | crops the stretch of the master that wraps onto itself best, then crossfades the overhang into the left edge |

`kind: reference` entries (e.g. the `char.yaniv.sheet` character bible) get a master but no build output; use the
master as a `refs` image for every pose sheet of that character. Sprite poses are cut by connected component,
so a pose that pokes over a cell line still comes out whole.

Generation is cached by a hash of model + prompt + style prefix + refs + params, so re-running is free
unless something changed. `--force` regenerates. `art/cost-log.csv` records every paid call.

## Derived files
`public/favicon.png`, `public/apple-touch-icon.png` and `public/og.jpg` are cut from the title assets:
```
convert src/assets/title.bg.webp -crop 110x110+772+112 +repage -resize 64x64 -strip public/favicon.png
convert src/assets/title.bg.webp -crop 110x110+772+112 +repage -resize 180x180 -strip public/apple-touch-icon.png
convert src/assets/title.bg.webp -resize 1200x675^ -gravity center -extent 1200x630 \
  \( src/assets/title.logo.webp -resize 560x \) -gravity northwest -geometry +30+40 -composite -quality 82 -strip public/og.jpg
```
