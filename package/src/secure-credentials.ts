import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { closeSync, openSync, readFileSync, statSync, unlinkSync, writeSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type {
  OAuthDiscoveryState,
  StoredOAuthClientInformation,
  StoredOAuthTokens,
} from "@modelcontextprotocol/client"

const CREDENTIAL_SERVICE = "com.semlens.cli.oauth"
const MAX_SESSION_BYTES = 64 * 1024
const PROTECTED_CHUNK_BYTES = 720
const MAX_PROTECTED_CHUNKS = 96
const STALE_LOCK_MS = 15 * 60 * 1000

export type StoredOAuthSession = {
  clientInformationByIssuer: Record<string, StoredOAuthClientInformation>
  discoveryState?: OAuthDiscoveryState
  endpoint: string
  resource?: string
  tokensByIssuer: Record<string, StoredOAuthTokens>
  updatedAt: string
  version: 1
}

export type CredentialEntry = {
  deletePassword(signal?: AbortSignal): Promise<boolean>
  getPassword(signal?: AbortSignal): Promise<string | null | undefined>
  setPassword(password: string, signal?: AbortSignal): Promise<void>
}

export type CredentialEntryFactory = (
  account: string,
) => Promise<CredentialEntry> | CredentialEntry

type CredentialGeneration = {
  chunks: number
  generation: string
}

type CredentialManifest = CredentialGeneration & {
  bytes: number
  sha256: string
  stale?: CredentialGeneration[]
  version: 1
}

type CredentialCleanupLedger = {
  generations: CredentialGeneration[]
  version: 1
}

export class SecureCredentialError extends Error {
  constructor(
    readonly code:
      | "credential_store_corrupt"
      | "credential_store_unavailable"
      | "credential_too_large"
      | "session_busy"
      | "unsupported_platform",
  ) {
    super(code)
    this.name = "SecureCredentialError"
  }
}

function endpointKey(endpoint: string) {
  return createHash("sha256").update(endpoint).digest("hex")
}

function sha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isSafeIssuer(value: string) {
  try {
    const url = new URL(value)
    const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost"
    return (
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.protocol === "https:" || (loopback && url.protocol === "http:"))
    )
  } catch {
    return false
  }
}

function hasValidCredentialMaps(session: Record<string, unknown>) {
  const clients = session.clientInformationByIssuer
  const tokens = session.tokensByIssuer
  if (!isRecord(clients) || !isRecord(tokens)) return false
  if (Object.keys(clients).length > 8 || Object.keys(tokens).length > 8) return false
  const validClients = Object.entries(clients).every(
    ([issuer, value]) =>
      isSafeIssuer(issuer) &&
      isRecord(value) &&
      typeof value.client_id === "string" &&
      value.client_id.length <= 2_048 &&
      value.issuer === issuer,
  )
  const validTokens = Object.entries(tokens).every(
    ([issuer, value]) =>
      isSafeIssuer(issuer) &&
      isRecord(value) &&
      typeof value.access_token === "string" &&
      value.access_token.length <= 32_768 &&
      typeof value.token_type === "string" &&
      value.issuer === issuer,
  )
  return validClients && validTokens
}

function parseStoredSession(value: string, endpoint: string): StoredOAuthSession {
  if (Buffer.byteLength(value, "utf8") > MAX_SESSION_BYTES) {
    throw new SecureCredentialError("credential_store_corrupt")
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new SecureCredentialError("credential_store_corrupt")
  }
  if (
    !isRecord(parsed) ||
    parsed.version !== 1 ||
    parsed.endpoint !== endpoint ||
    typeof parsed.updatedAt !== "string" ||
    !hasValidCredentialMaps(parsed) ||
    (parsed.resource !== undefined && parsed.resource !== endpoint)
  ) {
    throw new SecureCredentialError("credential_store_corrupt")
  }
  return parsed as StoredOAuthSession
}

function isBoundedInteger(value: unknown, minimum: number, maximum: number) {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
  )
}

function isFixedHex(value: unknown, length: number) {
  return (
    typeof value === "string" &&
    value.length === length &&
    /^[a-f0-9]+$/.test(value)
  )
}

function isValidGeneration(value: unknown): value is CredentialGeneration {
  return (
    isRecord(value) &&
    isBoundedInteger(value.chunks, 1, MAX_PROTECTED_CHUNKS) &&
    isFixedHex(value.generation, 32)
  )
}

