import { readFileSync, statSync } from "node:fs"
import type {
  CallToolResult,
  Client,
  Tool,
} from "@modelcontextprotocol/client"
import { SEMLENS_MCP_SERVER_MANIFEST } from "./manifest.js"
import { saveToolResultImages } from "./image-files.js"
import { CliExportFileError, saveToolResultExportArtifact } from "./export-files.js"

const MAX_INPUT_BYTES = 1024 * 1024
const MAX_OUTPUT_BYTES = 1024 * 1024
const MAX_RESULT_DEPTH = 12
const MAX_SCHEMA_RESULT_DEPTH = 40
const MAX_RESULT_ITEMS = 200
// DesignDocument permits 24 pages with 300 elements each. Accepted receipts
// must retain structural IDs beyond the generic inventory limit, with a cap.
const DESIGN_OPERATION_ID_LIMITS = {
  changedPageIds: 24, createdPageIds: 24, deletedPageIds: 24,
  createdElementIds: 7200, deletedElementIds: 7200,
} as const
const MAX_DESIGN_OPERATION_OUTPUT_BYTES = 3 * 1024 * 1024
const MAX_CAPABILITY_PAGES = 10

type ApprovalClass =
  | "approval_required_external_write"
  | "approval_required_write"
  | "no_approval_read"

type Capability = {
  approvalClass: ApprovalClass
  cliAvailability: "available"
  cliEquivalent: string
  operationId: string
  readWriteStatus: "read" | "write"
}

export class OperationalMcpError extends Error {
  constructor(
    readonly code:
      | "approval_required"
      | "capability_mismatch"
      | "execution_failed"
      | "execution_uncertain"
      | "file_too_large"
      | "input_invalid"
      | "input_too_large"
      | "manifest_mismatch"
      | "upload_failed"
      | "tool_not_registered",
  ) {
    super(code)
    this.name = "OperationalMcpError"
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function readToolInput(input: {
  inputFile: string | null
  inputJson: string | null
}) {
  if (Boolean(input.inputFile) === Boolean(input.inputJson)) {
    throw new OperationalMcpError("input_invalid")
  }
  let serialized: string
  if (input.inputFile) {
    let size: number
    try {
      size = statSync(input.inputFile).size
    } catch {
      throw new OperationalMcpError("input_invalid")
    }
    if (size > MAX_INPUT_BYTES) throw new OperationalMcpError("input_too_large")
    try {
      serialized = readFileSync(input.inputFile, "utf8")
    } catch {
      throw new OperationalMcpError("input_invalid")
    }
  } else {
    serialized = input.inputJson ?? ""
  }
  if (Buffer.byteLength(serialized, "utf8") > MAX_INPUT_BYTES) {
    throw new OperationalMcpError("input_too_large")
  }
  try {
    const parsed: unknown = JSON.parse(serialized)
    if (!isRecord(parsed)) throw new Error("object required")
    return parsed
  } catch {
    throw new OperationalMcpError("input_invalid")
  }
}

function sensitiveKey(key: string) {
  return /token$|authorization|cookie|codeverifier|clientsecret|downloadurl|previewurl|renderurl|signedurl|capabilityurl|uploadpath|storagepath|owneruserid|ownerid/i.test(
    key.replace(/[-_\s]/g, ""),
  )
}

function sensitiveRelativeCapabilityPath(value: string) {
  if (!value.startsWith("/api/mcp/")) return false
  return value
    .split(/[/?#]/u)
    .some((segment) => /^[A-Za-z0-9_-]{40,8192}$/u.test(segment))
}

function sensitiveUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.username || url.password) return true
    const parameters = new URLSearchParams(`${url.search.slice(1)}&${url.hash.slice(1)}`)
    return [...parameters.keys()].some((key) =>
      /token|code|signature|credential|capability|expires?/i.test(key),
    )
  } catch {
    return false
  }
}

export function sanitizeMachineValue(
  value: unknown,
  depth = 0,
  maximumDepth = MAX_RESULT_DEPTH,
): unknown {
  if (depth >= maximumDepth) return "[truncated]"
  if (typeof value === "string") {
    if (
      sensitiveUrl(value) ||
      sensitiveRelativeCapabilityPath(value) ||
      /[?&](?:token|code|signature|credential|capability|expires?)=/i.test(value) ||
      /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/.test(value)
    ) {
      return "[withheld_capability]"
    }
    return value.length <= 16_000 ? value : `${value.slice(0, 16_000)}[truncated]`
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_RESULT_ITEMS)
      .map((item) => sanitizeMachineValue(item, depth + 1, maximumDepth))
  }
  if (!isRecord(value)) return null
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, MAX_RESULT_ITEMS)
      .map(([key, item]) => [
        key,
        sensitiveKey(key)
          ? "[withheld]"
          : sanitizeMachineValue(item, depth + 1, maximumDepth),
      ]),
  )
}

