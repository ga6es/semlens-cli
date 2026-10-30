# Semlens CLI

`@semlens/cli` provides authenticated Semlens MCP execution, setup,
diagnostics, repair, update checks, and the current skill bundle. Semlens
MCP itself is hosted at:

```text
https://agents.semlens.com/api/mcp
```

## Quick use

```bash
semlens mcp doctor
semlens mcp doctor --client codex
semlens mcp repair codex
semlens mcp setup codex
semlens mcp setup codex --profile full
semlens mcp setup claude
semlens auth login
semlens auth status --json
semlens mcp capabilities --operation inspect_brand_kit,inspect_uploaded_assets --json
semlens mcp call inspect_brand_kit --input '{}'
semlens mcp call inspect_uploaded_asset_identities --input '{"assetIds":["<upload-id>"]}'
semlens media upload --file ./logo.png --request-id 11111111-1111-4111-8111-111111111111 --approve-write
semlens media upload --batch-file ./media-uploads.json --approve-write
semlens mcp call import_uploaded_assets_from_urls --input-file remote-media.json --approve-external
semlens brand upload --kind logo --label "Primary logo" --file ./logo.png --request-id <uuid> --approve-write
semlens feedback submit --summary "Export freezes after save" --report-file ./feedback.txt --request-id <uuid> --attachment-file ./screen.png --approve-write
semlens feedback status --request-id <uuid> --json
semlens mcp call inspect_asset_preview --input '{"kind":"logo","id":"<logo-id>"}' --output-file logo-preview.jpg
semlens studio reference upload --file ./reference.webp --request-id <uuid> --approve-write
semlens mcp call retrieve_studio_output_content --input '{"outputId":"<uuid>"}' --output-file result.webp
semlens skills list
```

Use `semlens auth login --no-browser` to open the login in a chosen browser
profile yourself. The authorization URL is written to stderr; the CLI waits
for the same bounded local callback without launching a browser. With `--json`,
stdout still contains only the final result. Treat the temporary login URL as
private and do not save it in shared logs. This flag applies only to login.

Each explicit login registers a new OAuth client for that transaction's exact
local callback port, including when replacing an older fixed-port registration.
Saved credentials are replaced only after the authenticated connection succeeds.
Status checks and token refresh reuse the saved client without registering another.

Codex setup uses the restricted starter profile by default. Full tool discovery
requires explicit `--profile full`. Repair is dry-run by default and changes
only one unambiguous remote Semlens block when rerun with `--apply`.

Install the Semlens plugin or configure the hosted server manually. They are
alternative setup methods, not additive requirements. The CLI does not install
skills into host-specific folders or grant Semlens write authorization.

## Codex client approval diagnosis

Keep `default_tools_approval_mode="writes"` for interactive Codex. It controls
client approval prompts for mutations; Semlens account/workflow permissions remain
separate. `mcp setup codex` prints manual configuration and never saves it.

Diagnose saved settings without changing them:

```bash
semlens mcp doctor --client codex --offline --config ./reviewed-config.toml
semlens mcp doctor --client codex --offline --config ./reviewed-config.toml --codex-approval-policy never --codex-tool save_news_board_story_research --codex-approval-rejected
```

The optional policy/rejection flags are caller-reported evidence, not runtime
discovery. A reported approval-required/never rejection is client-side before
Semlens, not an auth, owner or billing failure. It warns without changing the
existing exit convention; malformed configuration still fails. Loaded policy
stays `NOT_CHECKED`: CLI overrides, trusted project settings and managed
requirements can supersede saved settings. No credentials or raw config are printed.

For explicitly authorized unattended work, review a per-tool exception such as
`[mcp_servers.semlens-mcp.tools.save_news_board_story_research]` with
`approval_mode="approve"`; authorize that exact operation first. Plugin overrides
use `[plugins."<installed-plugin-id>".mcp_servers.semlens-mcp.tools.save_news_board_story_research]`.
Use the affected host's installed plugin ID; do not add a duplicate manual connection.
Never switch the server default to blanket `approve`. Keep publishing and destructive
actions separately prompted and authorized. Doctor and repair never broaden approval
settings, reconnect accounts, or retry writes.

