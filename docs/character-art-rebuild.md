# Unified character art production

Implemented locally on `feat/astra-immersive-realms`, September 18, 2026. This is an incomplete roster production pass: Caelan and Nyra have playable textured replacements; Orren and Serai still await mesh generation. Nothing was pushed or deployed.

Vivek subsequently approved the current Caelan and Nyra rendering and asked to keep it as the standard for character and game art in general. [The approved art standard](art-standard.md) preserves the exact visual references and their intended use. Their current bodies are an accepted baseline; completion work now brings the remaining roster to that level and evaluates further refinements against it.

The user rejected the version 3 anatomical rebuild. Its photographic face, flat armor, templated body and bright weapon outlines did not meet the desired Warforge quality. Functional tests were never evidence of visual acceptance.

## Current result

Caelan and Nyra now use complete textured 3D meshes reconstructed from coherent full-body production references through Microsoft's official [TRELLIS.2 demo](https://huggingface.co/spaces/microsoft/TRELLIS.2). The approved illustrations remain the identity and costume references. The [upstream project](https://github.com/microsoft/TRELLIS.2) provides image-conditioned geometry and PBR generation.

The preparation script preserves original UVs, normals and embedded texture bytes, normalizes each character's height, and fits eighteen gameplay and cloth anchors. A welded, smoothed weight field prevents UV seams and cloth-color boundaries from pulling apart. The runtime preserves casting hands, held/stowed equipment, clone behavior and every realm's gameplay controls. Combat and driving overrides account for the authored A-pose.

The first exports had poor facial paint and incorrectly shiny skin/hair. A local shader restores front facial detail from the exact same full-body production illustration, on the reconstructed head geometry, while retaining its side/back atlas. It also adjusts skin and hair material response. This is texture mapping on a real skinned head, not a face billboard. The diffuse tint remains active for shadow clones. Steel blades now have a raised spine and tapered edges rather than a single flat reflecting surface.

Forge customization uses the selected skin's material families plus glow/trail effects. Generic paint and cape switches were removed. Old purple-paint profiles migrate to their selected skin palette while retaining name, battle effects, equipped arts and results. Alternate skins for the two new bodies currently use curated colorways and signature weapon variations, not separately reconstructed outfits.

| Character | Current runtime | Source mesh | Status |
|---|---|---|---|
| Caelan | Version 4, 2.02 units tall | 95,744 triangles; 2K PBR atlas | Approved visual baseline; higher-detail refinement awaits quota |
| Nyra | Version 4, 1.81 units tall | 96,801 triangles; 2K PBR atlas | Approved visual baseline; higher-detail refinement awaits quota |
| Orren | Version 3 | New production reference uploaded | GPU quota blocks generation |
| Serai | Version 3 | New production reference uploaded | GPU quota blocks generation |

## Assets and provenance