function retainResearchFreshnessToken(
  raw: unknown,
  sanitized: unknown,
  toolName: string,
) {
  const pattern = toolName === "inspect_news_board_story_factual_research"
    ? /^factual-research-write:v1:sha256:[0-9a-f]{64}$/
    : toolName === "inspect_news_board_story_research"
      ? /^research-write:v2:sha256:[0-9a-f]{64}$/
      : null
  if (!pattern || !isRecord(raw) || raw.ok !== true ||
    !isRecord(raw.writeContext) || !isRecord(sanitized) ||
    !isRecord(sanitized.writeContext)) return sanitized
  const token = raw.writeContext.freshnessToken
  if (typeof token !== "string" || !pattern.test(token)) return sanitized
  return {
    ...sanitized,
    writeContext: { ...sanitized.writeContext, freshnessToken: token },
  }
}

function isDesignOperationReceipt(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && typeof value.operationId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.operationId) &&
    (value.outcome === "applied" || value.outcome === "unchanged") &&
    typeof value.previousUpdatedAt === "string" && typeof value.updatedAt === "string"
}

function retainDesignOperationIds(raw: unknown, sanitized: unknown) {
  if (!isDesignOperationReceipt(raw) || !isRecord(sanitized)) return sanitized
  const projected = { ...sanitized }
  for (const [key, limit] of Object.entries(DESIGN_OPERATION_ID_LIMITS)) {
    const ids = raw[key]
    if (ids === undefined) continue
    if (!Array.isArray(ids) || ids.length > limit || !ids.every(id => typeof id === "string" && id.length <= 160)) return "[invalid_operation_receipt]"
    projected[key] = ids.map(id => sanitizeMachineValue(id))
  }
  return projected
}

function projectToolResult(result: CallToolResult, toolName: string) {
  const maximumDepth =
    toolName === "inspect_agent_draft_action_schema"
      ? MAX_SCHEMA_RESULT_DEPTH
      : MAX_RESULT_DEPTH
  const researchStructured = retainResearchFreshnessToken(
    result.structuredContent,
    sanitizeMachineValue(result.structuredContent, 0, maximumDepth),
    toolName,
  )
  const structured = retainDesignOperationIds(result.structuredContent, researchStructured)
  const contentTypes = result.content.map((item) => item.type)
  const projected = {
    contentTypes,
    isError: result.isError === true,
    structuredContent: structured,
    textContentOmitted: result.content.some((item) => item.type === "text"),
  }
  const serialized = JSON.stringify(projected)
  const maximumBytes = isDesignOperationReceipt(structured) ? MAX_DESIGN_OPERATION_OUTPUT_BYTES : MAX_OUTPUT_BYTES
  if (Buffer.byteLength(serialized, "utf8") > maximumBytes) {
    return {
      contentTypes,
      isError: result.isError === true,
      structuredContent: "[result_too_large]",
      textContentOmitted: true,
    }
  }
  return projected
}

function toolResultOk(result: CallToolResult) {
  return (
    result.isError !== true &&
    (!isRecord(result.structuredContent) || result.structuredContent.ok !== false)
  )
}

function readCapability(result: CallToolResult, operationId: string): Capability {
  if (result.isError || !isRecord(result.structuredContent)) {
    throw new OperationalMcpError("capability_mismatch")
  }
  const manifestVersion = result.structuredContent.manifestVersion
  if (manifestVersion !== SEMLENS_MCP_SERVER_MANIFEST.manifestVersion) {
    throw new OperationalMcpError("manifest_mismatch")
  }
  const entries = result.structuredContent.capabilities
  const entry = Array.isArray(entries)
    ? entries.find(
        (value): value is Record<string, unknown> =>
          isRecord(value) && value.operationId === operationId,
      )
    : null
  if (
    !entry ||
    ![
      "approval_required_external_write",
      "approval_required_write",
      "no_approval_read",
    ].includes(String(entry.approvalClass)) ||
    entry.cliAvailability !== "available" ||
    typeof entry.cliEquivalent !== "string" ||
    entry.readWriteStatus !== (entry.approvalClass === "no_approval_read" ? "read" : "write")
  ) {
    throw new OperationalMcpError("capability_mismatch")
  }
  return entry as Capability
}