`--codex-profile <name>` inspects legacy `[profiles.<name>]` tables only, without
verifying active selection. Codex 0.134+ uses separate profile files; this doctor
does not resolve the complete layered configuration. Inspect a specific file with
`--config`, and use supported client session information for effective policy.
Saved changes or a later recovery do not prove a running client reloaded them.

## Native account verification

Doctor reports `setupHealth` separately from
`nativeAccountVerification.status: "not_checked"`. Its successful exit means
no diagnosed setup failure; it does not certify a host's loaded MCP account.
Standalone CLI login and browser identity do not prove native identity.

In the affected host, call `inspect_mcp_authorization_status` through its native
Semlens connection. `currentAccount` reports a server-authenticated safe reference
and email only with OAuth email consent; local stdio leaves native identity
unchecked. Compare only an intended identity supplied by the user. Missing email
permission alone cannot establish an account mismatch. Verify identity through
authorization inspection without probing private content.

For an evidenced mismatch, stop writes. Identify the affected client and its
associated executable/version through supported information; PATH Codex may
differ from desktop Codex. Use that client's supported connection controls and
obtain explicit approval before logout/account switching on a shared connection.
After login, refresh/restart that host if needed and verify identity again through
the same native connection. Do not inspect credential stores, change global PATH
or promise a reconnect API. The bundled troubleshooting playbook contains the
bounded recovery path.

Operational commands use OAuth PKCE and the same registered MCP tools as
connected agents. Windows credentials are stored in Windows Credential Manager;
the CLI fails closed when the protected store is unavailable. Login opens the
system browser and accepts one bounded loopback callback. `auth status` reports
stored and server-verified state separately. `auth logout` removes local
credentials and reports remote revocation as not attempted.
Failed or cancelled authorization during re-login preserves the previously
committed session until the replacement is verified. A keyring failure during
the final protected-store commit can leave its outcome uncertain; rerun
`auth status` before retrying login. A corrupt credential manifest fails closed rather than guessing which entries to
delete. If logout reports `credential_store_corrupt`, use Windows Credential
Manager to remove only the affected Semlens CLI entries; do not clear other
applications' credentials. Native keyring recovery and hosted OAuth still require
environment-specific verification; the automated lifecycle checks use fixtures.
Remote OAuth discovery accepts named HTTPS hosts, not IP literals or local
hostnames. An explicitly local MCP endpoint permits loopback OAuth services.
This literal-host policy does not claim DNS-rebinding protection.

Generic calls inspect the live versioned capability manifest first. Reads need
no approval flag. Writes require `--approve-write` for that invocation, while
external writes such as publishing require the stronger `--approve-external`.
Load nontrivial requests from `--input-file`; never place secrets, OAuth values,
or signed capability URLs in command arguments.

Native edits save directly through registered tools under current account and
invocation permissions. Optional unsaved candidate preview is separate from
saving; export/status/cancel/private results use exact job references.
The retired custom editor commands remain unavailable. Full executable check
is unsupported, and source/controlled tests do not certify the actual runtime.

`media upload` hashes and sizes each local file before asking MCP for a
short-lived owner-scoped transfer. The filesystem path stays in the CLI; only
the basename, size, SHA-256, and stable request ID reach MCP before the CLI
streams the bytes with its protected OAuth session. A batch file is a JSON
array of up to eight `{ "file": "...", "requestId": "<uuid>" }` items;
the per-file and aggregate limit is 50 MiB. Reuse the same request ID for an
uncertain retry with the same file, and do not reuse it for different input.
If a separate MCP call already returned `awaiting_bytes`, run the CLI against
that same endpoint and account with the same request ID and matching local
filename, size, and bytes. The CLI may reuse the prepared session or obtain a
fresh one after expiry; it sends the raw bytes over authenticated PUT and
reports success only from a `ready` receipt. `awaiting_bytes` by itself is not
an uploaded asset. Use `semlens auth login --endpoint <same-mcp-endpoint>` if
the CLI has no valid protected session, and confirm the returned asset in
Uploads. Never copy bearer tokens into CLI arguments or MCP requests.

