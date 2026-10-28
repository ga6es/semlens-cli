---
name: semlens-mcp
description: Operate Semlens MCP for authorization, Board research, native project editing and private exports, uploads, Brand Kit and image generation.
---

# Semlens MCP

Use the hosted endpoint `https://agents.semlens.com/api/mcp`.

## Authority

- `inspect_mcp_capabilities` is the versioned static record;
  `inspect_mcp_authorization_status` is live account/provider state. Neither
  grants writes.
- Reinspect authorization before writes and after account changes. Stop on a
  returned account, provider, or publication blocker and follow its recovery.
- Keep calls self-contained and use canonical operation names. Client aliases
  and duplicate namespaces remain client-owned.
- CLI auth and tool execution never bypass MCP account, owner, workflow,
  freshness, audit, billing, or provider checks.
- Publishing connection setup and reconnection are currently unavailable.
  Do not direct users to Apps or start a provider connection workflow. Preserve
  completed work and stop when a connection is required. Existing ready
  connections still require current authorization and specific publication approval.

## Research

1. Resolve each story URL or `storyIdentity` with
   `inspect_news_board_story_targets`, then inspect its deterministic target.
   Preserve request order, skip repeats, report misses, and stop on
   `story_identity_collision`.
2. Choose one contract. For headline, excerpt, and source only, inspect factual
   Research, fill its skeleton, validate, and save with top-level
   `expectedUpdatedAt`, `artifactFingerprint`, and `freshnessToken`.
   Complete Research starts from its complete inspector and uses
   `packageFingerprint`. New artifacts use null revisions; stale responses
   require reinspection. Both paths use zero AI credits but retain account,
   authorization, owner, audit, and freshness gates.
3. For complete Research, use permitted public research tools to produce one
   current package. Facts owns verified claims, inline citations, and original
   sourcing; keep secondary evidence but name confirmed joint original
   reporters only. Angles contains exactly three distinct plain-language social
   graphic packages, strongest first, and the Facts-established Source when
   available. Caveats contains at most four publishing guardrails, each naming
   the risky claim and required action; do not repeat Facts or invent warnings.
4. Validate the complete `packageSkeleton`, then save it with the inspected
   top-level revision, fingerprint, and freshness token. Partial-section tools
   and nested `writeContext` are retired. A successful save, including
   `status: "unchanged"`, confirms preservation.

Complete Research Desk tabs are fixed responsibilities: Facts, Angles, and
Caveats. Factual Research has no Angles; expand it to a saved, validated complete
package when structured Angles and Caveats are required.

Research text saves reject media. Append one to twenty leads with
`append_news_board_story_research_media`, exact fingerprints,
`expectedUpdatedAt`, and a stable UUID. It adds at most ten deduplicated previews
without changing text. Reuse the UUID for pending reconciliation; use a new one
for a new attempt. Zero credits do not waive policy/freshness checks. Discovery
remains charged; retained media stays outside autofill.

Do not send retired `images`, `imageCandidates`, `imageFill`,
`imageCandidateId`, or `mediaCandidateId`; use uploaded media, Studio
generation, separately after `research_images_retired`.
Use only accessible evidence,
never send private Semlens context to external services, and never fabricate
sources.

## Uploads Ingestion

- Local media: run
  `semlens media upload --file <local-path> --request-id <uuid> --approve-write
  --endpoint <same-mcp-endpoint> --json` on a host that can read the file.
  Authenticate the CLI to that endpoint first if needed. An MCP
  `prepare_uploaded_asset_upload` result with `status: awaiting_bytes` is only
  a reservation; its `transfer` contract gives the authenticated PUT path and
  byte requirements. A cloud MCP client without local-file/HTTP access cannot
  finish this transfer by another MCP call. Never request or expose the OAuth
  bearer token.
  The path stays in the CLI; MCP receives basename, size, hash, and a stable
  request ID before authenticated byte transfer. Batch files contain up to
  eight `file`/`requestId` items.
- Remote media: call `import_uploaded_assets_from_urls` with up to eight public
  HTTPS URLs and external-write approval. Credentials, private destinations,
  nonstandard ports, and HTTPS downgrades are rejected.
- Each item and batch is capped at 50 MiB. Preserve request IDs across uncertain
  retries with the same unchanged file; changed input under the same ID
  conflicts. Treat only a `status: ready` receipt and matching owner Uploads
  inspection as completed ingestion.
- Ingestion is a direct, zero-AI-credit account action with normal access,
  permission, owner, audit, approval, and media-verification gates. Reinspect
  returned asset IDs before further use.

## Brand Asset Ingestion

- Local: `semlens brand upload --kind <logo|font> --label <label> --file
<path> --request-id <uuid> --approve-write`. Paths stay local; batches allow
  eight items.
- Limits: logo 25 MiB; font 10 MiB; batch 25 MiB.
- Remote: use `import_brand_assets_from_urls` for approved public HTTPS; retry
  failures with the same request IDs.
