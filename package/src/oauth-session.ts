import { randomBytes } from "node:crypto"
import { createServer, type Server } from "node:http"
import {
  Client,
  IssuerMismatchError,
  StreamableHTTPClientTransport,
  UnauthorizedError,
  type FetchLike,
  type OAuthClientInformationContext,
  type OAuthClientMetadata,
  type OAuthClientProvider,
  type OAuthDiscoveryState,
  type StoredOAuthClientInformation,
  type StoredOAuthTokens,
} from "@modelcontextprotocol/client"
import open from "open"
import { SEMLENS_MCP_SERVER_MANIFEST } from "./manifest.js"
import { assertSafeDiscoveryState, assertSafeOAuthUrl } from "./oauth-session-safety.js"
import {
  ProtectedCredentialStore,
  SecureCredentialError,
  type StoredOAuthSession,
} from "./secure-credentials.js"

const CALLBACK_HOST = "127.0.0.1"
const CALLBACK_PATH = "/oauth/callback"
// Native OAuth callbacks use an available OS-assigned loopback port (RFC 8252).
const CALLBACK_PORT = 0
const MAX_CALLBACK_URL_LENGTH = 8_192

export class OAuthSessionError extends Error {
  constructor(
    readonly code:
      | "authorization_cancelled"
      | "authorization_failed"
      | "authorization_timeout"
      | "browser_launch_failed"
      | "callback_unavailable"
      | "issuer_mismatch"
      | "reauth_required"
      | "resource_mismatch",
  ) {
    super(code)
    this.name = "OAuthSessionError"
  }
}

function createEmptySession(endpoint: string): StoredOAuthSession {
  return {
    clientInformationByIssuer: {},
    endpoint,
    tokensByIssuer: {},
    updatedAt: new Date().toISOString(),
    version: 1,
  }
}

function normalizeUrl(value: string | URL) {
  return new URL(value).toString()
}

function readStampedIssuer(value: unknown) {
  return value && typeof value === "object" && "issuer" in value
    ? String((value as { issuer?: unknown }).issuer ?? "")
    : ""
}

function resolveIssuer(
  context: OAuthClientInformationContext | undefined,
  value?: unknown,
) {
  const issuer = context?.issuer ?? readStampedIssuer(value)
  if (!issuer) throw new OAuthSessionError("issuer_mismatch")
  return normalizeUrl(issuer)
}

export class ProtectedOAuthProvider implements OAuthClientProvider {
  private codeVerifierValue: string | null = null
  private latestIssuer: string | null

