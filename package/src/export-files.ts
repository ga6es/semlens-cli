import { createHash, randomBytes } from "node:crypto"
import { constants } from "node:fs"
import { link, open, rename, stat, unlink } from "node:fs/promises"
import { basename, dirname, extname, join, resolve } from "node:path"
import type { CallToolResult } from "@modelcontextprotocol/client"
import { SEMLENS_MCP_SERVER_MANIFEST } from "./manifest.js"

const MAX_MP4_EXPORT_BYTES = 50 * 1024 * 1024
const MAX_ARCHIVE_EXPORT_BYTES = 200 * 1024 * 1024
const DOWNLOAD_TIMEOUT_MS = 300_000
const DOWNLOAD_PATH = "/api/mcp/download"
const HOSTED_DOWNLOAD_ORIGIN = "https://semlens.com"
const CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{40,8192}$/u

export class CliExportFileError extends Error {
  constructor(readonly code:
    | "export_output_conflict"
    | "export_output_invalid"
    | "export_output_unavailable"
    | "export_transfer_failed",
  ) {
    super(code)
    this.name = "CliExportFileError"
  }
}

type ExportArtifact = {
  contentType: "application/zip" | "video/mp4"
  fileSize: number
  filename: string
  url: URL
}

function maxExportBytes(contentType: ExportArtifact["contentType"]) {
  return contentType === "application/zip" ? MAX_ARCHIVE_EXPORT_BYTES : MAX_MP4_EXPORT_BYTES
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function readTrustedDownloadUrl(value: unknown, endpoint: string) {
  if (typeof value !== "string") throw new CliExportFileError("export_output_unavailable")
  let url: URL
  try { url = new URL(value) } catch { throw new CliExportFileError("export_output_unavailable") }
  const endpointUrl = new URL(endpoint)
  const hosted = endpointUrl.href === SEMLENS_MCP_SERVER_MANIFEST.canonicalEndpoint &&
    url.origin === HOSTED_DOWNLOAD_ORIGIN
  if ((!hosted && url.origin !== endpointUrl.origin) ||
    url.protocol !== endpointUrl.protocol || url.username || url.password || url.hash ||
    url.pathname !== DOWNLOAD_PATH || url.searchParams.size !== 1 ||
    !CAPABILITY_PATTERN.test(url.searchParams.get("capability") ?? "")) {
    throw new CliExportFileError("export_output_unavailable")
  }
  return url
}

function readExportArtifact(result: CallToolResult, endpoint: string): ExportArtifact {
  const structured = result.structuredContent
  const artifact = isRecord(structured) && isRecord(structured.artifact)
    ? structured.artifact : null
  if (result.isError || !artifact || artifact.downloadAvailable !== true) {
    throw new CliExportFileError("export_output_unavailable")
  }
  const contentType = artifact.contentType
  if (contentType !== "application/zip" && contentType !== "video/mp4") {
    throw new CliExportFileError("export_output_unavailable")
  }
  const expectedExtension = contentType === "application/zip" ? ".zip" : ".mp4"
  if (typeof artifact.filename !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,239}$/u.test(artifact.filename) ||
    extname(artifact.filename).toLowerCase() !== expectedExtension ||
    !Number.isSafeInteger(artifact.fileSize) || Number(artifact.fileSize) < 1 ||
    Number(artifact.fileSize) > maxExportBytes(contentType)) {
    throw new CliExportFileError("export_output_unavailable")
  }
  return {
    contentType,
    fileSize: Number(artifact.fileSize),
    filename: artifact.filename,
    url: readTrustedDownloadUrl(artifact.url, endpoint),
  }
}

async function resolveOutputPath(input: {
  artifact: ExportArtifact
  outputDirectory: string | null
  outputFile: string | null
  overwrite: boolean
}) {
  await validateExportOutputDestination(input)
  const target = resolve(input.outputFile ?? join(input.outputDirectory!, input.artifact.filename))
  const metadata = await stat(dirname(target)).catch(() => null)
  if (!metadata?.isDirectory() || basename(target).length > 240 ||
    extname(target).toLowerCase() !== extname(input.artifact.filename).toLowerCase()) {
    throw new CliExportFileError("export_output_invalid")
  }
  return target
}

