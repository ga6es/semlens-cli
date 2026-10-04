# Design Draft And Preview

## Inspect

1. Run `prepare_editor_action_context`, then inspect the page or document.
2. Use targeted tools. `inspect_uploaded_asset_identities` returns IDs, names,
   hashes and lineage.
3. Inventories contain request descriptors, not capabilities. In the full
   profile, use `inspect_design_resource_preview` for an upload/poster/logo and
   `inspect_design_asset_crop` with `expectedUpdatedAt` for crop evidence.
   Use `inspect_design_page_preview` for up to eight pages.
4. Request `includePreview: true` only for pixels.
   `pixels_materialized` proves delivery, not visual inspection; inspect the
   native image before describing visible pixels.

## Import Media Before Editing

1. For local media, run `semlens media upload` with one stable request UUID
   and `--approve-write` from a host that can read the file and authenticate to
   the same MCP endpoint. For a local batch, use a bounded JSON batch file.
   If MCP preparation returns `awaiting_bytes`, follow its `transfer` contract
   through the local CLI or an authenticated raw-byte PUT. Do not treat that
   reservation as an Uploads asset or ask for an OAuth token in chat.
2. For remote media, call `import_uploaded_assets_from_urls` with public HTTPS
   URLs and external-write approval. Treat per-item failures as independent;
   retry only failed items with their original request IDs.
3. Wait for a `ready` receipt, then reinspect each returned asset ID and
   materialize its preview. Ingestion is a
   direct Uploads action; after verification, refer to the asset ID from either
   a one-step direct edit or a typed Agent Draft action.

## Draft And Commit

1. Start a draft, inspect its action schema, then apply typed actions.
2. Inspect `preview_agent_draft_page` image content. Use
   `inspect_agent_draft_asset_crop` with the current draft version for crops.
3. Commit only after explicit approval; discard rejected changes.

For `commit_agent_draft`, generate one UUID `operationId` per approved commit.
Keep its original draft version and complete input for an uncertain retry.
The commit merges only staged semantic changes into the latest live design;
independent properties combine and the last accepted transaction wins a shared
property. Text is one property. Changed pages must still be previewed.

An explicitly requested one-step direct design command also accepts an optional
UUID `operationId`. Keep the original revision and every input field unchanged
when retrying the same intended edit. Read `outcome`, prior/current revision,
and returned structural IDs; `unchanged` does not advance the content revision.
Same key with changed input fails. Unkeyed callers and broad page/template
replacements retain strict freshness, as do export and publishing.

On retryable contention, preparation pending, or uncertain acknowledgement,
retry the same key and identical original input. On `preparation_unknown`,
same-key retry only reconciles saved output; never automatically start another
provider request. A new resource request requires a separate explicit decision.
These keys identify operations, not additional users or agent identities.

For a video page background, use a ready owned video asset with
`uploaded_asset: background`, or convert an existing video element with
`video_to_background`. `detach_background` restores a matching video element.
For a direct live edit, `set_page_background_asset`,
`set_video_element_as_page_background`, and `detach_page_background_video`
provide the corresponding paths. The existing
`detach_page_background_image` remains for image backgrounds. Background crop
uses the same `crop` target as images; playback controls only affect the editor
session and are not persisted actions.

## Guardrails

- Draft changes become live only at Agent Draft commit; a direct edit needs an
  explicit one-step request.
- Use `inspect_agent_draft` only for recovery; re-inspect stale state.
- CLI image saves require explicit `--output-file` or `--output-directory`;
  capabilities stay hidden; existing files are preserved.
- Never pass a client filesystem path through MCP JSON. Do not retry an
  uncertain ingest under a new request ID, and do not reuse an existing request
  ID for different bytes or a different normalized URL.
