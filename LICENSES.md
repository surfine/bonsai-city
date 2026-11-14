# Licences of the files in this repository

The code and the art in this repository are original work of the project and
are licensed under the MIT licence (see `LICENSE`). This table lists, file by
file, what each asset and each format-related module is, where it came from
and under which licence it ships.

- No file in this repository is under the GPL or the AGPL.
- No file contains data copied from a commercial game (artwork, palettes or
  city files). The modules that read or write classic city files (`.cty`,
  `.sc2`, `SC2000.DAT`) carry format facts only — layouts, id ranges and
  mappings — learned from public format notes, among them SC2k-docs
  (CC BY-SA 4.0). A player's own game files are read at run time and are
  never part of this repository.
- The voxel models (`assets/voxel-models.json`) and the tool icon sheet are
  baked by the project's own tools from its own voxel catalog.
- `assets/source-art/city-materials-v1.png` is a reference plate generated
  with an AI image tool for this project; the generating model was not
  recorded. It and its prompt ship under the same MIT licence.

## Files


### `assets/`

| path | what it is | where it came from | licence | redistributable in public MIT repo? |
| --- | --- | --- | --- | --- |
| `assets/provenance.json` | Provenance manifest for the Canvas atlas family, source artwork, hashes | Project authoring record | States `"license": "MIT"`, `"source": "original"` | yes (project claim) |
| `assets/atlas-north.png` | North-facing isometric sprite atlas PNG (build output) | Generated from project recipes / voxel bake (AI System 6 atlas tools; shipped built) | MIT (via provenance / metadata) | yes (project claim) |
| `assets/atlas-east.png` | East-facing atlas PNG | Same generator family | MIT (via provenance) | yes |
| `assets/atlas-south.png` | South-facing atlas PNG | Same generator family | MIT (via provenance) | yes |
| `assets/atlas-west.png` | West-facing atlas PNG | Same generator family | MIT (via provenance) | yes |
| `assets/atlas.png` | Atlas PNG; **byte-identical** to `atlas-north.png` (SHA-256 match verified) | Same family; retained alias / default URL | MIT (via provenance of north) | yes |
| `assets/atlas-metadata.json` | Frame packing metadata, directions, `toolIcons` map | Written by atlas bake | Top-level `"license": "MIT"`, `"source": "original"` | yes |
| `assets/atlas-source.json` | Declarative micro-voxel / texture recipes + palette | Project-authored recipes | `"license": "MIT"`, `"source": "original"`, `"author": "AI System 6"` | yes |
| `assets/textures.json` | Texture/material manifest for micro-voxel atlas | Built by the texture-atlas tool from `atlas-source.json` + material plate | `"license": "MIT"`, `"source": "original"`, `"author": "AI System 6"` | yes |
| `assets/textures.png` | 512×512 colour texture atlas PNG | Same texture build | MIT (via `textures.json` / build notes) | yes |
| `assets/texture-masks.png` | Material mask atlas (glass / night emission channels) | Same texture build | MIT (via texture provenance) | yes |
| `assets/tool-icons.png` | Toolbar icon sheet baked from the same voxel models | Atlas bake icon step | MIT implied by atlas provenance / metadata `toolIcons` (sheet has no separate licence file) | yes (project claim) |
| `assets/voxel-models.json` | Packed voxel model index + blob for 3D view | Written by atlas bake from authored models | **unknown on the artefact** (no licence field); project treats as original build output | unknown — looked at: parsed keys (no `license`/`source`/`author`); `provenance.json` notes about voxel frames; bake path named in provenance `tool` |
| `assets/source-art/city-materials-v1.png` | 4×4 material swatch plate used as texture authoring source | Generated with `image_gen.imagegen`; model version unknown | MIT per `provenance.json` `sourceArtwork` | yes (project claim); model identity unknown |
| `assets/source-art/city-materials-v1.prompt.txt` | Prompt text that produced the plate | Same authoring session | Project text; no separate licence line in the prompt file | yes (project claim, as companion to the plate) |