/** Reject avoidable local destination errors before a costly remote export. */
export async function validateExportOutputDestination(input: {
  outputDirectory: string | null
  outputFile: string | null
  overwrite: boolean
}) {
  if (Boolean(input.outputDirectory) === Boolean(input.outputFile) ||
    (input.outputDirectory && input.overwrite)) {
    throw new CliExportFileError("export_output_invalid")
  }
  if (input.outputDirectory) {
    const directory = await stat(resolve(input.outputDirectory)).catch(() => null)
    if (!directory?.isDirectory()) throw new CliExportFileError("export_output_invalid")
    return
  }
  const target = resolve(input.outputFile!)
  const parent = await stat(dirname(target)).catch(() => null)
  if (!parent?.isDirectory() || basename(target).length > 240 ||
    ![".zip", ".mp4"].includes(extname(target).toLowerCase())) {
    throw new CliExportFileError("export_output_invalid")
  }
  const existing = await stat(target).catch(() => null)
  if (existing && !input.overwrite) throw new CliExportFileError("export_output_conflict")
  if (existing?.isDirectory()) throw new CliExportFileError("export_output_invalid")
}

function validateDownloadResponse(response: Response, artifact: ExportArtifact) {
  if (response.status !== 200 || !response.body ||
    response.url !== artifact.url.href ||
    response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== artifact.contentType ||
    Number(response.headers.get("content-length")) !== artifact.fileSize) {
    throw new CliExportFileError("export_transfer_failed")
  }
}

function validEnvelope(contentType: ExportArtifact["contentType"], prefix: Buffer) {
  return contentType === "application/zip"
    ? prefix.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
    : prefix.toString("ascii", 4, 8) === "ftyp"
}

async function writeChunk(handle: Awaited<ReturnType<typeof open>>, chunk: Uint8Array) {
  const bytes = Buffer.from(chunk)
  let offset = 0
  while (offset < bytes.byteLength) {
    const { bytesWritten } = await handle.write(bytes, offset, bytes.byteLength - offset)
    if (bytesWritten < 1) throw new CliExportFileError("export_transfer_failed")
    offset += bytesWritten
  }
}

async function streamArtifactToTemporaryFile(input: {
  artifact: ExportArtifact
  signal: AbortSignal
  tempPath: string
}) {
  const signal = AbortSignal.any([input.signal, AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)])
  const response = await fetch(input.artifact.url, {
    cache: "no-store", credentials: "omit", redirect: "error", signal,
  })
  try {
    validateDownloadResponse(response, input.artifact)
  } catch (error) {
    await response.body?.cancel().catch(() => undefined)
    throw error
  }
  const reader = response.body!.getReader()
  const handle = await open(input.tempPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
  const hash = createHash("sha256")
  let byteSize = 0
  let prefix = Buffer.alloc(0)
  try {
    for (;;) {
      signal.throwIfAborted()
      const chunk = await reader.read()
      if (chunk.done) break
      byteSize += chunk.value.byteLength
      if (byteSize > input.artifact.fileSize ||
        byteSize > maxExportBytes(input.artifact.contentType)) {
        throw new CliExportFileError("export_transfer_failed")
      }
      if (prefix.byteLength < 12) {
        prefix = Buffer.concat([prefix, Buffer.from(chunk.value.subarray(0, 12 - prefix.byteLength))])
      }
      hash.update(chunk.value)
      await writeChunk(handle, chunk.value)
    }
    if (byteSize !== input.artifact.fileSize || !validEnvelope(input.artifact.contentType, prefix)) {
      throw new CliExportFileError("export_transfer_failed")
    }
    await handle.sync()
    return { byteSize, sha256: `sha256:${hash.digest("hex")}` }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
    await handle.close()
  }
}

export async function saveToolResultExportArtifact(input: {
  endpoint: string
  outputDirectory: string | null
  outputFile: string | null
  overwrite: boolean
  result: CallToolResult
  signal: AbortSignal
}) {
  const artifact = readExportArtifact(input.result, input.endpoint)
  const target = await resolveOutputPath({ ...input, artifact })
  const tempPath = join(dirname(target), `.${basename(target)}.${randomBytes(8).toString("hex")}.tmp`)
  try {
    const saved = await streamArtifactToTemporaryFile({ artifact, signal: input.signal, tempPath })
    input.signal.throwIfAborted()
    if (input.overwrite) {
      await rename(tempPath, target)
    } else {
      await link(tempPath, target).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "EEXIST") throw new CliExportFileError("export_output_conflict")
        throw error
      })
    }
    return { ...saved, contentType: artifact.contentType, outputPath: target }
  } catch (error) {
    if (error instanceof CliExportFileError) throw error
    throw new CliExportFileError("export_transfer_failed")
  } finally {
    await unlink(tempPath).catch(() => undefined)
  }
}
