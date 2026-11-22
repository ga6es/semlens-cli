# Native project editing and private results

## Preview a saved page

Call `inspect_native_project_preview` with `projectId` to see the first saved page
at 0 seconds. For a specific page in a prepared project, first call
`inspect_native_project_read_target` with its `projectId`. Pass the project ID
and returned `target.runtimeGeneration` to `list_native_project_pages`, then
pass a saved page path as `pageId` and a `timeSeconds` value to
`inspect_native_project_preview`. The preview renders one private inline image
and returns the saved revision and a Studio link. Ordinary source reads do not
render. Standalone Capture and gallery preview publication are unavailable
through MCP.

```sh
semlens mcp call inspect_native_project_preview --input-file frame.json --output-file preview.png
```

1. Inspect capabilities and authorization through the intended connection.
   Normal plugin/manual/CLI setup includes native tools. Discovery is bounded;
   follow nextCursor or select known operation IDs when inspecting capabilities.
   For an older explicit tool allowlist, preview `semlens mcp repair codex
   --profile starter` and review its bounded change before an authorized --apply.
   Do not silently replace a deliberately customized tool set or add a second
   connection. Refresh/reconnect the affected host after its config is updated.
2. For read-only work on a prepared project, use
   `inspect_native_project_read_target` and retain the returned runtime
   generation. For requested creation or preparation, use create_native_project
   with a retained requestId or open_native_project for an existing owned project.
   Keep the exact runtimeGeneration. Reading or opening source never starts a
   render or mints browser authority.
3. Read selected ordinary files with read_native_project_files and the two
   authored Studio manifests with read_native_project_sidecars. Preserve exact
   returned versions, including quoted hashes. Paths and byte limits are strict.
   If CLI redaction withholds any part of an exact source read, stop using that
   payload for an edit. A returned version does not establish that the displayed
   text is complete.
4. Requested ordinary edits use save_native_project_files or
   save_native_project_sidecars DIRECTLY. Keep one operation UUID for exact
   retry; source save distinguishes explicit create/replace intent. Do not add
   a separate owner proposal approval or per-file Semlens confirmation. The
   connected host's own approval policy and existing account permissions apply.
   For a shared page, call `apply_native_project_edits` with the explicit
   `pageId` (saved page path), source `baseVersion`, and one `operationId`.
   Each edit names a background property or a stable element ID and its
   authored before and after values. Distinct supported inline properties and
   disjoint plain-text changes can merge. Keep the submitted draft on conflict.
   Call `read_native_project_changes` with the last cursor. When it returns
   `needsSnapshot`, read saved source and continue from `nextCursor`.

   ```sh
   semlens mcp call apply_native_project_edits --input-file edit.json --approve-write
   semlens mcp call read_native_project_changes --input-file changes.json
   ```

   For files over 64 KiB, use `read_native_project_source_range` with the
   project, generation, and path. Read successive `nextStart` offsets with
   the first result's `version` as `expectedVersion`. The read stops at
   `nextStart: null`. Use `splice_native_project_source` with the exact
   version, a stable operation UUID, and `start`, exclusive `end`, and
   `replacement`. Offsets count UTF-16 code units. One splice accepts up to
   64 KiB of replacement text and saves through normal CAS and history for
   files up to 2 MiB. CLI example:

   ```sh
   semlens mcp call read_native_project_source_range --input-file range.json
   semlens mcp call splice_native_project_source --input-file splice.json --approve-write
   ```

   To reverse your own unchanged source edit, retain its before/after bytes,
   confirm the current bytes still equal your after state, then conditionally
   save the before bytes using the current version. Redo uses the same rule in
   reverse. Reconcile intervening edits instead of overwriting them. Each save
   records a new history group. Arbitrary history-entry browsing and restore
   are unavailable; history-health inspection does not expose them.
