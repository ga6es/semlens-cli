# Submit Product Feedback

1. Confirm the user wants to submit feedback, then inspect the static
   capabilities and live authorization for `submit_workspace_feedback` and
   `inspect_workspace_feedback_status`.
2. Prepare one stable submission UUID. Keep the full report in a local UTF-8
   file for CLI use or in the versioned MCP request; preserve its exact text.
3. Before attaching evidence, inspect it for credentials, private URLs, signed
   capabilities, private account data, and sensitive information visible in
   screenshot pixels. Attach evidence only with the user's explicit approval.
4. For CLI, run `semlens feedback submit` with the stable UUID and
   `--approve-write`. For MCP, create the immutable attachment manifest,
   prepare and upload every item through its same-origin path, then submit the
   identical report and manifest.
5. Return the durable receipt immediately. `draft` means evidence preparation
   is incomplete; `stored` means the database accepted the report. Trello
   delivery is separate and may be queued, processing, dispatched, retryable,
   uncertain, or failed.
6. On a partial upload, timeout, or uncertain result, retain every request ID
   and call `inspect_workspace_feedback_status` or `semlens feedback status`.
   Retry the same input under the same IDs; changed input must conflict.

Never claim that image re-encoding or text scanning can detect every secret in
visible pixels. Do not expose private Storage paths, raw database rows, Trello
credentials, or signed URLs. Private evidence is not copied to Trello.
