# Troubleshooting

1. Inspect static capability, then live authorization. Inspect the Design Rule
   only when the workflow uses it.
2. Follow the one returned recovery step: reinspect stale or unverifiable state,
   correct invalid input, choose supported operations, and read back uncertain
   results before retry. Never bypass account, provider, Rule, or approval gates.
3. For stale Research writes, reinspect the story research and copy the
   refreshed `expectedUpdatedAt`, `packageFingerprint`, and `freshnessToken`
   into one complete `save_news_board_story_research` request.
4. For setup or bundle problems, use the Semlens plugin or the currently
   published CLI doctor from the release notes.
5. For Codex configuration, preview `semlens mcp repair codex` and apply only
   after reviewing the bounded plan. The bounded default includes native editing. Full
   discovery remains an explicit optional choice for other workflows.
6. Install the Semlens plugin or configure the hosted MCP server manually.
   These are alternative setup methods, not additive requirements.

If a removed operation returns unknown-tool, update the CLI/plugin/skill bundle
and reconnect so the client rediscovers the current manifest. Semlens cannot
rename host-generated callable aliases or remove separately configured client
namespaces.

Never ask for tokens, client secrets, full config files, or raw backups.

## Codex client approval rejection

If Codex reports that an MCP tool requires approval but policy is `never`, the
client rejected the call before Semlens. Preserve work; this is not evidence of
a Semlens auth, owner or billing problem. Keep the interactive server default
`default_tools_approval_mode="writes"`.

For explicitly authorized unattended work, review only exact authorized tool
exceptions under `[mcp_servers.semlens-mcp.tools.<authorized-tool>]`, or the
installed plugin's `[plugins."<installed-plugin-id>".mcp_servers.semlens-mcp.tools.<authorized-tool>]`,
with `approval_mode="approve"`. Use the host-reported plugin ID and retain separate
publication/destructive approval gates. Never blanket-approve the server, add a
duplicate connection, repair approval settings, reconnect accounts, or retry writes
automatically.

Doctor can record caller-reported evidence with `--client codex --offline
--codex-approval-policy never --codex-approval-rejected`; it does not inspect loaded
client policy. Saved config, legacy profile tables and per-tool overrides do not
resolve CLI/project/managed overrides. Use supported client session information;
a later config edit does not establish why an earlier write recovered.

## Native account diagnosis and recovery

Doctor separates setup health from native account `NOT_CHECKED`. Configuration,
metadata, standalone CLI login, browser account and local credentials cannot
certify the affected native connection. Run `inspect_mcp_authorization_status`
through that connection and report `currentAccount` separately from availability
and permissions. Compare only the intended email or safe reference the user
supplies. If email is not consented/available, email comparison is unverified;
use an intended reference only when supplied. Do not use duplicate display names
or infer the intended account. Local stdio `not_checked` and
`verification_unavailable` never certify native identity.

- Valid but evidenced wrong account: stop writes and preserve work; seek approval
  before switching the selected connection, especially when shared by agents.
- Invalid/expired authentication: use the affected connection's supported login.
- Stale loaded transport: refresh/reconnect/restart that host with supported
  controls; successful login elsewhere may leave its loaded session unchanged.
- Missing content/`missing_design`: account-scoped absence is ambiguous. Do not
  claim a mismatch or disclose another owner's existence.
- Permission denial: follow returned access recovery; do not prescribe an
  account switch merely because access is denied.

Identify the affected host and its executable/version where safely observable
using supported client information or executable discovery. For Codex, compare
the desktop-associated executable/version with PATH `codex --version`; versions
may use different credential stores. Do not hardcode a path, change global PATH
or config, or inspect/decode stores. Use the affected client's supported Semlens
connection controls. Only with explicit operational approval, use its associated
executable's `mcp logout <configured-server-name>` then
`mcp login <configured-server-name>` when supported; have the user refresh or
restart that host if needed. Other clients use their supported connection
controls. Do not invent a reconnect API or automatically log out a shared client.

After recovery, inspect authorization again through the same affected native
connection and compare the supplied intended identity before resuming writes.
Standalone CLI success is not native recovery proof. Verify identity through
authorization inspection. Do not list/search private content to establish an
account match.
Semlens cannot prevent every host credential-cache failure.

On `billing_required`, explain that the feature needs an existing eligible
account, preserve completed work and stop. Do not display plans, promote upgrades,
subscriptions or credit purchases, or link to purchase flows. Re-inspect
authorization in a new request after account eligibility changes independently.

Publishing connection setup and reconnection are currently unavailable. Do not
direct users to Apps or start provider OAuth setup. Preserve completed work and
stop when a publishing connection is required; do not loop retries or bypass
provider readiness checks.

## Native conflicts and jobs

On changed source/version/generation, read current owned source and preserve the
original operation identity; do not silently rebase saved or candidate bytes.
UNKNOWN is ambiguous evidence, not permission to retry. Inspect the exact job
and report what is confirmed. A cancellation request is not process-exit proof.
A full executable check is unsupported; selected HTML static lint is narrower.
Private result bytes require current OAuth, billing and the applicable account
permission. Do not expose URLs as public downloads or discard accepted work on
a downgrade. Reauthenticate only through the affected connection's supported
flow when authentication is actually missing or expired.