5. Import selected owned Upload/Brand/font/native assets with
   import_native_project_asset. Use returned relative paths and completed import
   receipts; list/install pinned Catalog items through registered Catalog tools.
   Never pass host paths, credentials or arbitrary shell commands.
   App font discovery is outside the bounded default profile. For an existing
   manual CLI-managed connection, preview `semlens mcp setup codex --profile full`,
   apply only an authorized change, and reload the client. This grants no permissions.
   Never add a manual connection alongside an installed plugin. If that plugin
   cannot expose the font tool, report its catalog limitation instead.
   Discover app fonts with `list_native_project_fonts` using the project ID and
   current runtime generation. Select the exact returned family and variant
   tuple; pass `nextCursor` as `after` until it is null to inspect all matches.
   Discovery is read-only public metadata and never imports a font. Import the
   supported app-font tuple separately before using its returned native path.
   For new local media bytes, use prepare_native_project_media_upload with the
   exact filename, byte count and SHA-256. Its descriptor grants no authority:
   POST one multipart file to the same server with current OAuth and the
   base64url-encoded selection in x-semlens-native-selection. The supported CLI
   path computes the commitment and streams it for you:
   `semlens mcp call prepare_native_project_media_upload --input-file target.json --file audio.wav --approve-write`.
   Here target.json contains only projectId/runtimeGeneration. Native signature,
   path and byte limits still apply; valid metadata does not prove media decode.
   Exact same-byte/name retries reuse the native receipt and cannot overwrite.
   Use `list_native_project_pages` with the project ID and current generation
   for saved order and its version.
   `mutate_native_project_page` accepts a `request` with action `add`,
   `duplicate`, `move`, or `remove`, an operation UUID, and the Pages
   `expectedVersion`. Include the page `path` for duplicate, move, and remove.
   A move uses `direction: -1` or `1`. For resize, pass `pagePath`,
   the page's source version, width, height, and mode `fit` or `canvas`
   to `resize_native_project_page`. Use `insert_native_project_scene`
   with the target parent path and version, placement start and track, and
   a blank or copied child request. Discover the exact input schema for the
   tool and call it with `semlens mcp call <tool> --input-file <file>`.
   Writes require the CLI's `--approve-write`. On an uncertain outcome, read
   back the saved structure and history before deciding whether to try again.
   Catalog install returns `primaryHtml`, `placementKind`, and
   `defaultDuration`. For the YouTube Lower Third, install `yt-lower-third`
   once per intended instance. Read the returned child path, edit that copy's
   text or reference an owned avatar asset, then save at the exact version.
   Place an overlay in the parent with a unique host ID, the returned
   `data-composition-src`, `data-timeline-role="overlay"`, and authored start,
   duration, and track. Keep host and child size and timing consistent. An
   install receipt means the files are present. Read the parent to confirm
   placement and avoid repeating an install whose outcome is uncertain.
   Use `query` to search the catalog. Set `includeUnavailable: true` to
   inspect an item with `installable: false` and its qualification blockers.
   Use `list_native_project_elements` to find Studio shapes, frames, grids,
   static graphics, and reusable graphics. Pass the returned `category` and
   use the returned `id` as `presetId` in `place_native_project_element`, with the target source path,
   composition ID, exact source version, and operation UUID. The service
   handles required built-in media. Read back the returned element ID to
   target the next edit.
   To move an ordinary visual clip to another track, use
   `move_native_project_clip_track` with the composition path, exact source
   version, element ID, destination track, and operation UUID. The command
   preserves clip timing and refuses overlaps or clips with linked media,
   scene sequences, or active crossfades.
6. Only if the user asks to see changes before saving, use
   preview_native_project_candidate. Keep its exact candidate reference, inspect
   or cancel it, then save_native_project_candidate only when requested. Preview
   leaves saved source/history unchanged; save uses retained verified bytes and
   refuses stale, incomplete, expired or uncertain candidates.
7. lint_native_project_html returns selected-html-static findings and versions.
   Errors block; warnings/info advise. Full executable check_native_project is
   unsupported/unqualified, not a passed runtime/layout/contrast check. Repairs
   are deliberate source edits, never an automatic lint-repair mode.
8. export_native_project accepts preview.kind render-mp4 with renderProfile, or image-export with
   imageExportRequest (compositionPath, format png/jpg/zip, and a frame,
   scenes, or Pages selection). For Pages, use `compositionPath: "index.html"`
   and `selection: {kind: "pages", paths: [...]}` with saved page paths. Choose
   PNG or JPG for one page, or ZIP for two to 32 pages. A Pages ZIP follows
   the saved page order and captures each page at frame zero. Scene selection
   supplies scene IDs and offsets. These share Studio's
   frozen exporters; no client conversion or second rendering service is used.
   Keep operationId/jobId/inputDigest/jobKind/generation; inspect status and
   cancel only that job. Exact retry returns its original job. UNKNOWN requires
   reconciliation; never stage a replacement or claim rollback/termination.
   If a lost/UNKNOWN response omitted jobId/inputDigest, call
   inspect_native_project_job with only projectId/runtimeGeneration/operationId.
   It returns the original full reference and status only for the same current
   owner/principal. Missing or ambiguous evidence remains UNKNOWN; retain the
   UUID and inspect again without submitting a replacement. Full job references
   remain supported. A private PNG/JPG frame or ordered ZIP uses frozen saved
   source at admission and requires no publication.
