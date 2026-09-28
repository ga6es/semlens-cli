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

## Release integrity

`SOURCE_EXPORT.json` records the private canonical commit and SHA-256 digest of
every exported file. CI rejects missing, modified, or unexpected release files.
Publication runs only by manual dispatch from the approval-gated `npm`
environment. Trusted publishing through GitHub OIDC is the default, and every
dispatch defaults to a dry run. No long-lived npm token is used.

The first publication of `@semlens/cli@0.5.0` requires explicitly selecting
`bootstrap`: token-based registry authentication with GitHub OIDC provenance.
Before creating or using its credential, the owner must verify hosted production
acceptance and approve the reviewed version, temporary credential and any CI
2FA bypass. Use a one-day granular token limited to the `@semlens` scope, with
no organization-management permission, as the `npm` environment secret
`NPM_BOOTSTRAP_TOKEN`. The workflow rejects a missing credential, a different
package/version, an existing registry package or an inconclusive registry lookup.
These guards do not verify token expiry, permissions or release approval.

Revoke the credential immediately after success or failure and remove the
environment secret. After first publication, configure and verify the exact
trusted publisher for `ga6es/semlens-cli`, `publish.yml` and the `npm` environment,
allowing direct publication. Later versions use OIDC registry authentication.
The workflow never automatically falls back to bootstrap or manages credentials.

## License boundary

The files in this repository and the bundled CLI package are licensed under
the Apache License 2.0. The hosted Semlens service and private Semlens
monorepo remain proprietary. The license does not grant trademark rights.
