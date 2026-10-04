# Export And Publishing Readiness

Use this playbook when a user wants files, downloads, or social publishing from
Semlens MCP.

## Export

1. Confirm `inspect_mcp_authorization_status` reports Export files available.
2. If it is unavailable, preserve completed work, explain the returned blocker,
   and stop.
3. Inspect export options with `inspect_export_options`.
4. Prepare export with `prepare_design_export`.
5. For MP4, omit `durationMs` when the user wants the visible video to play
   through. The preparation result reports each selected page's duration and
   the total; an explicit `durationMs` applies the same duration to every page.
   Supplying only `fps` must not shorten the video. Check each page's video
   limits for separate files, and the aggregate limit for a stitched MP4.
   Use `videoOutputMode: "mixed"` for one numbered ZIP containing MP4 pages with
   visible video and static `png` or `jpg` pages (`staticFormat`). Separate MP4
   pages also use independent per-page limits. Read `pagePlan` before creation
   and inspect `pageResults` after every export. Successful ZIPs contain media
   only; inspect `export-results.json` only for partial archives. Retry only
   failed or unsupported pages after correcting their cause.
6. Explain format, eligibility, limits, and expected output.
7. If the user's request already authorizes that exact export, call
   `start_design_video_export` for an MP4 or mixed-media job, or
   `create_design_export` for a synchronous export. Otherwise ask before
   creating it. Pass the prepared `expectedUpdatedAt` to either write.
8. An accepted video start returns `exportOperation.id` and a status. Replaying
   the same design and options reuses an active operation or a completed/partial
   operation whose artifact has not expired. Failed, cancelled, or expired
   operations allow a new render, so start is not generally idempotent; obtain
   authorization for that new export. Use `inspect_design_video_export` with
   `designId` and `exportOperationId` to read progress. A status read contains
   no signed URL and needs no new billing decision. When `downloadAvailable`
   is true, call `retrieve_design_video_export` with those IDs and use CLI
   `--output-file <name.zip|name.mp4>` or an existing `--output-directory`
   to save the private artifact. Retrieval checks the current Export files
   permission and artifact expiry, without creating another export or charge.
   A pending retrieval returns status and creates no local file. If a local
   transfer fails, inspect the existing operation and retry retrieval; do not
   start another render. `cancel_design_video_export` requests cancellation of
   an active operation with write approval; `cancel_requested` is not terminal.
   Inspect again to confirm `cancelled`, `partial`, or `completed`.
9. Synchronous `create_design_export` still gives the CLI a bounded 10-minute
   wait. If that write times out, inspect recent MCP activity before retrying.
   The CLI output flags save only ZIP and MP4 export artifacts. PNG, JPG, and
   PDF exports complete synchronously on the server, but the CLI cannot currently
   save those standalone export files with these flags. Use an authorized MCP
   client that supports their file delivery; do not expose the bearer URL.
   The MCP retrieval result gives the authorized client a temporary
   private download capability URL, filename, type, and size. Treat that bearer
   URL as private; the CLI hides it from normal output. Existing local files stay
   intact unless an explicit single-file `--overwrite` is used.

## Publishing

Connection setup and reconnection are currently unavailable. Do not direct
users to Apps or start provider OAuth setup. Preserve completed work and stop
when a publishing connection is required. The steps below apply only to an
existing ready connection; they do not grant access or publication approval.

1. Confirm `inspect_mcp_authorization_status` reports Publish available.
2. If it is unavailable, preserve completed work, explain the returned blocker,
   and stop.
3. Inspect available targets with `inspect_publish_targets`.
4. Prepare the publish request with `prepare_publish`.
5. Explain account, provider, format, privacy, and any missing requirements.
6. Ask for explicit approval for this specific publication in the current
   conversation.
7. Call `publish_design` only after approval and eligible access.
8. Check status with `inspect_publish_status`.

## Guardrails

- Current MCP publishing is Instagram-owned; TikTok publishing remains a
  gated UI/server workflow unless the manifest says otherwise.
- Do not post, upload, or hand off externally without explicit approval.
- Do not expose provider tokens, internal account identifiers, or raw artifact
  storage paths.
- `openWorldHint: false` describes bounded Semlens operations, not an offline
  tool or a guarantee that no private artifact leaves Semlens.