function requireInvocationApproval(
  capability: Capability,
  approvals: { external: boolean; write: boolean },
) {
  if (
    capability.approvalClass === "approval_required_write" &&
    !approvals.write
  ) {
    throw new OperationalMcpError("approval_required")
  }
  if (
    capability.approvalClass === "approval_required_external_write" &&
    !approvals.external
  ) {
    throw new OperationalMcpError("approval_required")
  }
}

function findTool(tools: readonly Tool[], name: string) {
  const tool = tools.find((candidate) => candidate.name === name)
  if (!tool) throw new OperationalMcpError("tool_not_registered")
  return tool
}

function assertToolAnnotations(tool: Tool, capability: Capability) {
  const readOnly = tool.annotations?.readOnlyHint
  const openWorld = tool.annotations?.openWorldHint
  const expected =
    readOnly === true
      ? "no_approval_read"
      : openWorld === true
        ? "approval_required_external_write"
        : readOnly === false && openWorld === false
          ? "approval_required_write"
          : null
  if (!expected || expected !== capability.approvalClass) {
    throw new OperationalMcpError("capability_mismatch")
  }
}

async function inspectCapability(
  client: Client,
  tools: readonly Tool[],
  operationId: string,
  signal: AbortSignal,
) {
  const discoveryTool = findTool(tools, "inspect_mcp_capabilities")
  const result = await client.callTool(
    {
      arguments: { operationIds: [operationId] },
      name: "inspect_mcp_capabilities",
    },
    { signal, toolDefinition: discoveryTool },
  )
  return readCapability(result, operationId)
}

export async function executeRegisteredToolRaw(input: {
  approvals: { external: boolean; write: boolean }
  arguments: Record<string, unknown>
  client: Client
  requestTimeoutMs?: number
  signal: AbortSignal
  toolName: string
}) {
  const listed = await input.client.listTools({}, { signal: input.signal })
  const tool = findTool(listed.tools, input.toolName)
  const capability = await inspectCapability(
    input.client,
    listed.tools,
    input.toolName,
    input.signal,
  )
  assertToolAnnotations(tool, capability)
  requireInvocationApproval(capability, input.approvals)
  let result: CallToolResult
  try {
    result = await input.client.callTool(
      { arguments: input.arguments, name: input.toolName },
      {
        signal: input.signal,
        timeout: input.toolName === "create_design_export" ? input.requestTimeoutMs : undefined,
        toolDefinition: tool,
      },
    )
  } catch {
    throw new OperationalMcpError(
      capability.readWriteStatus === "write"
        ? "execution_uncertain"
        : "execution_failed",
    )
  }
  return { capability, result }
}

async function saveRequestedToolOutput(input: {
  endpoint?: string
  outputDirectory?: string | null
  outputFile?: string | null
  overwrite?: boolean
  signal: AbortSignal
  toolName: string
}, result: CallToolResult) {
  if (!input.outputDirectory && !input.outputFile) return {}
  if (["create_design_export", "retrieve_design_video_export"].includes(input.toolName)) {
    if (!toolResultOk(result)) return {}
    if (input.toolName === "retrieve_design_video_export" &&
      (!isRecord(result.structuredContent) || !isRecord(result.structuredContent.artifact))) return {}
    return { exportFile: await saveToolResultExportArtifact({
      endpoint: input.endpoint ?? SEMLENS_MCP_SERVER_MANIFEST.canonicalEndpoint,
      outputDirectory: input.outputDirectory ?? null,
      outputFile: input.outputFile ?? null,
      overwrite: input.overwrite ?? false,
      result,
      // The write timeout bounds remote creation. A completed artifact gets
      // its own transfer window, even when rendering used most of that time.
      signal: AbortSignal.timeout(300_000),
    }) }
  }
  return { imageFiles: await saveToolResultImages({
    outputDirectory: input.outputDirectory ?? null,
    outputFile: input.outputFile ?? null,
    overwrite: input.overwrite ?? false,
    result,
    signal: input.signal,
  }) }
}

