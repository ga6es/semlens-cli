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
   after reviewing the bounded plan. The starter profile is the default; full
   discovery requires explicit `--profile full`.
6. Install the Semlens plugin or configure the hosted MCP server manually.
   These are alternative setup methods, not additive requirements.

If a removed operation returns unknown-tool, update the CLI/plugin/skill bundle
and reconnect so the client rediscovers the current manifest. Semlens cannot
rename host-generated callable aliases or remove separately configured client
namespaces.

Never ask for tokens, client secrets, full config files, or raw backups.

On `billing_required`, explain that the feature needs an existing eligible
account, preserve completed work and stop. Do not display plans, promote upgrades,
subscriptions or credit purchases, or link to purchase flows. Re-inspect
authorization in a new request after account eligibility changes independently.

Publishing connection setup and reconnection are currently unavailable. Do not
direct users to Apps or start provider OAuth setup. Preserve completed work and
stop when a publishing connection is required; do not loop retries or bypass
provider readiness checks.
