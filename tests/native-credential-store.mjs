import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { ProtectedCredentialStore, withEndpointCredentialLock } from "../package/dist/secure-credentials.js"

// Opt-in acceptance only: use synthetic credentials in a unique endpoint
// namespace, never enumerate/read a user's existing credential records.
if (process.argv.slice(2).join(" ") !== "--confirm-test-credential-store" ||
    !["darwin", "win32"].includes(process.platform)) {
  console.error("Requires Windows/macOS and --confirm-test-credential-store; writes and deletes isolated synthetic OS credentials.")
  process.exit(1)
}
const endpoint = `https://credential-test-${randomUUID()}.example.invalid/api/mcp`
const store = new ProtectedCredentialStore(endpoint)
const issuer = "https://credential-test.example.invalid/"
const session = {
  clientInformationByIssuer: { [issuer]: { client_id: "synthetic-client", issuer } },
  endpoint,
  tokensByIssuer: { [issuer]: {
    access_token: "synthetic-access-".repeat(300),
    refresh_token: "synthetic-refresh-".repeat(300),
    token_type: "Bearer", issuer,
  } },
  updatedAt: new Date().toISOString(), version: 1,
}

try {
  await withEndpointCredentialLock(endpoint, async () => {
    assert.equal(await store.load(), null)
    assert.equal(await store.delete(), false)
    await store.save(session)
    const reloaded = await new ProtectedCredentialStore(endpoint).load()
    assert.ok(JSON.stringify(reloaded) === JSON.stringify(session), "Protected credential readback differs")
    assert.equal(await new ProtectedCredentialStore(`${endpoint}/other`).load(), null)
    await assert.rejects(withEndpointCredentialLock(endpoint, async () => undefined),
      (error) => error?.code === "session_busy")
    await store.save({ ...session, updatedAt: "2026-11-01T00:00:00.000Z" })
    assert.equal((await store.load())?.updatedAt, "2026-11-01T00:00:00.000Z")
    assert.equal(await store.delete(), true)
    assert.equal(await store.load(), null)
    assert.equal(await store.delete(), false)
  })
  console.log(`PASS ${process.platform} native protected-store chunked lifecycle, replacement, endpoint isolation, locking and cleanup; no network calls`)
} catch {
  console.error("FAIL native protected-store acceptance; no credential values printed. Authentication support is not verified.")
  process.exitCode = 1
} finally {
  try {
    await store.delete()
  } catch {
    console.error(`Synthetic cleanup incomplete for test endpoint ${endpoint}; retry cleanup for this endpoint when the credential store is accessible.`)
    process.exitCode = 1
  }
}
