# Export And Publishing Readiness

Use this playbook when a user wants files, downloads, or social publishing from
Semlens MCP.

## Export

1. Confirm `inspect_mcp_authorization_status` reports Export files available.
2. If it is unavailable, preserve completed work, explain the returned blocker,
   and stop.
3. Inspect export options with `inspect_export_options`.
4. Prepare export with `prepare_design_export`.
5. Explain format, eligibility, limits, and expected output.
6. If the user's request already authorizes that exact export, call
   `create_design_export`; otherwise ask before creating it.
7. Treat the returned artifact as the final synchronous result. Semlens does
   not advertise a durable task handle, task status, or task cancellation.

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
