# Ubuntu Mono Nerd Font — provenance

- **Source**: https://github.com/ryanoasis/nerd-fonts `releases/latest/download/UbuntuMono.zip`, fetched 2026-09-02.
- **Files taken**: `UbuntuMonoNerdFontMono-Regular.ttf`, `UbuntuMonoNerdFontMono-Bold.ttf`.
- **Variant**: the **Mono** cut, not Propo. Nerd Fonts ships proportional and fixed-width
  cuts of the same face; xterm.js measures one cell and reuses that width for every
  glyph, so the proportional cut misaligns the whole grid. Only Mono is correct here.
- **Conversion**: TTF → WOFF2 via `fontTools` (`TTFont.flavor = 'woff2'`). No subsetting —
  the Nerd glyph ranges are the reason the font is here, so dropping code points would
  defeat the purpose. 2.47 MB → 1.05 MB per weight.
- **Licence**: Ubuntu Font Licence 1.0 (`LICENCE.txt`, shipped alongside as the Fira Code
  directory does). The Nerd Fonts patching tooling is MIT.

Only Regular and Bold are bundled: xterm renders bold text but not italics.