function isValidManifest(parsed: unknown): parsed is CredentialManifest {
  if (!isRecord(parsed)) return false
  const stale = parsed.stale
  const digest = parsed.sha256
  return (
    parsed.version === 1 &&
    isBoundedInteger(parsed.bytes, 1, MAX_SESSION_BYTES) &&
    isValidGeneration(parsed) &&
    isFixedHex(digest, 64) &&
    (stale === undefined ||
      (Array.isArray(stale) &&
        stale.length <= 8 &&
        stale.every(isValidGeneration)))
  )
}

function parseManifest(value: string): CredentialManifest {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new SecureCredentialError("credential_store_corrupt")
  }
  if (!isValidManifest(parsed)) {
    throw new SecureCredentialError("credential_store_corrupt")
  }
  return parsed
}

function parseCleanupLedger(value: string): CredentialCleanupLedger {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new SecureCredentialError("credential_store_corrupt")
  }
  if (
    !isRecord(parsed) ||
    parsed.version !== 1 ||
    !Array.isArray(parsed.generations) ||
    parsed.generations.length > 8 ||
    !parsed.generations.every(isValidGeneration)
  ) {
    throw new SecureCredentialError("credential_store_corrupt")
  }
  return parsed as CredentialCleanupLedger
}

async function createSystemEntry(account: string): Promise<CredentialEntry> {
  if (process.platform !== "win32") {
    throw new SecureCredentialError("unsupported_platform")
  }
  try {
    const { AsyncEntry } = await import("@napi-rs/keyring")
    return new AsyncEntry(CREDENTIAL_SERVICE, account)
  } catch {
    throw new SecureCredentialError("credential_store_unavailable")
  }
}

function sameText(left: string, right: string) {
  const leftBytes = Buffer.from(left)
  const rightBytes = Buffer.from(right)
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  )
}

export class ProtectedCredentialStore {
  private readonly accountPrefix: string

  constructor(
    readonly endpoint: string,
    private readonly entryFactory: CredentialEntryFactory = createSystemEntry,
  ) {
    this.accountPrefix = endpointKey(endpoint)
  }

  private manifestAccount() {
    return `${this.accountPrefix}:manifest`
  }

  private cleanupAccount() {
    return `${this.accountPrefix}:cleanup`
  }

  private chunkAccount(generation: string, index: number) {
    return `${this.accountPrefix}:${generation}:${index}`
  }

  private async readPassword(account: string, signal?: AbortSignal) {
    try {
      return await (await this.entryFactory(account)).getPassword(signal)
    } catch (error) {
      if (error instanceof SecureCredentialError) throw error
      throw new SecureCredentialError("credential_store_unavailable")
    }
  }

  private async writePassword(
    account: string,
    value: string,
    signal?: AbortSignal,
  ) {
    try {
      const entry = await this.entryFactory(account)
      await entry.setPassword(value, signal)
      const readback = await entry.getPassword(signal)
      if (!readback || !sameText(readback, value)) {
        throw new Error("credential verification failed")
      }
    } catch (error) {
      if (error instanceof SecureCredentialError) throw error
      throw new SecureCredentialError("credential_store_unavailable")
    }
  }

  private async deleteAccount(account: string, signal?: AbortSignal) {
    try {
      return await (await this.entryFactory(account)).deletePassword(signal)
    } catch (error) {
      if (error instanceof SecureCredentialError) throw error
      throw new SecureCredentialError("credential_store_unavailable")
    }
  }

  private async deleteGeneration(
    generation: CredentialGeneration,
    signal?: AbortSignal,
    bestEffort = false,
  ) {
    for (let index = 0; index < generation.chunks; index += 1) {
      try {
        await this.deleteAccount(
          this.chunkAccount(generation.generation, index),
          signal,
        )
      } catch (error) {
        if (!bestEffort) throw error
      }
    }
  }

  private async cleanupStaleGenerations(
    manifest: CredentialManifest,
    signal?: AbortSignal,
  ) {
    if (!manifest.stale?.length) return
    try {
      for (const generation of manifest.stale) {
        await this.deleteGeneration(generation, signal)
      }
      await this.writePassword(
        this.manifestAccount(),
        JSON.stringify({ ...manifest, stale: [] }),
        signal,
      )
    } catch {
      // The committed manifest retains exact bounded cleanup metadata. A later
      // save or logout can safely retry deletion without losing the session.
    }
  }

  private async readCleanupLedger(signal?: AbortSignal) {
    const value = await this.readPassword(this.cleanupAccount(), signal)
    return value === undefined || value === null
      ? []
      : parseCleanupLedger(value).generations
  }