export async function executeRegisteredTool(input: {
  approvals: { external: boolean; write: boolean }
  arguments: Record<string, unknown>
  client: Client
  endpoint?: string
  outputDirectory?: string | null
  outputFile?: string | null
  overwrite?: boolean
  requestTimeoutMs?: number
  signal: AbortSignal
  toolName: string
}) {
  const { capability, result } = await executeRegisteredToolRaw(input)
  let savedOutput
  try {
    savedOutput = await saveRequestedToolOutput(input, result)
  } catch (error) {
    if (!(error instanceof CliExportFileError) ||
      !["create_design_export", "retrieve_design_video_export"].includes(input.toolName) ||
      !toolResultOk(result)) throw error
    return {
      approvalClass: capability.approvalClass,
      exportFile: undefined,
      imageFiles: undefined,
      localSave: {
        code: error.code,
        ok: false,
        nextStep: input.toolName === "retrieve_design_video_export"
          ? "Inspect the existing export operation and retry retrieval; do not start another render."
          : "Inspect recent MCP export activity before creating another export.",
      },
      manifestVersion: SEMLENS_MCP_SERVER_MANIFEST.manifestVersion,
      ok: false,
      operationId: input.toolName,
      remoteExportMayExist: true,
      result: projectToolResult(result, input.toolName),
    }
  }
  return {
    approvalClass: capability.approvalClass,
    ...savedOutput,
    manifestVersion: SEMLENS_MCP_SERVER_MANIFEST.manifestVersion,
    ok: toolResultOk(result),
    operationId: input.toolName,
    result: projectToolResult(result, input.toolName),
  }
}

export async function inspectCliCapabilities(input: {
  client: Client
  operationIds: string[] | null
  signal: AbortSignal
}) {
  const listed = await input.client.listTools({}, { signal: input.signal })
  const tool = findTool(listed.tools, "inspect_mcp_capabilities")
  const call = (argumentsValue: Record<string, unknown>) =>
    input.client.callTool(
      { arguments: argumentsValue, name: "inspect_mcp_capabilities" },
      { signal: input.signal, toolDefinition: tool },
    )
  if (input.operationIds) {
    return projectCapabilityResult(
      await call({ operationIds: input.operationIds }),
    )
  }
  const capabilities: unknown[] = []
  let cursor = 0
  let lastResult: CallToolResult | null = null
  for (let pageIndex = 0; pageIndex < MAX_CAPABILITY_PAGES; pageIndex += 1) {
    const result = await call({ cursor, limit: 40 })
    const page = readCapabilityPage(result)
    capabilities.push(...page.capabilities)
    lastResult = result
    if (page.nextCursor === null) {
      return projectCapabilityResult({
        ...lastResult,
        structuredContent: {
          ...(isRecord(lastResult.structuredContent)
            ? lastResult.structuredContent
            : {}),
          capabilities,
          nextCursor: null,
          returned: capabilities.length,
        },
      })
    }
    if (page.nextCursor <= cursor) {
      throw new OperationalMcpError("manifest_mismatch")
    }
    cursor = page.nextCursor
  }
  throw new OperationalMcpError("manifest_mismatch")
}

function readCapabilityPage(result: CallToolResult) {
  if (
    result.isError ||
    !isRecord(result.structuredContent) ||
    result.structuredContent.manifestVersion !== SEMLENS_MCP_SERVER_MANIFEST.manifestVersion ||
    !Array.isArray(result.structuredContent.capabilities)
  ) {
    throw new OperationalMcpError("manifest_mismatch")
  }
  const nextCursor = result.structuredContent.nextCursor
  if (
    nextCursor !== null &&
    (typeof nextCursor !== "number" ||
      !Number.isInteger(nextCursor) ||
      nextCursor < 0)
  ) {
    throw new OperationalMcpError("manifest_mismatch")
  }
  return {
    capabilities: result.structuredContent.capabilities,
    nextCursor: nextCursor as number | null,
  }
}

function projectCapabilityResult(result: CallToolResult) {
  if (
    result.isError ||
    !isRecord(result.structuredContent) ||
    result.structuredContent.manifestVersion !== SEMLENS_MCP_SERVER_MANIFEST.manifestVersion
  ) {
    throw new OperationalMcpError("manifest_mismatch")
  }
  return {
    manifestVersion: SEMLENS_MCP_SERVER_MANIFEST.manifestVersion,
    ok: toolResultOk(result),
    result: projectToolResult(result, "inspect_mcp_capabilities"),
  }
}
