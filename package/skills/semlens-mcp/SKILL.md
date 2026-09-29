---
name: semlens-mcp
description: Operate Semlens MCP for authorization, the Design Rule, Board research, editable design creation and editing, export, and publication preparation.
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
Caveats. Factual Research has no Angles and cannot create a design until expanded
to a saved, validated complete package.

Research text saves reject media. Append one to twenty leads with
`append_news_board_story_research_media`, exact fingerprints,
`expectedUpdatedAt`, and a stable UUID. It adds at most ten deduplicated previews
without changing text. Reuse the UUID for pending reconciliation; use a new one
for a new attempt. Zero credits do not waive policy/freshness checks. Discovery
remains charged; retained media stays outside autofill.

Do not send retired `images`, `imageCandidates`, `imageFill`,
`imageCandidateId`, or `mediaCandidateId`; use uploaded media, Studio
generation, or editor image tools separately after `research_images_retired`.
Use only accessible evidence,
never send private Semlens context to external services, and never fabricate
sources.

## Uploads Ingestion

- Local media: run
  `semlens media upload --file <path> --request-id <uuid> --approve-write`.
  The path stays in the CLI; MCP receives basename, size, hash, and a stable
  request ID before authenticated byte transfer. Batch files contain up to
  eight `file`/`requestId` items.
- Remote media: call `import_uploaded_assets_from_urls` with up to eight public
  HTTPS URLs and external-write approval. Credentials, private destinations,
  nonstandard ports, and HTTPS downgrades are rejected.
- Each item and batch is capped at 50 MiB. Preserve request IDs across uncertain
  retries; changed input under the same ID conflicts.
- Ingestion is a direct, zero-AI-credit account action with normal access,
  permission, owner, audit, approval, and media-verification gates. Reinspect
  returned asset IDs and materialize their previews before design use.

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

## Designs

- Factual Research alone cannot create a design. Expand it to a fully validated
  and saved complete Research package first.
- Create a new editable Generated Design from saved research only through
  `create_design_from_story_research` after inspecting candidates and the
  selected template's fields and validating fills with
  `prepare_template_autofill`.
- Read creation results from `creationSummary` and use its exact preview
  operation for visual QA.
- Edit an existing design through Agent Draft: prepare context, start a draft,
  apply typed actions, inspect and preview, then commit only after the required
  approval.
- Direct editor commands remain appropriate for an explicitly requested
  one-step edit when their own schema and authorization permit it.

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

- [first-safe-check.md](playbooks/first-safe-check.md)
- [story-to-design.md](playbooks/story-to-design.md)
- [design-draft-preview.md](playbooks/design-draft-preview.md)
- [export-and-publish.md](playbooks/export-and-publish.md)
- [submit-feedback.md](playbooks/submit-feedback.md)
- [image-generation.md](playbooks/image-generation.md)
- [troubleshooting.md](playbooks/troubleshooting.md)
