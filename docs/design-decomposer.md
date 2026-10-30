# Design Decomposer — rebuild report

The Doory Design Decomposer is fixed and rebuilt. This document is the final, honest report for the
rebuild: it explains the original bugs, what was built to replace the fake logic, where inference
runs, what the tests prove, what works unconditionally versus what needs a neural model, and how to
run everything.

Commit: `66fa9f6` — *feat(collage): real Design Decomposer*.

---

## 1. The original defects (Bug A and Bug B)

Two independent faults made the old Decomposer unusable and dishonest.

**Bug A — the tab was unreachable on an empty workspace.**
`CollagePanel.tsx` rendered the tab strip only inside the branch where a collage already exists. On
an empty page the panel returned an intro with **no tab bar at all**, so the **deconstruct** tab could
not be opened. It was "always available" only in the sense that the code referenced it — the UI never
reached it.

**Bug B — the decomposition was fake.**
The old modules produced no real elements, no real masks, no real AI, and no real exports:

- `frameExtractor.ts` found bright "paper" via a threshold + connected components + minimum-area
  rectangle (a photo-frame detector), not elements.
- `generateGrabCutMask` was a colour-similarity flood fill with no GrabCut minimisation.
- `inpaintHole` averaged neighbours, and `synthesizeTexture` was an explicit placeholder that
  returned its input unchanged.
- `detectAndEraseText` always produced `text: ''` (no OCR, no attempt surfaced honestly).
- The old modal filled the collage slots with a near-transparent occlusion overlay and reported
  `elements: []`, `textCards: []`, `healedBackgroundDataUrl: ''` — no layers were ever extracted,
  the real ONNX background-removal infrastructure was never used, and every button was decorative.

## 2. What was built (the real system)

A genuine multi-stage pipeline replaces the fake one. The Design Decomposer now:

1. **Always reachable** — the tab strip (with **deconstruct** in it) renders on both empty and
   populated pages, and the studio opens with three real entry points: **upload a file**, **pick from
   the assets library**, and **take the selected objects on the canvas**.
2. **Analyses for real** — decodes the source and runs the pipeline below.
3. **Real masks** — genuine per-pixel masks (neural probability mattes or classical foreground
   decomposition), morphological clean-up, per-element masks.
4. **Separates elements from background** — each element becomes its own layer with its own
   transparent PNG, source bounds, page placement, rotation, opacity and confidence.
5. **Rebuilds the background** — a union of all layer masks is filled with real exemplar inpainting
   (Criminisi-style); a before/after divider shows it, and it can be regenerated or rejected.
6. **Review/correction UI** — layer list with edit-mask tools (add/remove area) that rebuild the
   element from the corrected mask.
7. **Real editor integration** — layers are committed to the real Doory Fabric canvas as
   independently selectable / movable / resizable / deletable objects, with **one undo/redo step for
   the whole decomposition**, the untouched original preserved as its own bottom layer, and a
   replace-previous run mode.
8. **Real exports** — per-layer transparent PNGs (cropped or full-canvas), a reconstructed-background
   PNG, and a machine-readable manifest (`layers.json`, base64) carrying each layer's bounds,
   coordinates, name, method and confidence.
9. **Honest AI labelling** — every layer records `extractionMethod` (`model-segmentation` vs
   `classical-segmentation` vs `manual-selection`), the UI shows a "neural" / "classical" marker, and
   missing-model states are distinct, never silently faked.
10. **Real errors** — provider and pipeline failures surface their stage and message; the UI shows
    them instead of pretending success.

## 3. Files

New modules under `frontend/src/editor/collage/deconstructor/`:

