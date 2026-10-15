import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { test } from "node:test"
import { auth, AuthorizationServerMismatchError, fetchToken } from "@modelcontextprotocol/client"

// The same regressions run against canonical source and its generated public
// export. Both use only synthetic credentials in an injected memory backend.
const exportedSource = new URL("../package/src/", import.meta.url)
const source = existsSync(exportedSource)
  ? exportedSource
  : new URL("../../../packages/cli/src/", import.meta.url)
const modules = Promise.all([
  import(new URL("oauth-session.js", source).href),
  import(new URL("secure-credentials.js", source).href),
])
const endpoint = "https://mcp.example.test/api/mcp"
const issuer = "https://trusted-auth.example.test/"
const otherIssuer = "https://other-auth.example.test/"

async function fixture() {
  const [{ ProtectedOAuthProvider }, { ProtectedCredentialStore, SecureCredentialError }] = await modules
  const entries = new Map<string, string>()
  const store = new ProtectedCredentialStore(endpoint, (key: string) => ({
    getPassword: async () => entries.get(key) ?? null,
    setPassword: async (value: string) => { entries.set(key, value) },
    deletePassword: async () => entries.delete(key),
  }))
  const session = {
    clientInformationByIssuer: {}, endpoint, tokensByIssuer: {},
    updatedAt: "2026-10-14T00:00:00.000Z", version: 1,
  }
  const provider = new ProtectedOAuthProvider(store, session,
    "http://127.0.0.1:49272/oauth/callback", "fixture-state",
    async () => { assert.fail("Unexpected interactive authorization") })
  await provider.saveClientInformation({ client_id: "fixture-client", issuer, client_secret: "fixture-secret" })
  await provider.saveTokens({ access_token: "fixture-access", refresh_token: "fixture-refresh", token_type: "Bearer", issuer })
  return { entries, provider, store, ProtectedOAuthProvider, SecureCredentialError }
}

function issuerMismatch(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "issuer_mismatch"
}

test("issuer-bound credentials survive protected storage and are unavailable to another issuer", async () => {
  const { provider, store, ProtectedOAuthProvider } = await fixture()
  const saved = await store.load()
  assert.equal(saved.tokensByIssuer[issuer].issuer, issuer)
  assert.equal(saved.clientInformationByIssuer[issuer].issuer, issuer)
  const restored = new ProtectedOAuthProvider(store, saved,
    provider.redirectUrl, "fixture-state", async () => assert.fail("Unexpected login"))
  assert.equal(restored.tokens({ issuer }).refresh_token, "fixture-refresh")
  assert.equal(restored.clientInformation({ issuer }).client_secret, "fixture-secret")
  assert.equal(restored.tokens({ issuer: otherIssuer }), undefined)
  assert.equal(restored.clientInformation({ issuer: otherIssuer }), undefined)
})

test("save callbacks reject conflicting issuer stamps without changing protected credentials", async () => {
  const { entries, provider } = await fixture()
  const before = [...entries]
  await assert.rejects(provider.saveTokens({ access_token: "wrong", token_type: "Bearer", issuer }, { issuer: otherIssuer }), issuerMismatch)
  await assert.rejects(provider.saveClientInformation({ client_id: "wrong", issuer }, { issuer: otherIssuer }), issuerMismatch)
  assert.deepEqual([...entries], before)
  // URL-equivalent spellings remain compatible with the existing store keys.
  await provider.saveTokens({ access_token: "same", token_type: "Bearer", issuer: issuer.slice(0, -1) }, { issuer })
  assert.equal(provider.tokens({ issuer }).issuer, issuer)
})

test("unstamped or misbound stored credentials fail closed without deleting the record", async () => {
  for (const field of ["tokensByIssuer", "clientInformationByIssuer"]) {
    for (const stamp of [undefined, otherIssuer]) {
      const { entries, store, SecureCredentialError } = await fixture()
      const session = await store.load()
      session[field][issuer].issuer = stamp
      // Inject malformed legacy storage through the test backend; production
      // load must reject it rather than silently restamp or clear user data.
      await store.save(session)
      assert.ok(entries.size > 0)
      await assert.rejects(store.load(), (error: unknown) =>
        error instanceof Error && error instanceof SecureCredentialError && "code" in error && error.code === "credential_store_corrupt")
    }
  }
})

test("real SDK discovery cannot send a saved trusted credential to an alternate authorization server", async () => {
  const { entries, provider } = await fixture()
  const before = [...entries]
  const requests: { method: string; authorization: string | null; body: string }[] = []
  await assert.rejects(auth(provider, { serverUrl: endpoint, fetchFn: async (_input, init) => {
    const method = init?.method ?? "GET"
    requests.push({ method, authorization: new Headers(init?.headers).get("authorization"), body: String(init?.body ?? "") })
    if (requests.length === 1) return Response.json({ resource: endpoint, authorization_servers: [otherIssuer] })
    return Response.json({ issuer: otherIssuer, authorization_endpoint: `${otherIssuer}authorize`, token_endpoint: `${otherIssuer}token`,
      registration_endpoint: `${otherIssuer}register`, response_types_supported: ["code"], code_challenge_methods_supported: ["S256"] })
  } }), issuerMismatch)
  assert.ok(requests.length > 0)
  assert.ok(requests.every(request => request.method === "GET" && request.authorization === null && request.body === ""))
  assert.deepEqual([...entries], before)
})

test("patched SDK fetchToken refuses a foreign stamped client before any token request", async () => {
  const { provider } = await fixture()
  // Exercise the SDK's guard independently of our issuer-keyed lookup.
  const wrongProvider = Object.create(provider)
  wrongProvider.clientInformation = () => provider.clientInformation({ issuer })
  let requests = 0
  await assert.rejects(fetchToken(wrongProvider, otherIssuer, {
    authorizationCode: "fixture-code",
    metadata: { issuer: otherIssuer, authorization_endpoint: `${otherIssuer}authorize`, token_endpoint: `${otherIssuer}token`, response_types_supported: ["code"] },
    fetchFn: async () => { requests += 1; assert.fail("Credential request must be blocked") },
  }), (error: unknown) => AuthorizationServerMismatchError.isInstance(error))
  assert.equal(requests, 0)
})
