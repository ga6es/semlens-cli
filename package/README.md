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
semlens mcp call inspect_design_resource_preview --input '{"kind":"logo","id":"<logo-id>"}' --output-file logo-preview.jpg
semlens mcp call inspect_design_page_preview --input-file page-previews.json --output-directory ./previews
semlens mcp call inspect_design_asset_crop --input-file crop-preview.json --output-file crop-preview.jpg
semlens studio reference upload --file ./reference.webp --request-id <uuid> --approve-write
semlens mcp call retrieve_studio_output_content --input '{"outputId":"<uuid>"}' --output-file result.webp
semlens mcp call update_design_text --input-file request.json --approve-write
semlens mcp call publish_design --input-file request.json --approve-external
semlens skills list
```

Codex setup uses the restricted starter profile by default. Full tool discovery
requires explicit `--profile full`. Repair is dry-run by default and changes
only one unambiguous remote Semlens block when rerun with `--apply`.

Install the Semlens plugin or configure the hosted server manually. They are
alternative setup methods, not additive requirements. The CLI does not install
skills into host-specific folders or grant Semlens write authorization.

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

`media upload` hashes and sizes each local file before asking MCP for a
short-lived owner-scoped transfer. The filesystem path stays in the CLI; only
the basename, size, SHA-256, and stable request ID reach MCP before the CLI
streams the bytes with its protected OAuth session. A batch file is a JSON
array of up to eight `{ "file": "...", "requestId": "<uuid>" }` items;
the per-file and aggregate limit is 50 MiB. Reuse the same request ID for an
uncertain retry, and do not reuse it for different input.

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
`inspect_design_resource_preview` before design use.

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

Native MCP preview images can be saved with one explicit `--output-file` or a
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
capabilities. Upload, Brand, and design inventories return explicit preview
request descriptors rather than bearer URLs; use the named preview tool to
materialize pixels. Crop inspection requires a live-design timestamp or Agent
Draft version fence, and returns native image content only when
`includePreview` is true and materialization succeeds.

## Compatibility

- Semlens CLI package version: `0.5.1`
- Historical Desk Rules package: `@desk-rules/cli` version `0.2.4`
- Minimum compatible CLI contract: `0.5.0`
- Current plugin and bundled skill contract: `0.5.0`
- MCP manifest: `2026-09-26.semlens-identity`
- Protocol: MCP `2026-07-28` with automatic stateless legacy fallback

Run `mcp doctor` when a server, plugin, CLI, or skill bundle looks stale. The
doctor distinguishes the installed bundle version from the minimum compatible
version. `auth status` verifies the CLI's protected session against MCP without
changing account authorization.

## Workflow boundary

Semlens MCP owns authorization, private workspace inspection, research
persistence, template validation, editable design operations, export, and
publication preparation. The connected agent supplies its own permitted public
web, search, or browser tools. Account > Agent > Design Rule remains the
configurable design-selection instruction source.

The starter profile covers common inspection and workflow operations. Agents
copy canonical configs and write tokens from inspection rather than guessing
identifiers. Existing-design multi-step edits use Agent Draft; direct editor
commands remain available for explicit one-step edits. Publishing always
requires explicit approval for the exact publication.

Publishing connection setup and reconnection are currently unavailable. Do not
direct users to Apps or start provider OAuth setup. Preserve completed work and
stop when a connection is required. Existing ready connections still require
current authorization and approval for the specific publication.

Studio generation and edit parity is a full-profile surface. The Codex plugin
keeps the restricted starter allowlist; use authenticated operational CLI
commands, or use the alternative manual setup with
`semlens mcp setup codex --profile full`. Do not configure the plugin and a
manual connection to the same hosted endpoint together.

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