9. inspect_native_project_result verifies completed private bytes. Its descriptor
   needs the current authenticated connection and existing billing/export access,
   including cached bytes. For completed PNG, JPG, ZIP, and MP4 downloads, use
   the authenticated CLI with `--output-file` and the matching extension.

   ```sh
   semlens mcp call inspect_native_project_result --input-file job.json --output-file result.mp4
   semlens mcp call inspect_native_project_result --input-file image-job.json --output-file images.zip
   semlens mcp call inspect_native_project_candidate --input-file candidate.json --output-file preview.png
   ```

   The CLI verifies size/hash before publishing the local file; existing files
   refuse unless --overwrite is explicit. No credential is passed in JSON or
   printed. A candidate descriptor is not a saved-source result or public URL.

## Narration and captions

Inspect standard voices and transcription availability with
inspect_native_speech_configuration. quote_native_project_speech validates the
exact owned composition/source versions and prepares transcription input without
calling the generation provider. Keep its full quote and operation UUID. Explain
the returned credit cost before submission. Submit that unchanged quote only
when the user has approved the spending; an existing explicit budget covers it
when the requested action and quoted cost remain within that authorization.
Ask again only if scope or cost exceeds it. Exact replay reuses its job; never
replace an UNKNOWN operation or submit a second transcription for TTS captions.

inspect_native_project_speech returns bounded alignment/word and transcript
pages with explicit next offsets. Status and cancel_native_project_speech need
no new charge. verify_native_project_speech decodes an existing retained
candidate; it does not generate again. apply_native_project_speech publishes the
verified result through native source versions and history. For a new
transcription, set `application.captionLayout` to `"phrases"`. Group the saved
words into short cues, breaking at sentence endings, a pause of at least 0.5 s,
42 characters, or the next word starting 3 s into the cue. Preserve source text
and word times. Start and end each cue at the first and last word, add the clip
offset to the cue times, and keep word offsets relative to their cue. Give all
cues from the clip one caption group. Report missing timing before placement.
Retry a previously accepted application with its original payload. TTS alignment can
create editable captions without another transcription call. Keep every
application UUID stable for retries and re-read changed source before edits.

retrieve_native_project_speech_audio returns a protected descriptor. Use
`semlens mcp call retrieve_native_project_speech_audio --input-file audio.json --output-file voiceover.mp3`
to verify and save private audio bytes. Current authentication, ownership and
edit/billing access apply to cached bytes too. recover_native_project_speech_intent
only rebinds a provably unadmitted intent after generation change; it refuses
existing jobs/custody and does not quote, submit or renew the original authority.

Create uses existing Create initial draft policy; edits use Edit existing designs;
export/results use Export files. Status/cancel survive billing downgrade;
revoked authentication or applicable account permission still refuses. Keep all
accepted work/evidence. Source/controlled adapter checks do not establish actual
local renderer/runtime, hosted rollout or package publication.

### Caption styles

Use `list_native_caption_styles` with the owned project ID and prepared
`runtimeGeneration` to discover built-in preset IDs, configured Brand roles,
and word timing requirements. Brand role IDs start with `brand:`.
Include `composition: { path, compositionId }` to read its current version.
If you are adding captions from speech, use the existing speech workflow and
choose `captionMode: "word-highlight"` for a word-timed preset. Preserve the
new cue IDs from the applied composition and use those IDs in the style call.

Call `apply_native_caption_style` with the project and generation, composition
path and ID, expected source version, preset ID, and a stable operation UUID.
Use `cueIds` to style only the specified cues. Omit it to style the whole
composition. Styling uses no speech credits. If a timed style is incompatible,
keep the saved captions and report the missing word timing.

The CLI exposes both tools through `semlens mcp call`. Pass the request with
`--input-file` and use `--approve-write` for the style application.