Brand uploads use `semlens brand upload` and the same authenticated streaming
boundary as media uploads. Each item declares `kind` (`logo` or `font`), a
human-readable `label`, a stable `requestId`, and a local `file`. Brand logo
files are capped at 25 MiB, font files at 10 MiB, and a batch at 25 MiB. The
server verifies image decoding or parses font metadata before persisting the
owner-scoped Brand record. For batch mode, pass a JSON array through
`--batch-file` with those four fields on every item.

Remote imports use `import_uploaded_assets_from_urls` with up to eight public
HTTPS URLs and `--approve-external`. Credentials in URLs, nonstandard ports,
private addresses, unsafe redirects, unsupported media, and over-limit bodies
are rejected. Non-credential query strings are preserved, signed/credential
query keys are rejected, fragments are removed, and the result reports each
item independently. Both local and remote ingestion use
zero AI credits while retaining active-account, edit-permission, approval,
owner, audit, and media-verification gates. Inspect returned asset IDs with
`inspect_uploaded_assets`, `inspect_uploaded_asset_identities`, and
`inspect_asset_preview` for authorized pixel inspection.

`feedback submit` reads the full report from a local UTF-8 file and preserves
its exact text up to 64 KiB. A stable request UUID makes retries duplicate-safe.
Attach either one file with `--attachment-file` or a JSON array of up to eight
paths or `{ "file": "...", "requestId": "<uuid>" }` items with
`--attachments-file`. Screenshots may be PNG, JPEG, or WebP up to 2 MiB and
eight million pixels; text evidence may be plain UTF-8 up to 64 KiB; the batch
is capped at 16 MiB. The server decodes and re-encodes static screenshots and
rejects credential-like text, private URLs, signed capabilities, and mismatched
bytes. This does not guarantee that sensitive information visible inside image
pixels can be detected: inspect the screenshot and attach it only when the user
has explicitly authorized that evidence.

The durable receipt distinguishes `draft` evidence preparation from `stored`
submission and reports delivery as `queued`, `processing`, `dispatched`,
`retryable`, `uncertain`, or `failed`. If the command stops after a partial
upload or delivery becomes uncertain, rerun with the same request UUID and
files, then use `feedback status`; never invent a new UUID for the same attempt.
Private evidence remains in Semlens private storage and only the bounded
summary, reporter context, and evidence count are mirrored to Trello.

Tool-result images can be saved with one explicit `--output-file` or a
pre-existing `--output-directory`. The CLI validates the actual JPEG/PNG
bytes, enforces the server preview bound, calculates SHA-256, and publishes via
a sibling temporary file. Existing files fail closed; `--overwrite` is allowed
only for a single explicitly named file. Batch output never overwrites files.
If a later batch publication fails or is cancelled, already published files are
preserved and reported as `createdOutputPaths` so a retry cannot delete a file
that another process replaced concurrently.

Studio reference uploads accept one regular PNG, JPEG, or WebP file up to
20 MiB. The local path is never sent; the CLI sends the basename, stable request
UUID, and bounded image bytes through the authenticated MCP operation. Preserve
the UUID across an uncertain retry. Generated originals are written only to an
explicit output path whose extension matches the returned PNG, JPEG, or WebP
type.
Ordinary `mcp call` output continues to omit image bytes and redact delivery
capabilities. Inspect the live capability manifest before requesting asset pixels; metadata alone does not prove a delivered image.

## Compatibility

- Prepared Semlens CLI package version: `0.5.6` (publication pending)
- Published CLI: `0.5.5`; its older manifest is incompatible with the current server. The 0.5.6 candidate requires verification and a separately approved trusted publication before normal npm installation.
- Historical Desk Rules package: `@desk-rules/cli` version `0.2.4`
- Minimum compatible CLI contract: `0.5.0`
- Current plugin and bundled skill contract: `0.5.1` (publication pending)
- Prepared MCP manifest: `2026-10-29.native-exports`
- Protocol: MCP `2026-07-28` with automatic stateless legacy fallback

