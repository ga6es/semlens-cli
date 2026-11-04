import { createHash, randomBytes } from "node:crypto"
import { createReadStream, lstatSync } from "node:fs"
import { basename } from "node:path"
import { Readable } from "node:stream"
import type { Client, CallToolResult } from "@modelcontextprotocol/client"
import { executeRegisteredToolRaw, OperationalMcpError, sanitizeMachineValue } from "./operational-mcp.js"

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value)
const toolName = "prepare_native_project_media_upload"

async function inspectFile(file: string, target: unknown, signal: AbortSignal) {
  if (!record(target) || Object.keys(target).sort().join(",") !== "projectId,runtimeGeneration"
    || typeof target.projectId !== "string" || typeof target.runtimeGeneration !== "string") throw new OperationalMcpError("input_invalid")
  const stat = lstatSync(file)
  // The authenticated preparation decides capacity; local hashing and the
  // multipart body stream the file without an independent client video limit.
  if (!stat.isFile() || stat.isSymbolicLink() || !Number.isSafeInteger(stat.size) || stat.size <= 0) throw new OperationalMcpError("input_invalid")
  const hash = createHash("sha256")
  let bytes = 0
  for await (const chunk of createReadStream(file, { signal })) {
    bytes += chunk.length
    if (bytes > stat.size) throw new OperationalMcpError("input_invalid")
    hash.update(chunk)
  }
  if (bytes !== stat.size) throw new OperationalMcpError("input_invalid")
  return { projectId: target.projectId, runtimeGeneration: target.runtimeGeneration,
    filename: basename(file), byteSize: bytes, sha256: hash.digest("hex") }
}

async function boundedResult(response: Response, signal: AbortSignal) {
  if (!response.body) throw new OperationalMcpError("execution_uncertain")
  const chunks: Uint8Array[] = [], reader = response.body.getReader()
  let bytes = 0
  try {
    while (true) {
      signal.throwIfAborted()
      const entry = await reader.read()
      signal.throwIfAborted()
      if (entry.done) break
      bytes += entry.value.length
      if (bytes > 65536) throw new OperationalMcpError("execution_uncertain")
      chunks.push(entry.value)
    }
    const result: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    if (!response.ok || !record(result) || result.ok !== true) throw new OperationalMcpError("execution_uncertain")
    return sanitizeMachineValue(result)
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}

function committedTransfer(result: CallToolResult, selection: Awaited<ReturnType<typeof inspectFile>>) {
  const value = result.structuredContent
  const transfer = record(value) ? value.transfer : null
  const returnedSelection = record(transfer) && record(transfer.selection) ? transfer.selection : null
  if (result.isError || !record(value) || value.ok !== true || !record(transfer)
    || transfer.uri !== "/api/mcp/native-media" || transfer.authentication !== "current-oauth-bearer"
    || transfer.selectionHeader !== "x-semlens-native-selection" || !returnedSelection
    || Object.keys(returnedSelection).length !== Object.keys(selection).length
    || Object.entries(selection).some(([key, item]) => returnedSelection[key] !== item)) throw new OperationalMcpError("execution_failed")
  return transfer.uri
}

async function* multipartChunks(file: string, byteSize: number, header: Buffer, footer: Buffer, signal: AbortSignal) {
  signal.throwIfAborted()
  yield header
  let bytes = 0
  for await (const chunk of createReadStream(file, { signal })) {
    bytes += chunk.length
    if (bytes > byteSize) throw new OperationalMcpError("input_invalid")
    yield chunk
  }
  if (bytes !== byteSize) throw new OperationalMcpError("input_invalid")
  yield footer
}

/** Node's file-backed Blob size can wrap above 4 GiB. Frame the same one-file
 * multipart protocol over a backpressured file stream instead. */
function nativeMultipart(file: string, selection: Awaited<ReturnType<typeof inspectFile>>, signal: AbortSignal) {
  const boundary = `semlens-${randomBytes(24).toString("hex")}`
  const filename = selection.filename.replace(/[\r\n"]/g, value => `%${value.charCodeAt(0).toString(16).padStart(2, "0").toUpperCase()}`)
  const header = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`)
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`)
  const byteSize = header.length + selection.byteSize + footer.length
  if (!Number.isSafeInteger(byteSize)) throw new OperationalMcpError("input_invalid")
  return { stream: Readable.from(multipartChunks(file, selection.byteSize, header, footer, signal), { objectMode: false }),
    contentType: `multipart/form-data; boundary=${boundary}`, byteSize }
}

/** Local paths stay in the CLI. The server receives a fixed byte commitment,
 * then one multipart stream under fresh OAuth, never a local filesystem path. */
export async function uploadNativeMediaFile(input: {
  client: Client; endpoint: string; target: unknown; file: string; approveWrite: boolean; signal: AbortSignal
  getAccessToken(): Promise<string>; fetch?: typeof fetch
}) {
  if (!input.approveWrite) throw new OperationalMcpError("approval_required")
  const selection = await inspectFile(input.file, input.target, input.signal)
  const prepared = await executeRegisteredToolRaw({ client: input.client, toolName, arguments: selection,
    approvals: { external: false, write: input.approveWrite }, signal: input.signal })
  if (prepared.result.isError && record(prepared.result.structuredContent) && prepared.result.structuredContent.code === "native_video_upload_too_large") {
    return { ok: false, operationId: toolName, result: sanitizeMachineValue(prepared.result) }
  }
  const uri = committedTransfer(prepared.result, selection)
  const endpoint = new URL(input.endpoint), url = new URL(uri, endpoint)
  if (url.origin !== endpoint.origin || endpoint.username || endpoint.password) throw new OperationalMcpError("input_invalid")
  const token = await input.getAccessToken()
  input.signal.throwIfAborted()
  const body = nativeMultipart(input.file, selection, input.signal)
  try {
    const response = await (input.fetch ?? fetch)(url, { method: "POST", body: Readable.toWeb(body.stream,
      { strategy: { highWaterMark: 65536, size: (chunk: Uint8Array) => chunk.byteLength } }) as BodyInit,
      duplex: "half", signal: input.signal,
      redirect: "error", cache: "no-store", headers: { authorization: `Bearer ${token}`,
        "content-type": body.contentType, "content-length": String(body.byteSize),
        "x-semlens-native-selection": Buffer.from(JSON.stringify(selection)).toString("base64url") } } as RequestInit & { duplex: "half" })
    return { ok: true, operationId: toolName, result: await boundedResult(response, input.signal) }
  } catch { throw new OperationalMcpError("execution_uncertain") }
  finally { body.stream.destroy() }
}