  constructor(
    private readonly store: Pick<ProtectedCredentialStore, "endpoint" | "save" | "delete">,
    private session: StoredOAuthSession,
    readonly redirectUrl: string,
    private readonly stateValue: string,
    private readonly launchAuthorization: (url: URL) => Promise<void>,
    private readonly operationSignal?: AbortSignal,
    private forceClientRegistration = false,
  ) {
    if (session.discoveryState) assertSafeDiscoveryState(session.discoveryState, store.endpoint)
    this.latestIssuer = Object.keys(session.tokensByIssuer).at(-1) ?? null
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      application_type: "native",
      client_name: "Semlens CLI",
      client_uri: "https://semlens.com/docs/mcp",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: [this.redirectUrl],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }
  }

  state() {
    return this.stateValue
  }

  clientInformation(context?: OAuthClientInformationContext) {
    // Explicit login must register the exact callback port selected for this transaction.
    if (this.forceClientRegistration) return undefined
    const issuer = context?.issuer
    return issuer ? this.session.clientInformationByIssuer[normalizeUrl(issuer)] : undefined
  }

  async saveClientInformation(
    clientInformation: StoredOAuthClientInformation,
    context?: OAuthClientInformationContext,
  ) {
    const issuer = resolveIssuer(context, clientInformation)
    this.session.clientInformationByIssuer[issuer] = {
      ...clientInformation,
      issuer,
    }
    await this.persist()
    this.forceClientRegistration = false
  }

  tokens(context?: OAuthClientInformationContext) {
    const issuer = context?.issuer ? normalizeUrl(context.issuer) : this.latestIssuer
    return issuer ? this.session.tokensByIssuer[issuer] : undefined
  }

  accessToken() {
    const accessToken = this.tokens()?.access_token
    if (!accessToken) throw new OAuthSessionError("reauth_required")
    return accessToken
  }

  async saveTokens(
    tokens: StoredOAuthTokens,
    context?: OAuthClientInformationContext,
  ) {
    const issuer = resolveIssuer(context, tokens)
    this.session.tokensByIssuer[issuer] = { ...tokens, issuer }
    this.latestIssuer = issuer
    await this.persist()
  }

  async redirectToAuthorization(authorizationUrl: URL) {
    assertSafeOAuthUrl(authorizationUrl, this.store.endpoint, true)
    await this.launchAuthorization(authorizationUrl)
  }

  saveCodeVerifier(codeVerifier: string) {
    this.codeVerifierValue = codeVerifier
  }

  codeVerifier() {
    if (!this.codeVerifierValue) throw new OAuthSessionError("reauth_required")
    return this.codeVerifierValue
  }

  async validateResourceURL(serverUrl: string | URL, resource?: string) {
    const expected = normalizeUrl(this.store.endpoint)
    if (normalizeUrl(serverUrl) !== expected) {
      throw new OAuthSessionError("resource_mismatch")
    }
    if (resource && normalizeUrl(resource) !== expected) {
      throw new OAuthSessionError("resource_mismatch")
    }
    this.session.resource = expected
    return new URL(expected)
  }

  async invalidateCredentials(
    scope: "all" | "client" | "tokens" | "verifier" | "discovery",
  ) {
    if (scope === "all") {
      this.operationSignal?.throwIfAborted()
      this.session = createEmptySession(this.store.endpoint)
      this.latestIssuer = null
      this.codeVerifierValue = null
      await this.store.delete()
      return
    }
    if (scope === "client") this.session.clientInformationByIssuer = {}
    if (scope === "tokens") {
      this.session.tokensByIssuer = {}
      this.latestIssuer = null
    }
    if (scope === "verifier") this.codeVerifierValue = null
    if (scope === "discovery") delete this.session.discoveryState
    await this.persist()
  }

  async saveDiscoveryState(state: OAuthDiscoveryState) {
    assertSafeDiscoveryState(state, this.store.endpoint)
    const issuer = normalizeUrl(state.authorizationServerUrl)
    const existingIssuers = [
      ...Object.keys(this.session.clientInformationByIssuer),
      ...Object.keys(this.session.tokensByIssuer),
    ]
    if (existingIssuers.some((value) => value !== issuer)) {
      throw new OAuthSessionError("issuer_mismatch")
    }
    this.session.discoveryState = {
      ...state,
      authorizationServerUrl: issuer,
    }
    await this.persist()
  }

  discoveryState() {
    return this.session.discoveryState
  }

  private async persist() {
    this.operationSignal?.throwIfAborted()
    this.session.updatedAt = new Date().toISOString()
    await this.store.save(this.session)
  }
}

type CallbackReceiver = {
  callback: Promise<URLSearchParams>
  close: () => Promise<void>
  redirectUrl: string
}

function closeServer(server: Server) {
  return new Promise<void>((resolve) => {
    // Allow the success page to finish, then terminate a browser connection
    // that would otherwise keep a completed login and its lock alive.
    const forceClose = setTimeout(() => server.closeAllConnections(), 250)
    forceClose.unref()
    server.close(() => {
      clearTimeout(forceClose)
      resolve()
    })
  })
}

function respond(response: import("node:http").ServerResponse, status: number) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    "Content-Type": "text/html; charset=utf-8",
    Pragma: "no-cache",
  })
  response.end(
    status === 200
      ? "<!doctype html><title>Semlens authorized</title><p>Authorization complete. You can close this window.</p>"
      : "<!doctype html><title>Semlens authorization failed</title><p>Authorization could not be completed. Return to the terminal.</p>",
  )
}