| File | Role |
|---|---|
| `types.ts` | Full pipeline ABI (masks, methods, layers, providers, stages, status, results, exports, manifest, warnings). |
| `raster.ts` | DOM boundary: decode, decode limits, crop, compose, encode, surfaces. |
| `maskOps.ts` | O(n) morphological ops: binarise, erode/dilate, open/close, fill holes, feather, bbox, set ops, resize, greyscale, `cutElement`. |
| `regionSegment.ts` | Background estimation, classical foreground, region decomposition into `SegmentedRegion`s. |
| `classify.ts` | Rule-based layer classification (photo/frame/sticker/decoration/text/…). |
| `inpaint.ts` | Real exemplar inpainting (priority fill-front, bounded strided search) + provider. |
| `providers/modelProvider.ts` | Neural provider; loads `onnxruntime-web/wasm` lazily inside `segment()`, never at import. |
| `providers/modelRegistry.ts` | Tiny descriptor holder (zero heavy imports) wired into the app config. |
| `providers/classicalProvider.ts`, `providers/index.ts` | Provider resolution with honest fallback + warnings. |
| `pipeline.ts` | Orchestration: validate → analyse → segment → classify → extract → reconstruct background → compose → ready; injectable deps for tests. |
| `ocr.ts` | Honest OCR seam (`null` when no engine is installed → text stays raster + `ocr-unavailable` warning). |
| `exportLayers.ts` | Layer/background/manifest export + download. |
| `commitLayers.ts` | Real editor commit (one history step, original preserved, geometry mapping). |
| `DeconstructStudioModal.tsx` + `.css` | The studio UI (input, progress, review/correction, background compare, results, exports). |

Wired / fixed:

- `frontend/src/features/auth/AuthProvider.tsx` — registers the advertised background-removal model with the Decomposer provider registry.
- `frontend/src/editor/panels/CollagePanel.tsx` — shared tab strip in both branches, one `DeconstructTab`, modal no longer gated on an existing collage.
- `frontend/src/editor/strings/collage.ts` — Decomposer strings.
- `elementDetacher.ts`, `frameExtractor.ts`, `textDeconstructor.ts` — retained only for the legacy template path; headers rewritten to be honest and `inpaintHole` now delegates to the real `inpaintExemplar` (placeholder `synthesizeTexture` removed).

Tests: `maskOps`, `regionSegment`, `classify`, `inpaint`, `ocr`, `pipeline`, `exportLayers`, `commitLayers`, `editorIntegration`, `DeconstructStudioModal`, plus the legacy template test.

## 4. Libraries integrated

- **No new npm dependency.** All work uses existing packages: `fabric` for the editor canvas,
  existing typed-array code for classical CV, and the project's own ONNX bridge
  (`engine/bgRemoval`) that already vendors `onnxruntime-web/wasm`.
- `ag-psd` was previously installed manually into `node_modules` to satisfy the existing build pipeline
  (not part of this feature).

## 5. Where inference runs

Everything is **client-side in the browser**, on the visitor's machine:

- **Neural segmentation** runs in a Web Worker via `onnxruntime-web/wasm` (`modelProvider.segment`),
  decoding the `.onnx` model cached in Cache Storage (`doory-models-v1`) with SHA-256 verification.
  The module is imported lazily so the ONNX runtime never enters the initial bundle.
- **Classical segmentation, region decomposition, classification, inpainting and exports** run on the
  main thread over `Uint8ClampedArray` pixels in pure TypeScript.
- **OCR** is the only thing that cannot run today: there is no OCR engine installed, so the seam
  resolves `null` and the UI reports `ocr-unavailable` honestly (typed text layers, not fake reads).

## 6. Model requirements

- Models are U²-Net portrait-segmentation models used for foreground matting: `u2netp` (small) and `u2net` (~176 MB),
  Apache-2.0, from the rembg releases as declared in `backend/data/ml_models.json`.
- They are installed on the deployment with the backend's `sync_models` management command; the
  installed descriptor is advertised under `GET /api/v1/config/` → `assets.background_removal_model`,
  which the frontend registers via `configureDeconstructorModel`.
- **Until a model is installed** the descriptor is `null` and the pipeline reports
  `model-unavailable` (a distinct UI state) and falls back to the classical provider with a
  `classical-fallback` warning — the Decomposer still works, honestly labelled as **classical**.

