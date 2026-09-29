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
   and `--approve-write`. For a local batch, use a bounded JSON batch file.
2. For remote media, call `import_uploaded_assets_from_urls` with public HTTPS
   URLs and external-write approval. Treat per-item failures as independent;
   retry only failed items with their original request IDs.
3. Reinspect each returned asset ID and materialize its preview. Ingestion is a
   direct Uploads action; after verification, refer to the asset ID from either
   a one-step direct edit or a typed Agent Draft action.

## Draft And Commit

1. Start a draft, inspect its action schema, then apply typed actions.
2. Inspect `preview_agent_draft_page` image content. Use
   `inspect_agent_draft_asset_crop` with the current draft version for crops.
3. Commit only after explicit approval; discard rejected changes.

## Guardrails

- Live changes occur only at Agent Draft commit.
- Use `inspect_agent_draft` only for recovery; re-inspect stale state.
- CLI image saves require explicit `--output-file` or `--output-directory`;
  capabilities stay hidden; existing files are preserved.
- Never pass a client filesystem path through MCP JSON. Do not retry an
  uncertain ingest under a new request ID, and do not reuse an existing request
  ID for different bytes or a different normalized URL.
