# Semlens CLI

This public repository contains the reviewed source prepared for publication as
[`@semlens/cli`](https://www.npmjs.com/package/@semlens/cli).

The CLI helps users configure, diagnose, and update their connection to the
hosted Semlens MCP service. Feature development remains canonical in the
private Semlens monorepo; releases are exported here through a strict file
allowlist without private Git history.

## Development

```sh
npm ci
npm run check:export
npm run build
npm test
npm run check:package
npm run check:package-contents
npm audit --omit=dev
```

The publishable npm package lives in [`package/`](package/). Root development
dependencies are private workspace tooling and do not become npm package
metadata.

### Native credential acceptance

The macOS adapter uses Apple Keychain; fixture tests do not verify a real Mac.
After building the exact candidate, an authorized tester on macOS can run:

```sh
node tests/native-credential-store.mjs --confirm-test-credential-store
```

This opt-in check writes synthetic credentials under a unique test endpoint,
checks chunked save/load/replacement, endpoint isolation and locking, then deletes
its records. It makes no network calls and prints no credential values. It also
runs on Windows for native regression checks. Do not run it on another person's
account without permission. A store access failure must remain a failure; do not
introduce a plaintext fallback or change system-wide Keychain settings to pass.
If cleanup fails, retain the printed test endpoint for a bounded cleanup retry.

Real-Mac acceptance additionally requires normal browser login, an authenticated
read-only command in a new process, refresh after expiry, and logout cleanup,
against the exact candidate and an authorized Semlens test account. Record the
candidate hash, macOS/CPU/Node versions and pass/fail results without tokens.
Keychain denial/unavailability must return `credential_store_unavailable` without
leaking underlying errors. These native and hosted checks remain pending until
an authorized tester records their results.

## Release integrity

`SOURCE_EXPORT.json` records the private canonical commit and SHA-256 digest of
every exported file. CI rejects missing, modified, or unexpected release files.
Publication runs only by manual dispatch from the approval-gated `npm`
environment. Trusted publishing through GitHub OIDC is the default, and every
dispatch defaults to a dry run. No long-lived npm token is used.

The initial `@semlens/cli@0.5.0` bootstrap publication and temporary credential
cleanup are complete. Version `0.5.1` used the existing trusted publisher for
`ga6es/semlens-cli`, `publish.yml`, and the approval-gated `npm` environment.
Published `0.5.0` and `0.5.1` remain immutable.

Future releases use that publisher with GitHub OIDC and manual dispatch,
defaulting to a dry run. Actual publication requires explicit authorization of
the exact new version. The workflow never automatically falls back to bootstrap
or manages credentials.

## License boundary

The files in this repository and the bundled CLI package are licensed under
the Apache License 2.0. The hosted Semlens service and private Semlens
monorepo remain proprietary. The license does not grant trademark rights.