export async function createLoopbackCallbackReceiver(input: {
  expectedState: string
  timeoutMs: number
  port?: number
}): Promise<CallbackReceiver> {
  let settle: ((value: URLSearchParams) => void) | null = null
  let fail: ((error: Error) => void) | null = null
  let settled = false
  const callback = new Promise<URLSearchParams>((resolve, reject) => {
    settle = resolve
    fail = reject
  })
  const server = createServer((request, response) => {
    if (settled) {
      respond(response, 409)
      return
    }
    const rawUrl = request.url ?? ""
    if (rawUrl.length > MAX_CALLBACK_URL_LENGTH) {
      respond(response, 400)
      return
    }
    const url = new URL(rawUrl, `http://${CALLBACK_HOST}`)
    if (request.method !== "GET" || url.pathname !== CALLBACK_PATH) {
      respond(response, 404)
      return
    }
    settled = true
    if (url.searchParams.get("state") !== input.expectedState) {
      respond(response, 400)
      fail?.(new OAuthSessionError("authorization_failed"))
      return
    }
    if (url.searchParams.has("error") || !url.searchParams.get("code")) {
      respond(response, 400)
      fail?.(new OAuthSessionError("authorization_cancelled"))
      return
    }
    respond(response, 200)
    settle?.(new URLSearchParams(url.searchParams))
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", () => reject(new OAuthSessionError("callback_unavailable")))
    server.listen(input.port ?? CALLBACK_PORT, CALLBACK_HOST, () => resolve())
  })
  const address = server.address()
  const port = typeof address === "object" && address ? address.port : CALLBACK_PORT
  const timer = setTimeout(() => {
    if (!settled) {
      settled = true
      fail?.(new OAuthSessionError("authorization_timeout"))
    }
  }, input.timeoutMs)
  timer.unref()
  return {
    callback,
    close: async () => {
      clearTimeout(timer)
      await closeServer(server)
    },
    redirectUrl: `http://${CALLBACK_HOST}:${port}${CALLBACK_PATH}`,
  }
}

function createMcpClient() {
  return new Client(
    { name: "semlens-cli", version: SEMLENS_MCP_SERVER_MANIFEST.cli.currentVersion },
    {
      capabilities: {},
      versionNegotiation: { mode: "auto", probe: { maxRetries: 0 } },
    },
  )
}

export function createBoundedFetch(
  operationSignal: AbortSignal,
  fetchImplementation: FetchLike = globalThis.fetch,
  endpoint?: string,
): FetchLike {
  return async (url, init) => {
    operationSignal.throwIfAborted()
    if (endpoint) assertSafeOAuthUrl(url instanceof Request ? url.url : url, endpoint)
    const signal = init?.signal
      ? AbortSignal.any([operationSignal, init.signal])
      : operationSignal
    return fetchImplementation(url, {
      ...init,
      redirect: "error",
      signal,
    })
  }
}

export async function connectAuthenticatedMcp(input: {
  endpoint: string
  provider: OAuthClientProvider
  signal: AbortSignal
}) {
  const client = createMcpClient()
  const transport = new StreamableHTTPClientTransport(new URL(input.endpoint), {
    authProvider: input.provider,
    fetch: createBoundedFetch(input.signal, globalThis.fetch, input.endpoint),
    maxStepUpRetries: 0,
    onInsufficientScope: "throw",
  })
  try {
    await client.connect(transport, { signal: input.signal })
    return { client, transport }
  } catch (error) {
    await client.close().catch(() => undefined)
    throw error
  }
}

async function safeClose(client: Client | null) {
  try {
    await client?.close()
  } catch {
    // Closing is best-effort after the authoritative operation outcome.
  }
}