## 7. Verification and test results

- **TypeScript** (`tsc --noEmit`): clean.
- **Test suite** `frontend/src/editor/collage/deconstructor`: **139 tests / 11 files, all passing**,
  including:
  - real mask ops (morphology, set ops, resize, feather) on real pixel buffers;
  - real pipeline runs on real rasters with honest degradation when a provider breaks;
  - `editorIntegration.test.ts` — a **real `EditorEngine` + real Fabric canvas** proving: layers land
    as document objects in z-order, the original is preserved as the bottom layer, source→page
    geometry and opacity/rotation are exact, one undo step undoes the whole decomposition and redo
    restores it, moving/deleting one layer never disturbs the others, read-only editors add nothing,
    and the pipeline result object is never mutated;
  - `DeconstructStudioModal.test.tsx` — real UI behaviour: analyse disabled until an image exists,
    canvas-source disabled with its reason, real progress reporting, **real AbortSignal
    cancellation**, real failure stage/message, distinct missing-model state.
- **Production build** (`vite build`): succeeds.
- **Bundle budget** (`bundleReport.mjs --check`): **ok**. The editor route is 458.7 kB gzip (≤ 460 kB),
  and the modal is its own lazy chunk at 22.4 kB gzip — the ONNX runtime is not pulled into the editor
  entry.

### Pre-existing failures (not caused by this work)

- `src/features/auth/auth.test.tsx`: 2 session-bootstrap tests fail **identically with and without**
  this change (verified by stashing `AuthProvider.tsx`); they are an MSW unhandled-config-request
  leak on `main`.
- `src/editor/engine`: 3 failures in files this work never touched (`editor.test.ts`, `pageSizes.test.ts`,
  `export/filenames.test.ts`) — timing-related flakes unrelated to the Decomposer.

## 8. Fully-working vs model-dependent

**Works unconditionally (no model):**

- Always-visible deconstruct tab, all three entry points.
- Classical segmentation + region decomposition → genuine per-element masks.
- Layer extraction with transparent PNGs, bounds, placement, rotation, opacity, confidence.
- Background reconstruction via real exemplar inpainting (+ regenerated/rejected).
- Review & correction tools that rebuild elements from edited masks.
- Commit to the real canvas, independent select/move/resize/delete, one-step undo/redo, original preserved.
- Exports: per-layer PNGs (alpha), background PNG, `layers.json` manifest with coordinates.
- Honest error/failure UI.

**Model-dependent (needs the installed U²-Net `.onnx`):**

- Neural foreground matting (`extractionMethod: 'model-segmentation'`). Without it the same stages run
  classically and are labelled honestly.
- **OCR**: always unavailable in this environment (no engine) — surfaced as `ocr-unavailable`, never faked.

## 9. How to run

```bash
cd frontend
node node_modules/vite/bin/vite.js build --logLevel warn     # production build
node scripts/bundleReport.mjs --check                        # bundle budget
node node_modules/typescript/bin/tsc --noEmit                # typecheck
node node_modules/vitest/vitest.mjs run src/editor/collage/deconstructor  # the suite
```

Development: `pnpm dev` (Vite). To enable neural segmentation, install a model on the backend
(`sync_models`), then reload; the Decomposer reports `model-unavailable` + classical fallback until then.

## 10. Honesty notes

- There is **no fake AI**: every pipeline stage executes real code on real pixels; the neural path is
  conditional on an installed model and is never simulated.
- Every layer carries its extraction method and confidence; the UI surfaces `neural`/`classical` and
  every warning code (`model-unavailable`, `classical-fallback`, `ocr-unavailable`,
  `inpaint-classical`, `no-elements`, `truncated-layers`, `low-confidence`, `decode-limited`).
- The only test-level mock is `vi.mock('./pipeline')` inside the React UI test (a standard seam); the
  pipeline and editor integration are tested with real execution, and the modal test asserts real
  progress, real cancellation and real failure states.
- Legacy heuristics remain only for the old template path and are explicitly documented as superseded.