  private async writeCleanupLedger(
    generations: CredentialGeneration[],
    signal?: AbortSignal,
  ) {
    if (generations.length > 8) {
      throw new SecureCredentialError("credential_store_unavailable")
    }
    if (generations.length === 0) {
      await this.deleteAccount(this.cleanupAccount(), signal)
      return
    }
    await this.writePassword(
      this.cleanupAccount(),
      JSON.stringify({ generations, version: 1 }),
      signal,
    )
  }

  private async reconcileCleanupLedger(
    active: CredentialManifest | null,
    signal?: AbortSignal,
  ) {
    const retained: CredentialGeneration[] = []
    for (const generation of await this.readCleanupLedger(signal)) {
      const isActive =
        active?.generation === generation.generation &&
        active.chunks === generation.chunks
      if (isActive) continue
      try {
        await this.deleteGeneration(generation, signal)
      } catch {
        retained.push(generation)
      }
    }
    await this.writeCleanupLedger(retained, signal)
    return retained
  }

  async load(signal?: AbortSignal) {
    const manifestValue = await this.readPassword(this.manifestAccount(), signal)
    if (manifestValue === undefined || manifestValue === null) return null
    const manifest = parseManifest(manifestValue)
    const chunks: Buffer[] = []
    for (let index = 0; index < manifest.chunks; index += 1) {
      const value = await this.readPassword(
        this.chunkAccount(manifest.generation, index),
        signal,
      )
      if (!value) throw new SecureCredentialError("credential_store_corrupt")
      chunks.push(Buffer.from(value, "base64"))
    }
    const serialized = Buffer.concat(chunks)
    if (
      serialized.length !== manifest.bytes ||
      sha256(serialized) !== manifest.sha256
    ) {
      throw new SecureCredentialError("credential_store_corrupt")
    }
    return parseStoredSession(serialized.toString("utf8"), this.endpoint)
  }

  async save(session: StoredOAuthSession, signal?: AbortSignal) {
    const serialized = Buffer.from(JSON.stringify(session), "utf8")
    if (serialized.length > MAX_SESSION_BYTES) {
      throw new SecureCredentialError("credential_too_large")
    }
    const generation = randomBytes(16).toString("hex")
    const chunks: string[] = []
    for (let offset = 0; offset < serialized.length; offset += PROTECTED_CHUNK_BYTES) {
      chunks.push(
        serialized.subarray(offset, offset + PROTECTED_CHUNK_BYTES).toString("base64"),
      )
    }
    if (chunks.length < 1 || chunks.length > MAX_PROTECTED_CHUNKS) {
      throw new SecureCredentialError("credential_too_large")
    }
    const previousValue = await this.readPassword(this.manifestAccount(), signal)
    let previousManifest: CredentialManifest | null = null
    if (previousValue) {
      try {
        previousManifest = parseManifest(previousValue)
      } catch {
        previousManifest = null
      }
    }
    const pendingCleanup = await this.reconcileCleanupLedger(
      previousManifest,
      signal,
    )
    const newGeneration = { chunks: chunks.length, generation }
    await this.writeCleanupLedger(
      [...pendingCleanup, newGeneration],
      signal,
    )
    const stale = previousManifest
      ? [
          {
            chunks: previousManifest.chunks,
            generation: previousManifest.generation,
          },
          ...(previousManifest.stale ?? []),
        ]
      : []
    if (stale.length > 8) {
      throw new SecureCredentialError("credential_store_unavailable")
    }
    const manifest: CredentialManifest = {
      bytes: serialized.length,
      chunks: chunks.length,
      generation,
      sha256: sha256(serialized),
      stale,
      version: 1,
    }
    try {
      for (const [index, chunk] of chunks.entries()) {
        await this.writePassword(this.chunkAccount(generation, index), chunk, signal)
      }
    } catch (error) {
      await this.deleteGeneration(manifest, signal, true)
      throw error
    }
    // Once manifest replacement begins, commitment is uncertain until
    // readback. Retain the new generation on any failure because the manifest
    // may already reference it.
    await this.writePassword(
      this.manifestAccount(),
      JSON.stringify(manifest),
      signal,
    )
    await this.writeCleanupLedger(pendingCleanup, signal).catch(() => undefined)
    await this.cleanupStaleGenerations(manifest, signal)
  }

