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
5. Import selected owned Upload/Brand/font/native assets with
   import_native_project_asset. Use returned relative paths and completed import
   receipts; list/install pinned Catalog items through registered Catalog tools.
   Never pass host paths, credentials or arbitrary shell commands.
6. Only if the user asks to see changes before saving, use
   preview_native_project_candidate. Keep its exact candidate reference, inspect
   or cancel it, then save_native_project_candidate only when requested. Preview
   leaves saved source/history unchanged; save uses retained verified bytes and
   refuses stale, incomplete, expired or uncertain candidates.
7. lint_native_project_html returns selected-html-static findings and versions.
   Errors block; warnings/info advise. Full executable check_native_project is
   unsupported/unqualified, not a passed runtime/layout/contrast check. Repairs
   are deliberate source edits, never an automatic lint-repair mode.
8. capture_native_project or export_native_project starts an explicit saved-source
   job. Keep operationId/jobId/inputDigest/jobKind/generation; inspect status and
   cancel only that job. Exact retry returns its original job. UNKNOWN requires
   reconciliation; never stage a replacement or claim rollback/termination.
9. inspect_native_project_result verifies completed private bytes. Its descriptor
   needs the current authenticated connection and existing billing/export access,
   including cached bytes. For CLI output, use the same authenticated command:

   ```sh
   semlens mcp call inspect_native_project_result --input-file job.json --output-file result.mp4
   semlens mcp call inspect_native_project_candidate --input-file candidate.json --output-file preview.png
   ```

   The CLI verifies size/hash before publishing the local file; existing files
   refuse unless --overwrite is explicit. No credential is passed in JSON or
   printed. A candidate descriptor is not a saved-source result or public URL.
10. publish_native_project_preview is an explicit best-effort gallery PNG action,
    separate from job success and private downloads. It is not social publishing.

Create uses existing Create initial draft policy; edits use Edit existing designs;
capture/export/results use Export files. Status/cancel survive billing downgrade;
revoked authentication or applicable account permission still refuses. Keep all
accepted work/evidence. Source/controlled adapter checks do not establish actual
local renderer/runtime, hosted rollout or package publication.
