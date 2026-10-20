import { createHash, randomBytes } from "node:crypto"
import { constants, link, open, rename, stat, unlink } from "node:fs/promises"
import { basename, dirname, extname, join, resolve } from "node:path"
import type { CallToolResult } from "@modelcontextprotocol/client"

const MAX_BYTES = 128 * 1024 * 1024
export class CliNativeResultError extends Error {
  constructor(readonly code: "native_output_invalid" | "native_output_conflict" | "native_output_unavailable") { super(code) }
}
type Artifact = { bytes: number; sha256: string; mediaType: "image/png" | "video/mp4"; resource: { uri: string } }
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value)

function readArtifact(result: CallToolResult): Artifact {
  const value = result.structuredContent
  if (result.isError || !record(value) || value.ok !== true) throw new CliNativeResultError("native_output_unavailable")
  const artifact = value.kind === "native-job-result" ? value : value.artifact
  if (!record(artifact) || !Number.isSafeInteger(artifact.bytes) || Number(artifact.bytes) <= 0 || Number(artifact.bytes) > MAX_BYTES
    || typeof artifact.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(artifact.sha256)) throw new CliNativeResultError("native_output_invalid")
  if (!["image/png", "video/mp4"].includes(String(artifact.mediaType)) || !record(artifact.resource)
    || artifact.resource.authentication !== "current-oauth-bearer" || typeof artifact.resource.uri !== "string") throw new CliNativeResultError("native_output_invalid")
  return artifact as unknown as Artifact
}

/** The selected MCP origin is the only credential destination. A descriptor is
 * a selector, never authorization; redirects and caller-chosen URLs refuse. */
function privateUrl(uri: string, endpoint: string) {
  if (!/^\/api\/mcp\/download\?native=[A-Za-z0-9_-]{1,4096}$/.test(uri)) throw new CliNativeResultError("native_output_invalid")
  const origin = new URL(endpoint), url = new URL(uri, origin)
  if (url.origin !== origin.origin || origin.username || origin.password) throw new CliNativeResultError("native_output_invalid")
  return url
}

async function copyVerifiedBytes(response: Response, handle: Awaited<ReturnType<typeof open>>, artifact: Artifact, signal: AbortSignal) {
  if (response.status !== 200 || response.headers.get("content-type")?.split(";")[0] !== artifact.mediaType
    || response.headers.get("content-length") !== String(artifact.bytes) || !response.body) throw new CliNativeResultError("native_output_unavailable")
  const reader = response.body.getReader(), hash = createHash("sha256")
  let bytes = 0
  try {
    while (true) {
      signal.throwIfAborted()
      const item = await reader.read()
      signal.throwIfAborted()
      if (item.done) break
      bytes += item.value.byteLength
      if (bytes > artifact.bytes) throw new CliNativeResultError("native_output_invalid")
      hash.update(item.value)
      await handle.writeFile(item.value)
    }
    if (bytes !== artifact.bytes || hash.digest("hex") !== artifact.sha256) throw new CliNativeResultError("native_output_invalid")
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}

export async function saveNativeToolResult(input: {
  endpoint: string; result: CallToolResult; outputFile: string; overwrite: boolean; signal: AbortSignal
  getAccessToken(): Promise<string>; fetch?: typeof globalThis.fetch
}) {
  const artifact = readArtifact(input.result)
  const url = privateUrl(artifact.resource.uri, input.endpoint)
  const targetPath = resolve(input.outputFile)
  const extension = artifact.mediaType === "image/png" ? ".png" : ".mp4"
  if (extname(targetPath).toLowerCase() !== extension || basename(targetPath).length > 240
    || !(await stat(dirname(targetPath))).isDirectory()) throw new CliNativeResultError("native_output_invalid")
  const tempPath = join(dirname(targetPath), `.${basename(targetPath)}.${randomBytes(8).toString("hex")}.tmp`)
  let handle: Awaited<ReturnType<typeof open>> | null = null
  let response: Response | null = null
  try {
    input.signal.throwIfAborted()
    const token = await input.getAccessToken()
    input.signal.throwIfAborted()
    response = await (input.fetch ?? globalThis.fetch)(url, { headers: { authorization: `Bearer ${token}` },
      cache: "no-store", redirect: "error", signal: input.signal })
    handle = await open(tempPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
    await copyVerifiedBytes(response, handle, artifact, input.signal)
    await handle.sync(); await handle.close(); handle = null
    input.signal.throwIfAborted()
    if (input.overwrite) await rename(tempPath, targetPath)
    else await publishExclusive(tempPath, targetPath)
    return { outputPath: targetPath, byteSize: artifact.bytes, sha256: artifact.sha256, mimeType: artifact.mediaType }
  } catch (error) {
    if (error instanceof CliNativeResultError) throw error
    throw new CliNativeResultError("native_output_unavailable")
  } finally {
    await handle?.close().catch(() => {})
    await response?.body?.cancel().catch(() => {})
    await unlink(tempPath).catch(() => {})
  }
}
async function publishExclusive(tempPath: string, targetPath: string) {
  await link(tempPath, targetPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") throw new CliNativeResultError("native_output_conflict")
    throw error
  })
}
