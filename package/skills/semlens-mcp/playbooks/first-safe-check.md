# First Safe Check

Use this read-only check after connection or when the user asks what Semlens
can do.

1. Inspect requested IDs with `inspect_mcp_capabilities` (bounded inventory
   pages only). CLI: `semlens mcp capabilities --operation <ids> --json`.
2. Run `inspect_mcp_authorization_status`; report static support separately
   from live availability.
3. Run `inspect_rules` only when the workflow uses the Design Rule.
4. If workspace proof is requested, list recent designs and inspect the chosen
   design with the smallest relevant inspection tool.

Stop on blockers. Reinspect unavailable verification rather than prescribing
account changes. Do not write, publish, or ask for secrets.