export async function loginWithBrowser(input: {
  callbackPort?: number
  endpoint: string
  onAuthorizationUrl?: (url: URL) => Promise<void>
  timeoutMs: number
  store?: ProtectedCredentialStore
}) {
  const store = input.store ?? new ProtectedCredentialStore(input.endpoint)
  const signal = AbortSignal.timeout(input.timeoutMs)
  const session = (await store.load(signal)) ?? createEmptySession(input.endpoint)
  // Login is a replacement transaction. Failed/cancelled authorization must not
  // overwrite a working session, including its discovery/client registration.
  let stagedSession = structuredClone(session)
  const stagingStore = {
    endpoint: input.endpoint,
    save: async (value: StoredOAuthSession) => { stagedSession = structuredClone(value) },
    delete: async () => { stagedSession = createEmptySession(input.endpoint); return true },
  }
  const state = randomBytes(32).toString("hex")
  const receiver = await createLoopbackCallbackReceiver({
    expectedState: state,
    port: input.callbackPort,
    timeoutMs: input.timeoutMs,
  })
  const callbackOutcome = receiver.callback.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ error, ok: false as const }),
  )
  let firstClient: Client | null = null
  try {
    const provider = new ProtectedOAuthProvider(
      stagingStore,
      session,
      receiver.redirectUrl,
      state,
      async (url) => {
        try {
          // Controlled login uses the same validated URL and callback transaction.
          if (input.onAuthorizationUrl) await input.onAuthorizationUrl(url)
          else await open(url.toString(), { wait: false })
        } catch {
          throw new OAuthSessionError("browser_launch_failed")
        }
      },
      signal,
      true,
    )
    await provider.invalidateCredentials("tokens")
    try {
      const connected = await connectAuthenticatedMcp({
        endpoint: input.endpoint,
        provider,
        signal,
      })
      firstClient = connected.client
      await store.save(stagedSession, signal)
      return { authenticated: true, verified: true }
    } catch (error) {
      if (!UnauthorizedError.isInstance(error)) throw error
    }
    const callbackResult = await callbackOutcome
    if (!callbackResult.ok) throw callbackResult.error
    const exchangeTransport = new StreamableHTTPClientTransport(
      new URL(input.endpoint),
      {
        authProvider: provider,
        fetch: createBoundedFetch(signal, globalThis.fetch, input.endpoint),
      },
    )
    try {
      await exchangeTransport.finishAuth(callbackResult.value)
    } catch (error) {
      if (IssuerMismatchError.isInstance(error)) {
        throw new OAuthSessionError("issuer_mismatch")
      }
      throw new OAuthSessionError("authorization_failed")
    } finally {
      await exchangeTransport.close().catch(() => undefined)
    }
    const connected = await connectAuthenticatedMcp({
      endpoint: input.endpoint,
      provider,
      signal,
    })
    await safeClose(connected.client)
    await store.save(stagedSession, signal)
    return { authenticated: true, verified: true }
  } catch (error) {
    if (signal.aborted) throw new OAuthSessionError("authorization_timeout")
    if (error instanceof OAuthSessionError || error instanceof SecureCredentialError) {
      throw error
    }
    throw new OAuthSessionError("authorization_failed")
  } finally {
    await safeClose(firstClient)
    await receiver.close()
  }
}

export async function createStoredSessionProvider(input: {
  endpoint: string
  signal?: AbortSignal
  store?: ProtectedCredentialStore
}) {
  const store = input.store ?? new ProtectedCredentialStore(input.endpoint)
  const session = await store.load(input.signal)
  if (!session || Object.keys(session.tokensByIssuer).length === 0) {
    throw new OAuthSessionError("reauth_required")
  }
  return new ProtectedOAuthProvider(
    store,
    session,
    `http://${CALLBACK_HOST}:${CALLBACK_PORT}${CALLBACK_PATH}`,
    randomBytes(32).toString("hex"),
    async () => {
      throw new OAuthSessionError("reauth_required")
    },
    input.signal,
  )
}
