# Native project editing and private results

1. Inspect capabilities and authorization through the intended connection.
   Normal plugin/manual/CLI setup includes native tools. Discovery is bounded;
   follow nextCursor or select known operation IDs when inspecting capabilities.
   For an older explicit tool allowlist, preview `semlens mcp repair codex
   --profile starter` and review its bounded change before an authorized --apply.
   Do not silently replace a deliberately customized tool set or add a second
   connection. Refresh/reconnect the affected host after its config is updated.
2. Use create_native_project with a retained requestId, or open_native_project
   for an existing owned project. Keep the exact runtimeGeneration. Reading or
   opening source never starts a render or mints browser authority.
3. Read selected ordinary files with read_native_project_files and the two
   authored Studio manifests with read_native_project_sidecars. Preserve exact
   returned versions, including quoted hashes. Paths and byte limits are strict.
4. Requested ordinary edits use save_native_project_files or
   save_native_project_sidecars DIRECTLY. Keep one operation UUID for exact
   retry; source save distinguishes explicit create/replace intent. Do not add
   a separate owner proposal approval or per-file Semlens confirmation. The
   connected host's own approval policy and existing account permissions apply.
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
   For new local media bytes, use prepare_native_project_media_upload with the
   exact filename, byte count and SHA-256. Its descriptor grants no authority:
   POST one multipart file to the same server with current OAuth and the
   base64url-encoded selection in x-semlens-native-selection. The supported CLI
   path computes the commitment and streams it for you:
   `semlens mcp call prepare_native_project_media_upload --input-file target.json --file audio.wav --approve-write`.
   Here target.json contains only projectId/runtimeGeneration. Native signature,
   path and byte limits still apply; valid metadata does not prove media decode.
   Exact same-byte/name retries reuse the native receipt and cannot overwrite.
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
   imageExportRequest (compositionPath,format png/jpg/zip and exact frame/scenes
   selection). ZIP follows the frozen Studio scene order; selection chooses scenes and offsets. These share Studio's
   frozen exporters; no client conversion or second rendering service is used.
   Keep operationId/jobId/inputDigest/jobKind/generation; inspect status and
   cancel only that job. Exact retry returns its original job. UNKNOWN requires
   reconciliation; never stage a replacement or claim rollback/termination.
9. inspect_native_project_result verifies completed private bytes. Its descriptor
   needs the current authenticated connection and existing billing/export access,
   including cached bytes. For CLI output, use the same authenticated command:

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
verified result through native source versions and history. TTS alignment can
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