- The server verifies files; reinspect `inspect_brand_kit` before use. Existing
  staged objects still use `register_brand_logo` or `register_brand_font`.

## Product Feedback

- Feedback MCP tools require full-profile discovery; the bounded starter
  profile omits them. The authenticated CLI feedback commands remain available.
- Inspect `submit_workspace_feedback` and
  `inspect_workspace_feedback_status` capability and live authorization before
  writing. Feedback uses normal account, master-write, audit, and per-call
  approval gates but consumes zero AI credits.
- CLI: `semlens feedback submit --summary <text> --report-file <path>
--request-id <uuid> --approve-write`. The full UTF-8 report is preserved up
  to 64 KiB. Add one `--attachment-file` or an `--attachments-file` JSON array
  of up to eight paths or `file`/`requestId` records.
- MCP clients prepare each manifest item with
  `prepare_workspace_feedback_attachment_upload`, upload bytes only to its
  returned same-origin path, then call `submit_workspace_feedback` with the
  identical versioned report and manifest.
- Evidence limits are 2 MiB per static PNG/JPEG/WebP screenshot, 64 KiB per
  plain-text file, eight million image pixels, eight files, and 16 MiB total.
  The server re-encodes images and rejects credential-like text, private URLs,
  signed capabilities, type mismatches, and changed bytes.
- Image processing cannot guarantee detection of secrets visible inside
  screenshot pixels. Inspect the visible screenshot first and include it only
  when the user explicitly authorizes that evidence.
- Preserve the submission UUID and attachment request IDs across partial or
  uncertain retries. Inspect the durable receipt instead of retrying under new
  IDs. Receipt states distinguish `draft`/`stored` submission from `queued`,
  `processing`, `dispatched`, `retryable`, `uncertain`, or `failed` delivery.
  Private attachments stay out of Trello; only bounded triage context and the
  evidence count are mirrored.

## Native Projects

Normal setup includes the native workflow; no full-profile switch is needed.
Create/open an owned project, retain runtimeGeneration, then read selected source
and sidecar versions. Requested edits save directly with
`save_native_project_files` or `save_native_project_sidecars` through canonical
CAS/history. Do not require a separate manual proposal decision or forge approval.
Import selected owned assets with `import_native_project_asset`; use its verified
relative reference/receipt. List/install the pinned Catalog through native tools.

Only on explicit preview-before-save intent, stage `preview_native_project_candidate`.
Inspect/cancel its exact reference; `save_native_project_candidate` later saves
those same verified bytes. Preview leaves saved source/history unchanged.

Use `lint_native_project_html` for selected-html-static findings and exact file
versions. Full executable `check_native_project` is unsupported/unqualified;
never claim runtime/layout/contrast validation or automatically repair files.
Capture/export are explicit jobs. Keep operation/job/input bindings; inspect
status, distinguish cancel requested from termination confirmed, and preserve
UNKNOWN without blind replay. Private results require current OAuth and paid
access even when cached. Status/cancel survive billing downgrade, with current
authentication and applicable account permissions still enforced.

Use the existing authenticated CLI `mcp call` with `--output-file` for completed
private PNG/MP4 results. Descriptors are selectors, not public bearer URLs; never
put credentials in tool JSON. Gallery PNG preview publication is a separate
explicit operation, not social posting. See [native projects](playbooks/native-projects.md).
For narration/transcription, inspect availability and quote the exact input.
Explain the returned credit cost and submit the unchanged quote only with
spending approval, including an existing explicit budget covering that action
and cost. Reconfirm only when that scope or cost exceeds the authorization.
Use TTS alignment for its captions without another transcription charge.
Actual local/runtime qualification and production release remain separate gates.

## Signals And Feeds

- Treat `Cooling`, `Fast climb`, `Conversation spike`, `Early traction`, and
  `High engagement` as deterministic prioritization hints, never sentiment,
  consensus, verification, or universal scores.
- Hot, New, and Rising are factual Reddit lanes, not signal notes.
- Copy canonical source and list configs from inspection; do not invent source
  metadata, owner IDs, or board IDs.

## Approval Boundaries

- A user's request and current authorization are both required for writes.
- CLI writes require per-call `--approve-write`; external writes require
  `--approve-external`.
- Export only when requested and available.
- Publish only after explicit approval for the exact publication in the current
  conversation.
- Keep output bounded; never expose raw records, credentials, provider payloads,
  storage paths, signed capabilities, or billing details.

## Playbooks

- [Native projects](playbooks/native-projects.md)

- [first-safe-check.md](playbooks/first-safe-check.md)
- [research.md](playbooks/research.md)
- [submit-feedback.md](playbooks/submit-feedback.md)
- [image-generation.md](playbooks/image-generation.md)
- [troubleshooting.md](playbooks/troubleshooting.md)