### `vendor/`

| path | what it is | where it came from | licence | redistributable in public MIT repo? |
| --- | --- | --- | --- | --- |
| `vendor/bonsai-renderer.js` | Lazy ESM bundle: subset of **three.js** only (exports match entry; eof licence names `three/build/three.core.js` and `three/build/three.module.js`) | Built from `tooling/vendor/bonsai-renderer-entry.mjs` via `tooling/build-bonsai-renderer-vendor.mjs` bundling npm `three`. Resolved `node_modules/three` **0.185.1**. Bundle registers `three.js` revision **185**. | MIT (Three.js Authors); SPDX in bundle eof | yes |

### Code with third-party origin or third-party format contact

| path | what it is | where it came from | licence | redistributable in public MIT repo? |
| --- | --- | --- | --- | --- |
| `shared/bonsai-micropolis-codec.js` | Micropolis → Bonsai save importer; embeds classic tile id number table | Project clean-room mapping; tile ids described as public classic SimCity format facts (not GPL engine code) | Project MIT path; no third-party licence header in file | yes per project provenance notes; **unknown** whether a third party disputes republishing numeric tile-id tables |
| `shared/bonsai-micropolis-export.js` | Bonsai → Micropolis save exporter | Same decision / format-fact basis | Project MIT path | yes per project notes (same caveat as inbound) |
| `shared/micropolis-cty-codec.js` | Classic `.cty` encode/decode (27,120-byte layout) | Clean-room from public classic city-file layout notes; no city file bundled | Project MIT path | yes per header / LEGAL `.cty` paragraph |
| `shared/bonsai-sc2-codec.js` | `.sc2` encode/decode | Clean-room from OpenCity2k/SC2k-docs facts (CC BY-SA 4.0 *document*; facts in project’s own words) | Project MIT code; attribution to SC2k-docs for facts used | yes per LEGAL (code); SC2k-docs text itself must not be copied |
| `shared/bonsai-sc2000-reader.js` | `SC2000.DAT` container reader | Clean-room from Krusher 2017 notes (CC BY-SA) + QuickBMS confirmation; facts in own words | Project MIT code | yes per SC2000-DAT-FORMAT “What may be adopted” (cited in prior inventory / LEGAL) |
| `shared/bonsai-sc2k-palette.js` | SC2K master-palette mapper (runtime BMP) | Clean-room from SC2k-docs sprite/palette addressing facts | Project MIT code | yes per project docs |
| `shared/bonsai-large-dat-reader.js` | Windows 95-style sprite-file (`LARGE.DAT` etc.) reader | Clean-room from SC2k-docs sprite spec facts | Project MIT code | yes per project docs |
| `shared/bonsai-osm-import.js` | Maps Overpass/OSM feature JSON + heights into a Bonsai payload | Project mapper; runtime map data is ODbL (not committed here). Server fetch is outside this tree. | Project MIT code; imported *data* is ODbL-1.0 with attribution stamped into save provenance | yes for the code; OSM extracts must not be committed |
| `shared/bonsai-renderer-voxel.js` | Voxel render backend; dynamic-imports `vendor/bonsai-renderer.js` | Project code; loads MIT three subset | Project MIT code + MIT vendor | yes |
| `shared/city-demand-gauge.js` | Shared RCI demand gauge drawing (Bonsai + Micropolis panel sizes) | Project-authored; glyph bitmaps described as original | Project MIT / header claims CC0 for 5×7 glyphs | yes |
| `joyride/joyride-radio.js` | In-car radio: three synthesized stations (Web Audio); no sample bank | Project-authored; local mulberry32 PRNG; no remote media | Project MIT; no third-party media licence | yes |

### Fonts

| path | what it is | where it came from | licence | redistributable in public MIT repo? |
| --- | --- | --- | --- | --- |
| *(none shipped)* | No font binary (`.woff` / `.ttf` / `.otf`) under this tree. `ais6-bridge.js` can inject host-supplied `@font-face` rules from appearance when embedded. | n/a | n/a | n/a |

---