All four references were generated using the built-in imagegen tool and saved in [production-references](../tools/character-assets/production-references/). Prompts are recorded in [Caelan's prompt record](concepts/champions/unified-character-prompts.json) and [the remaining roster prompt set](concepts/champions/roster-production-prompts.json). Opaque reference backgrounds are removed by the provider's preprocessing endpoint.

- Runtime meshes: [Caelan](../public/models/champions/caelan.glb), [Nyra](../public/models/champions/nyra.glb).
- Runtime facial reference maps: `public/models/textures/{caelan,nyra}-production.webp`, encoded from the same production PNGs without image-content edits.
- Original provider GLBs, preview images and generation records: `tools/character-assets/generated/`.
- Reproducible conversion: [generate_mesh.py](../tools/character-assets/generate_mesh.py), [prepare_character.py](../tools/character-assets/prepare_character.py).
- Runtime integration: [unifiedCharacters.js](../src/art/unifiedCharacters.js).

The user explicitly authorized uploads of the roster references to Microsoft's public TRELLIS.2 demo. All four references reached preprocessing. The initial command had been rejected before that authorization; no upload occurred from the rejected command. A subsequent export parameter error established the provider's 100,000-face minimum, now validated locally.

The user authorized importing a copied Hugging Face token. It was saved as `HF_TOKEN` through the Desktop credential helper without displaying or copying its value into the project. Authenticated generation exported Caelan and Nyra successfully. The signed-in free account then exhausted its GPU allowance. The provider rejected the higher-detail Caelan export and Orren/Serai generation with a quota-reset message. No alternate service or identity was used to bypass the limit.

## Verification and visual limits

- Production build passes. Its existing large JavaScript chunk warning remains. Lossless packing reduces the two prepared GLBs from 19.15 MB to 16.12 MB, saving 3,028,716 bytes (15.8%) before HTTP compression. Position storage is reused and bone indices fit in unsigned bytes. Geometry, atlas images, UVs, normals, float32 weights and bone assignments remain exactly unchanged.
- Roster browser probe: 232 checks pass across twelve skin selections, poses, clone ownership, held/stowed gear, revised effects, four champions in all seven realms, arrow movement, casting, and 900/390px layouts.
- Production lifecycle probe: 16 checks pass for delayed model loading, failed reference-texture recovery, Wraith Walk restoration, real Rift/Court clone expiry and resource disposal.
- Detail probe: 8 checks pass for rendered facial/body clone tint, old-profile migration, actual drag rotation, mobile effects and reset behavior.
- Production combat probe: 9 checks pass for real block, light/heavy attack, acceleration and steering inputs on both new characters, including their authored arm offsets.
- Independent adversarial review verified data integrity, bind accuracy, normalized weights, matching seam weights, private skeleton/texture ownership, disposal and blade geometry. Findings about unsupported controls, pose offsets and facial tint were fixed and rechecked.
- The subsequent packing pass passed 61 native browser checks. All thirty combinations of two characters, three skins and five animation poses produced byte-identical canvas screenshots compared with the prior GLBs. Sixteen production loading, retry and clone-lifecycle checks passed again after rebuilding. Independent review found a sparse-storage input guard gap; the fix now rejects that input before mutation. [Packing validation](champion-packing-validation.json) records the current hashes and evidence while retaining the earlier functional results.
- Actual neutral-studio, Forge and gameplay screenshots were inspected. Vivek approved the current Caelan and Nyra rendering as the future art benchmark. Hair, fingers and some close-up facial geometry remain refinement opportunities; the approval establishes the baseline without claiming parity with every aspect of League of Legends production.

Browser checks used isolated headless Chrome instances, without attaching to the user's Chrome session. Short frame samples do not establish hitch-free performance. Remaining version 3 characters still showed occasional first-action hitches.

## Remaining production work

1. The user chose to wait for the free quota reset. Generate Orren and Serai first from their saved references, fit their own landmarks and equipment, inspect cloth/root deformations, then enable them in the unified runtime. The current landmark profiles are unvalidated estimates, and Orren still needs his shield and hammer integrated with the new body.
2. Then regenerate/export the higher-detail Caelan candidate and reconstruct Nyra at higher resolution. Reinspect face, hair and fingers before replacing the validated local assets.
3. Repeat native gameplay and visual checks for added assets. Keep rejected candidates and the reasons for rejection in this record.
4. Review further delivery-size and level-of-detail options after the roster assets stabilize. If generated facial geometry still fails the target, explicit sculpting and retopology remain necessary.

The [production plan](../tools/character-assets/production-plan.json) records exact references, fresh candidate paths, generation settings and character-specific integration gates. Based on the last saved provider failure and its retry delay, the next attempt is estimated around September 19, 2026, 3:20 PM Pacific. This is an estimate, not a guarantee. Jobs run serially and stop on quota failure; no background retry process or overnight supervision has been launched.

**Executive summary:** Caelan and Nyra are implemented, verified and approved as the visual standard for future character and game art. All four references are uploaded. Orren and Serai still need replacements at this standard; those meshes and further refinements await provider quota.
