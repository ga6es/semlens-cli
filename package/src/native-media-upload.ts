import { createHash } from "node:crypto"
import { createReadStream, lstatSync, openAsBlob } from "node:fs"
import { basename } from "node:path"
import type { Client, CallToolResult } from "@modelcontextprotocol/client"
import { executeRegisteredToolRaw, OperationalMcpError, sanitizeMachineValue } from "./operational-mcp.js"

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value)
const toolName = "prepare_native_project_media_upload"

async function inspectFile(file: string, target: unknown, signal: AbortSignal) {
  if (!record(target) || Object.keys(target).sort().join(",") !== "projectId,runtimeGeneration"
    || typeof target.projectId !== "string" || typeof target.runtimeGeneration !== "string") throw new OperationalMcpError("input_invalid")
  const stat = lstatSync(file)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > 500 * 1024 * 1024) throw new OperationalMcpError("input_invalid")
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
  const uri = committedTransfer(prepared.result, selection)
  const endpoint = new URL(input.endpoint), url = new URL(uri, endpoint)
  if (url.origin !== endpoint.origin || endpoint.username || endpoint.password) throw new OperationalMcpError("input_invalid")
  const form = new FormData()
  form.append("files", await openAsBlob(input.file, { type: "application/octet-stream" }), selection.filename)
  const token = await input.getAccessToken()
  input.signal.throwIfAborted()
  try {
    const response = await (input.fetch ?? fetch)(url, { method: "POST", body: form, signal: input.signal,
      redirect: "error", cache: "no-store", headers: { authorization: `Bearer ${token}`,
        "x-semlens-native-selection": Buffer.from(JSON.stringify(selection)).toString("base64url") } })
    return { ok: true, operationId: toolName, result: await boundedResult(response, input.signal) }
  } catch { throw new OperationalMcpError("execution_uncertain") }
}
