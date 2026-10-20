# Image generation through MCP

MCP supports GPT Image 2 only: `gpt-image-2`, route `gpt-image-2:direct:openai`,
`direct`, `platform_credits`. Nano Banana cannot be selected, quoted, saved as
an active image draft, generated or retried. Existing Nano inspection, cancellation
and private output downloads remain available; historical reuse as a reference does
not authorize a retired model. Never silently substitute models.

Fresh MCP drafts select GPT. Stored Nano drafts preserve content/revision and
return `modelSelectionRequired` and `supportedModelSelection`. Preserve prompt,
references/settings, explicitly select GPT in the image snapshot/workspace mode,
set `activeWorkflow` to `image` for workspace drafts, then save with `expectedRevision`. Loading does not convert or save content.

- Default setup includes `inspect_studio_generation_capabilities` and
  `quote_studio_generation`. Execute `start_studio_generation`,
  `inspect_studio_generation`, `cancel_studio_generation` and
  `retrieve_studio_output_content` through authenticated CLI `mcp call` or
  an explicitly selected full profile. Extended reference/history tools use the same connection; never configure duplicate connections.
- Inspect live authorization and generation capabilities. Stop on unavailable
  models, account access, funding or provider/worker blockers. A quote alone
  does not prove that a provider and worker can finish a request.
- Quote the exact available model and variant count, explain the credit cost,
  and obtain spending approval. Use returned references only. Local files use
  `semlens studio reference upload`; preserve request IDs.
- Start with a stable `clientRequestId`. After uncertainty, inspect the same
  run; do not create another paid request. Cancellation is a separate action:
  `cancel_requested` is not final, and completed variants still spend credits.
  Failed, blocked or canceled variants release their reservations.
- Retrieve the matching owner-private PNG/JPEG/WebP with
  `retrieve_studio_output_content`; the authenticated CLI `mcp call` supports
  `--output-file` for durable delivery. Preserve output and history records.
- Generation creates raw media. Native placement is a separate owner-authorized
  import through the canonical native file/history boundary. Native Studio has
  no built-in image generator or website agent. Do not restore a legacy document
  bridge, promise automatic placement, or treat registered tools as proof of
  actual generation, debit or runtime readiness.