Run `mcp doctor` when a server, plugin, CLI, or skill bundle looks stale. The
doctor distinguishes the installed bundle version from the minimum compatible
version. `auth status` verifies the CLI's protected session against MCP without
changing account authorization.

## Workflow boundary

Semlens MCP owns authorization, Research, account assets and native editing.
Normal bounded setup includes native create/open/read/direct file and sidecar
saves, import/Catalog, optional candidate preview/save and explicit jobs/results.
No mandatory owner proposal approval is added to requested ordinary saves.
Host invocation approval and account permissions still apply. Full executable
check is unsupported; selected HTML static lint is narrower. Keep operation/job
identity, exact versions and UNKNOWN evidence instead of blind retries.

Speech quote, verification and application calls default to a 120-second
client deadline to allow cold audio preparation. Session expiry and cancellation
can end them sooner. On a timeout, retain the operation and read its state
before retrying; a timeout does not prove that nothing ran.

Private native results use the current authenticated connection, not a public
URL. The existing command writes only after bounded size/hash verification:

```sh
semlens mcp call inspect_native_project_result --input-file job.json --output-file result.mp4
semlens mcp call inspect_native_project_result --input-file image-job.json --output-file images.zip
semlens mcp call inspect_native_project_candidate --input-file candidate.json --output-file preview.png
semlens mcp call retrieve_native_project_speech_audio --input-file speech-result.json --output-file voiceover.mp3
```

Existing output files refuse unless --overwrite is explicit. Tokens never
belong in tool JSON or output. Cached byte delivery retains current paid access;
status/cancel survive billing downgrade with remaining auth/policy enforced.
These source changes do not claim package publication or actual runtime
qualification. See the bundled native-projects playbook.

To import a local media file, `target.json` contains only the currently prepared
`projectId` and `runtimeGeneration`:

```sh
semlens mcp call prepare_native_project_media_upload --input-file target.json --file ./audio.mp3 --approve-write
```

The CLI keeps the local path private, commits the filename/size/SHA-256, then
streams the file with current OAuth to the same endpoint. The existing native
publisher creates the project asset and history receipt without overwriting
files. An uncertain transfer requires receipt readback before an exact retry.

The default profile includes standalone image capabilities and quotes. Start,
progress, cancellation and private output retrieval use authenticated CLI
`mcp call` or optional full-profile discovery. Inspect live availability
and quote the exact model/variant count before approved spending. Preserve the
request ID after uncertainty; generation creates raw media, separately from
native project placement. Native Studio has its own image-generation UI; this
MCP workflow remains separate.
Reference management and extended history remain available through authenticated
operational CLI calls or the optional manual `--profile full` setup. Do not
configure the plugin and a manual connection to the same endpoint together.

MCP generation supports GPT Image 2 only: `gpt-image-2` with
`gpt-image-2:direct:openai`, `direct`, `platform_credits`. Nano Banana quotes,
generation, active draft selection and retries are rejected. Existing Nano runs,
cancel/status and private output downloads remain available. A loaded stored Nano
draft retains its content/revision and returns explicit model-selection guidance;
select GPT before saving, preserving all other fields. No automatic conversion.

## Safety and source

- No postinstall script.
- No backend secrets or local stdio customer setup.
- No plaintext credential fallback and no token, callback, or signed-capability output.
- Operational support is Windows-first in this prepared release; other OS credential stores are not yet claimed.
- Malformed, ambiguous, local stdio, and unsupported Codex configs fail closed.
- Configuration/profile changes never grant account write access.

The CLI and bundled skills are licensed under the Apache License 2.0. Release
source is published at https://github.com/ga6es/semlens-cli. This license
does not apply to the hosted Semlens service or its source code and does not
grant trademark rights in the Semlens name.