  async delete(signal?: AbortSignal) {
    const manifestValue = await this.readPassword(this.manifestAccount(), signal)
    const cleanup = await this.readCleanupLedger(signal)
    if (
      (manifestValue === undefined || manifestValue === null) &&
      cleanup.length === 0
    ) {
      return false
    }
    let manifest: CredentialManifest | null = null
    if (manifestValue !== undefined && manifestValue !== null) {
      manifest = parseManifest(manifestValue)
    }
    if (manifest) {
      await this.deleteGeneration(manifest, signal)
      for (const generation of manifest.stale ?? []) {
        await this.deleteGeneration(generation, signal)
      }
    }
    for (const generation of cleanup) {
      await this.deleteGeneration(generation, signal)
    }
    const manifestDeleted = await this.deleteAccount(
      this.manifestAccount(),
      signal,
    )
    const cleanupDeleted = await this.deleteAccount(
      this.cleanupAccount(),
      signal,
    )
    return manifestDeleted || cleanupDeleted
  }
}

function readLockOwner(path: string, size: number) {
  if (size < 1 || size > 128) return null
  try {
    const raw = readFileSync(path, "utf8")
    const owner: unknown = JSON.parse(raw)
    if (isRecord(owner) && Number.isSafeInteger(owner.pid) && Number(owner.pid) > 0 &&
      typeof owner.token === "string" && /^[a-f0-9]{32}$/u.test(owner.token)) {
      return { pid: owner.pid as number, raw }
    }
  } catch {
    // Legacy and incomplete locks retain the conservative age-based recovery.
  }
  return null
}

function removeStaleLock(path: string) {
  try {
    const stats = statSync(path)
    const owner = readLockOwner(path, stats.size)
    if (owner) {
      try {
        process.kill(owner.pid as number, 0)
        return false
      } catch (error) {
        if (!isRecord(error) || error.code !== "ESRCH") return false
      }
      // A new owner may have replaced the file while liveness was checked.
      if (readFileSync(path, "utf8") !== owner.raw) return false
    } else if (Date.now() - stats.mtimeMs <= STALE_LOCK_MS) {
      return false
    }
    unlinkSync(path)
    return true
  } catch {
    return false
  }
}

function acquireEndpointLock(endpoint: string) {
  const path = join(tmpdir(), `semlens-cli-${endpointKey(endpoint)}.lock`)
  const recoveryPath = `${path}.recovery`
  let recoveryDescriptor: number | null = null
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const descriptor = openSync(path, "wx")
        const token = randomBytes(16).toString("hex")
        try {
          writeSync(descriptor, JSON.stringify({ pid: process.pid, token }))
        } catch (error) {
          closeSync(descriptor)
          unlinkSync(path)
          throw error
        }
        return { descriptor, path, token }
      } catch (error) {
        const code = isRecord(error) ? error.code : null
        if (code !== "EEXIST" || attempt > 0) {
          throw new SecureCredentialError("session_busy")
        }
        try {
          recoveryDescriptor = openSync(recoveryPath, "wx")
        } catch {
          throw new SecureCredentialError("session_busy")
        }
        // Recheck only after claiming recovery, and keep the guard until the
        // replacement lock is created. Never auto-reclaim a stranded guard:
        // doing so would recreate this same check/unlink race.
        if (!removeStaleLock(path)) {
          throw new SecureCredentialError("session_busy")
        }
      }
    }
  } finally {
    if (recoveryDescriptor !== null) {
      // Cleanup failure must not hide a successfully acquired endpoint lock:
      // its caller still needs the descriptor so it can release that lock.
      try {
        closeSync(recoveryDescriptor)
      } catch {
        // A stranded recovery guard fails closed until explicitly repaired.
      }
      try {
        unlinkSync(recoveryPath)
      } catch {
        // Never auto-reclaim this guard; doing so reopens the recovery race.
      }
    }
  }
  throw new SecureCredentialError("session_busy")
}

export async function withEndpointCredentialLock<T>(
  endpoint: string,
  run: () => Promise<T>,
) {
  const lock = acquireEndpointLock(endpoint)
  let released = false
  const release = () => {
    if (released) return
    released = true
    closeSync(lock.descriptor)
    try {
      const owner = JSON.parse(readFileSync(lock.path, "utf8")) as { token?: string }
      if (owner.token === lock.token) unlinkSync(lock.path)
    } catch {
      // A replacement lock belongs to another process; preserve it.
    }
  }
  process.once("exit", release)
  try {
    return await run()
  } finally {
    process.off("exit", release)
    release()
  }
}
