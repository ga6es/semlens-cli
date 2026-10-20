# First Safe Check

Use this read-only check after connection or when the user asks what Semlens
can do.

1. Inspect requested IDs with `inspect_mcp_capabilities` (bounded inventory
   pages only). CLI: `semlens mcp capabilities --operation <ids> --json`.
2. Run `inspect_mcp_authorization_status` through the affected host's native
   Semlens connection. Report `currentAccount.status`, safe reference and
   consented email separately from permissions/provider availability.
   `authenticated: true` alone does not prove the intended account.
3. Run `inspect_rules` only when the workflow uses the Design Rule.
4. Compare only the intended email or safe account reference supplied by the
   user with that same native response. Missing email permission makes email
   comparison unverified, not mismatched. The reference is pseudonymous and
   stable within Semlens; display names are not distinguishing evidence.
   `verification_unavailable` and local stdio `not_checked` are not verified
   identity. Verify identity through authorization inspection without probing
   private content or inferring another owner's resource existence.

Stop on blockers. Reinspect unavailable verification rather than prescribing
account changes. Do not write, publish, or ask for secrets.

On an evidenced identity mismatch, stop writes, preserve work and follow
Troubleshooting's affected-client recovery. Browser identity, standalone CLI
login, doctor setup health and local credentials cannot certify a native account.
