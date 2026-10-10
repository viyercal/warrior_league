# Champion source assets

`production-references/` contains the four coherent full-body character images created with the built-in imagegen tool. `generated/` contains Microsoft's TRELLIS.2 previews, original GLBs and generation/failure records. See [the current production record](../../docs/character-art-rebuild.md) for prompts, approved upload scope, validation and remaining quota blocks.

`generate_mesh.py` uses the official public demo. For authenticated generation, run it through the Desktop credential helper with only `HF_TOKEN` selected. `prepare_character.py CHAMPION SOURCE.glb TARGET.glb` preserves the provider atlas and fits the gameplay rig using NumPy, SciPy and Pillow. It reads image pixels to assign cloth weights; it does not edit source artwork. All game assets are local after generation.

The preparation step reuses the original position buffer and stores the eighteen bone indices as unsigned bytes. Texture bytes, normalized body positions, normals, UVs and float32 weights retain their full precision. Unsupported sparse, shared or overlapping position storage is rejected before mutation. GLBs are replaced atomically after preparation succeeds.

## Resume after the free quota resets

The user chose to wait for the free quota. [production-plan.json](production-plan.json) records the pending references, fresh candidate directories, settings and integration gates. Generate Orren, then Serai, before spending the next quota window on higher-detail replacements for the two playable bodies. No automatic retry process is running.

The last provider retry delay suggests the next attempt around **September 19, 2026, 3:20 PM Pacific**. This estimate comes from the saved failure timestamp and provider message; it is not a guaranteed reset time. Start with:

```sh
python3 /Users/vivekiyer/.config/desktop-agent-secrets/desktop_env.py run --keys HF_TOKEN -- \
  /private/tmp/warrior-character-pipeline/bin/python tools/character-assets/generate_mesh.py \
  tools/character-assets/production-references/orren-rootbound.png \
  tools/character-assets/generated/orren-rootbound-hq-r1 \
  --resolution 1536 --faces 150000 --texture-size 4096 --seed 41
```

Continue with the next manifest job only after success. A quota response ends the batch. Keep the existing validated runtime GLBs until new candidates pass visual inspection, rig fitting, native gameplay checks and independent review. The Orren and Serai rig profiles remain unvalidated estimates until their actual meshes arrive.

## Historical version 3 anatomy data

This directory contains graphical data and an independently written conversion script. It does not include or execute the MakeHuman application code.

The base mesh, morph targets, skin weights and fitted eye mesh come from [MakeHuman's official repository](https://github.com/makehumancommunity/makehuman), pinned at commit `a8bc2d54ff0ac92e78ff71431b1023eda42bf482`. Those graphical assets are distributed under CC0. The upstream [asset license](https://github.com/makehumancommunity/makehuman/blob/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/LICENSE.ASSETS.md) is copied into [LICENSE.ASSETS.md](LICENSE.ASSETS.md). The application's separate code license does not apply to this copied graphical data.

[provenance.json](provenance.json) records the exact targets, weights, character proportions and source revision. [upstream-tree.json](upstream-tree.json) preserves the source tree listing. Source OBJ and eye fitting data retain their upstream formats.

Run `python3 tools/character-assets/build_anatomy.py` from the repository root with Python 3 and NumPy available. The deterministic conversion:

1. Applies different age, face shape and body targets for Caelan, Nyra and Serai.
2. Fits the matching eye mesh, normalizes each character's height, and maps source weights to thirteen gameplay bones.
3. Bakes the arms-down rest pose and grip shape, preserving independent anatomical vertices and smooth joint weights.
4. Writes indexed mesh, UV, weight, bone and material data to `src/art/anatomy/` for synchronous local loading.

The runtime loads those JSON files through Vite. No Python process, MakeHuman installation, external model service or network account is needed to play.

`texture-sources/` preserves six PNGs generated with the built-in imagegen tool: three faces, ceremonial metal, woven brocade and a hair atlas. Their prompts and reference artwork are recorded in [model-texture-prompts.json](../../docs/concepts/champions/model-texture-prompts.json) and [hair-texture-prompt.json](../../docs/concepts/champions/hair-texture-prompt.json). Runtime copies are WebP-encoded, without image content edits, in `public/models/textures/`. The brown eye atlas is CC0 MakeHuman graphical data and retains its source in `eyes/materials/`.

**Executive summary:** Character anatomy is reproducible from pinned CC0 graphical data. Custom modeling code, costume geometry, generated surface textures and the existing gameplay rig produce the playable roster locally.
