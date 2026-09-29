import { createHash, randomUUID } from "node:crypto"
import {
  closeSync,
  chmodSync,
  constants,
  copyFileSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import { parse } from "smol-toml"
import {
  SEMLENS_MCP_SERVER_MANIFEST,
  SEMLENS_MCP_STARTER_PROFILE_TOOL_NAMES,
} from "./manifest.js"
import { parseSafeMcpUrl } from "./safe-mcp-url.js"

const MAX_CODEX_CONFIG_BYTES = 1_000_000
const INVALID_SERVICE_TIER = "default"

export type CodexConfigDiagnosticCode =
  | "config_missing"
  | "config_not_regular"
  | "config_not_utf8"
  | "config_too_large"
  | "custom_server_name"
  | "semlens_block_missing"
  | "healthy"
  | "invalid_service_tier"
  | "malformed_toml"
  | "multiple_semlens_blocks"
  | "restricted_starter_profile"
  | "stale_enabled_tools"
  | "custom_enabled_tools"
  | "unsupported_semlens_block"

export type CodexConfigRepairAction =
  | "remove_enabled_tools"
  | "replace_enabled_tools"

export type CodexConfigProfileIntent = "full" | "preserve" | "starter"

export type CodexConfigRepairPlan = {
  actions: CodexConfigRepairAction[]
  diagnostics: CodexConfigDiagnosticCode[]
  safeToApply: boolean
  sourceHash: string | null
  status: "blocked" | "fixable" | "healthy" | "missing"
  updatedSource: string | null
}

export type CodexConfigApplyResult = {
  backupCreated: boolean
  status: "applied" | "no_change"
}

export class CodexConfigApplyError extends Error {
  readonly backupCreated: boolean
  readonly code: "config_changed" | "filesystem_failure"

  constructor(
    code: "config_changed" | "filesystem_failure",
    backupCreated: boolean,
  ) {
    super(code)
    this.name = "CodexConfigApplyError"
    this.backupCreated = backupCreated
    this.code = code
  }
}

type ApplyDependencies = {
  beforeReplace?: () => void
  renameFile?: (sourcePath: string, destinationPath: string) => void
}

type SourceLine = {
  content: string
  end: number
  start: number
}

type SourceEdit = {
  end: number
  replacement: string
  start: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function fingerprint(source: string | Buffer) {
  return createHash("sha256").update(source).digest("hex")
}

function splitSourceLines(source: string) {
  const lines: SourceLine[] = []
  let start = 0

  while (start < source.length) {
    const newlineIndex = source.indexOf("\n", start)
    const end = newlineIndex === -1 ? source.length : newlineIndex + 1
    let contentEnd = end
    if (newlineIndex !== -1) contentEnd -= 1
    if (contentEnd > start && source[contentEnd - 1] === "\r") contentEnd -= 1
    lines.push({
      content: source.slice(start, contentEnd),
      end,
      start,
    })
    start = end
  }

  return lines
}

function readMcpServerName(line: string) {
  const match = line.match(
    /^\s*\[\s*mcp_servers\.(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))\s*\]\s*(?:#.*)?$/,
  )
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null
}

function isTableHeader(line: string) {
  return /^\s*\[\[?.+\]\]?\s*(?:#.*)?$/.test(line)
}

function isCanonicalSemlensEndpoint(value: unknown) {
  if (typeof value !== "string") return false
  const actual = parseSafeMcpUrl(value)
  if (!actual) return false
  const canonical = new URL(SEMLENS_MCP_SERVER_MANIFEST.canonicalEndpoint)
  const normalizePath = (path: string) => path.replace(/\/+$/, "") || "/"
  return (
    actual.origin === canonical.origin &&
    normalizePath(actual.pathname) === normalizePath(canonical.pathname)
  )
}

function renderStarterProfile(newline: string) {
  return [
    "enabled_tools = [",
    ...SEMLENS_MCP_STARTER_PROFILE_TOOL_NAMES.map(
      (toolName) => `  "${toolName}",`,
    ),
    "]",
    "",
  ].join(newline)
}

function findArrayAssignmentEnd(
  source: string,
  assignmentStart: number,
  blockEnd: number,
) {
  const assignment = source.slice(assignmentStart, blockEnd)
  const equalsIndex = assignment.indexOf("=")
  if (equalsIndex === -1) return null
  if (assignment.includes('"""') || assignment.includes("'''")) return null

  let bracketDepth = 0
  let comment = false
  let escaped = false
  let quote: "'" | '"' | null = null
  let sawOpeningBracket = false

  for (let index = equalsIndex + 1; index < assignment.length; index += 1) {
    const character = assignment[index]!

    if (comment) {
      if (character === "\n") comment = false
      continue
    }
    if (quote) {
      if (quote === '"' && escaped) {
        escaped = false
        continue
      }
      if (quote === '"' && character === "\\") {
        escaped = true
        continue
      }
      if (character === quote) quote = null
      continue
    }
    if (character === "#") {
      comment = true
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === "[") {
      bracketDepth += 1
      sawOpeningBracket = true
      continue
    }
    if (character === "]" && sawOpeningBracket) {
      bracketDepth -= 1
      if (bracketDepth === 0) {
        const absoluteEnd = assignmentStart + index + 1
        const lineEnd = source.indexOf("\n", absoluteEnd)
        return lineEnd === -1 ? source.length : lineEnd + 1
      }
    }
  }

  return null
}

function applySourceEdits(source: string, edits: readonly SourceEdit[]) {
  let updated = source
  for (const edit of [...edits].sort((left, right) => right.start - left.start)) {
    updated =
      updated.slice(0, edit.start) + edit.replacement + updated.slice(edit.end)
  }
  return updated
}

function blockedPlan(
  diagnostics: CodexConfigDiagnosticCode[],
): CodexConfigRepairPlan {
  return {
    actions: [],
    diagnostics,
    safeToApply: false,
    sourceHash: null,
    status: "blocked",
    updatedSource: null,
  }
}

type ResolvedServer = {
  config: Record<string, unknown>
  name: string
}

function resolveSemlensServer(
  servers: Record<string, unknown>,
): ResolvedServer | CodexConfigDiagnosticCode {
  const canonicalName = SEMLENS_MCP_SERVER_MANIFEST.serverName
  const candidateNames = Object.keys(servers).filter((name) => {
    const config = servers[name]
    return (
      name === canonicalName ||
      (isRecord(config) && isCanonicalSemlensEndpoint(config.url))
    )
  })
  if (candidateNames.length === 0) return "semlens_block_missing"
  if (candidateNames.length !== 1) return "multiple_semlens_blocks"
  const name = candidateNames[0]!
  const config = servers[name]
  if (!isRecord(config)) return "unsupported_semlens_block"
  if (
    typeof config.command === "string" ||
    Array.isArray(config.args) ||
    typeof config.cwd === "string" ||
    !isCanonicalSemlensEndpoint(config.url)
  ) {
    return "unsupported_semlens_block"
  }
  return { config, name }
}

type ResolvedSourceBlock = {
  blockEnd: number
  enabledToolsLines: SourceLine[]
  urlLines: SourceLine[]
}

function resolveServerSourceBlock(
  source: string,
  serverName: string,
): ResolvedSourceBlock | null {
  const lines = splitSourceLines(source)
  const matchingHeaders = lines
    .map((line, index) => ({ index, name: readMcpServerName(line.content) }))
    .filter((entry) => entry.name === serverName)
  if (matchingHeaders.length !== 1) return null
  const headerLine = lines[matchingHeaders[0]!.index]!
  const nextHeader = lines
    .slice(matchingHeaders[0]!.index + 1)
    .find((line) => isTableHeader(line.content))
  const blockEnd = nextHeader?.start ?? source.length
  const blockLines = lines.filter(
    (line) => line.start >= headerLine.end && line.start < blockEnd,
  )
  return {
    blockEnd,
    enabledToolsLines: blockLines.filter((line) =>
      /^\s*enabled_tools\s*=/.test(line.content),
    ),
    urlLines: blockLines.filter((line) => /^\s*url\s*=/.test(line.content)),
  }
}

type ProfileEditPlan = {
  actions: CodexConfigRepairAction[]
  diagnostics: CodexConfigDiagnosticCode[]
  edits: SourceEdit[]
}

function createStarterProfileEdit(source: string, blockEnd: number) {
  const newline = source.includes("\r\n") ? "\r\n" : "\n"
  const leading =
    blockEnd > 0 && !source.slice(0, blockEnd).endsWith("\n") ? newline : ""
  return {
    end: blockEnd,
    replacement: `${leading}${renderStarterProfile(newline)}`,
    start: blockEnd,
  }
}

function planProfileEdits(input: {
  blockEnd: number
  enabledToolsLines: SourceLine[]
  profileIntent: CodexConfigProfileIntent
  serverConfig: Record<string, unknown>
  source: string
}): ProfileEditPlan | null {
  const actions: CodexConfigRepairAction[] = []
  const diagnostics: CodexConfigDiagnosticCode[] = []
  const edits: SourceEdit[] = []
  if (!Object.hasOwn(input.serverConfig, "enabled_tools")) {
    if (input.profileIntent !== "starter") return { actions, diagnostics, edits }
    actions.push("replace_enabled_tools")
    edits.push(createStarterProfileEdit(input.source, input.blockEnd))
    return { actions, diagnostics, edits }
  }
  if (
    input.enabledToolsLines.length !== 1 ||
    !Array.isArray(input.serverConfig.enabled_tools) ||
    !input.serverConfig.enabled_tools.every((name) => typeof name === "string")
  ) {
    return null
  }
  const line = input.enabledToolsLines[0]!
  const assignmentEnd = findArrayAssignmentEnd(
    input.source,
    line.start,
    input.blockEnd,
  )
  if (assignmentEnd === null) return null
  const tools = input.serverConfig.enabled_tools as string[]
  const starter =
    tools.length === SEMLENS_MCP_STARTER_PROFILE_TOOL_NAMES.length &&
    tools.every(
      (name, index) => name === SEMLENS_MCP_STARTER_PROFILE_TOOL_NAMES[index],
    )
  diagnostics.push(
    starter
      ? "restricted_starter_profile"
      : input.profileIntent === "preserve"
        ? "custom_enabled_tools"
        : "stale_enabled_tools",
  )
  if (input.profileIntent === "full") {
    actions.push("remove_enabled_tools")
    edits.push({ end: assignmentEnd, replacement: "", start: line.start })
  } else if (input.profileIntent === "starter" && !starter) {
    const newline = input.source.includes("\r\n") ? "\r\n" : "\n"
    actions.push("replace_enabled_tools")
    edits.push({
      end: assignmentEnd,
      replacement: renderStarterProfile(newline),
      start: line.start,
    })
  }
  return { actions, diagnostics, edits }
}

function finalizeCodexConfigPlan(input: {
  actions: CodexConfigRepairAction[]
  diagnostics: CodexConfigDiagnosticCode[]
  edits: SourceEdit[]
  hasBom: boolean
  source: string
  sourceWithOptionalBom: string
}) {
  if (input.diagnostics.includes("invalid_service_tier")) {
    return {
      actions: input.actions,
      diagnostics: input.diagnostics,
      safeToApply: false,
      sourceHash: fingerprint(input.sourceWithOptionalBom),
      status: "blocked",
      updatedSource: null,
    } satisfies CodexConfigRepairPlan
  }
  if (input.actions.length === 0) {
    return {
      actions: [],
      diagnostics:
        input.diagnostics.length > 0 ? input.diagnostics : ["healthy"],
      safeToApply: true,
      sourceHash: fingerprint(input.sourceWithOptionalBom),
      status: "healthy",
      updatedSource: input.sourceWithOptionalBom,
    } satisfies CodexConfigRepairPlan
  }
  const updatedSource = applySourceEdits(input.source, input.edits)
  try {
    parse(updatedSource)
  } catch {
    return blockedPlan([
      ...input.diagnostics,
      "unsupported_semlens_block",
    ])
  }
  return {
    actions: input.actions,
    diagnostics: input.diagnostics,
    safeToApply: true,
    sourceHash: fingerprint(input.sourceWithOptionalBom),
    status: "fixable",
    updatedSource: input.hasBom ? `\uFEFF${updatedSource}` : updatedSource,
  } satisfies CodexConfigRepairPlan
}

export function planCodexConfigRepair(
  sourceWithOptionalBom: string,
  profileIntent: CodexConfigProfileIntent = "preserve",
) {
  const hasBom = sourceWithOptionalBom.startsWith("\uFEFF")
  const source = hasBom ? sourceWithOptionalBom.slice(1) : sourceWithOptionalBom
  let parsed: unknown

  try {
    parsed = parse(source)
  } catch {
    return blockedPlan(["malformed_toml"])
  }

  if (!isRecord(parsed)) return blockedPlan(["malformed_toml"])

  const diagnostics: CodexConfigDiagnosticCode[] = []
  if (parsed.service_tier === INVALID_SERVICE_TIER) {
    diagnostics.push("invalid_service_tier")
  }

  const servers = isRecord(parsed.mcp_servers) ? parsed.mcp_servers : {}
  const resolvedServer = resolveSemlensServer(servers)
  if (resolvedServer === "semlens_block_missing") {
    return {
      actions: [],
      diagnostics: [...diagnostics, "semlens_block_missing"],
      safeToApply: false,
      sourceHash: fingerprint(sourceWithOptionalBom),
      status: diagnostics.length > 0 ? "blocked" : "missing",
      updatedSource: null,
    } satisfies CodexConfigRepairPlan
  }
  if (typeof resolvedServer === "string") {
    return blockedPlan([...diagnostics, resolvedServer])
  }
  const sourceBlock = resolveServerSourceBlock(source, resolvedServer.name)
  if (
    !sourceBlock ||
    sourceBlock.urlLines.length !== 1 ||
    sourceBlock.enabledToolsLines.length > 1
  ) {
    return blockedPlan([...diagnostics, "unsupported_semlens_block"])
  }
  const { blockEnd, enabledToolsLines } = sourceBlock
  if (resolvedServer.name !== SEMLENS_MCP_SERVER_MANIFEST.serverName) {
    diagnostics.push("custom_server_name")
  }
  const profilePlan = planProfileEdits({
    blockEnd,
    enabledToolsLines,
    profileIntent,
    serverConfig: resolvedServer.config,
    source,
  })
  if (!profilePlan) {
    return blockedPlan([...diagnostics, "unsupported_semlens_block"])
  }
  diagnostics.push(...profilePlan.diagnostics)
  const { actions, edits } = profilePlan

  return finalizeCodexConfigPlan({
    actions,
    diagnostics,
    edits,
    hasBom,
    source,
    sourceWithOptionalBom,
  })
}

export function resolveCodexConfigPath(overridePath: string | null) {
  if (overridePath) return resolve(overridePath)
  const codexHome = process.env.CODEX_HOME
    ? resolve(process.env.CODEX_HOME)
    : join(homedir(), ".codex")
  return join(codexHome, "config.toml")
}

export function inspectCodexConfigFile(
  configPath: string,
  profileIntent: CodexConfigProfileIntent = "preserve",
) {
  if (!existsSync(configPath)) {
    return {
      actions: [],
      diagnostics: ["config_missing"],
      safeToApply: false,
      sourceHash: null,
      status: "missing",
      updatedSource: null,
    } satisfies CodexConfigRepairPlan
  }

  const file = lstatSync(configPath)
  if (!file.isFile() || file.isSymbolicLink()) {
    return blockedPlan(["config_not_regular"])
  }
  if (file.size > MAX_CODEX_CONFIG_BYTES) {
    return blockedPlan(["config_too_large"])
  }

  const bytes = readFileSync(configPath)
  let source: string
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return blockedPlan(["config_not_utf8"])
  }

  return planCodexConfigRepair(source, profileIntent)
}

function createBackupPath(configPath: string) {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:.]/g, "")
    .replace("Z", "Z")
  const basePath = `${configPath}.${timestamp}.bak`
  let candidate = basePath
  let collision = 1
  while (existsSync(candidate)) {
    candidate = `${basePath}.${collision}`
    collision += 1
  }
  return candidate
}

/** The temporary file must be durable and closed before replacement, even on write failure. */
function writeRepairFile(path: string, source: string, mode: number) {
  const descriptor = openSync(path, "wx", mode)
  try {
    writeFileSync(descriptor, source, { encoding: "utf8" })
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
}

export function applyCodexConfigRepair(
  configPath: string,
  plan: CodexConfigRepairPlan,
  dependencies: ApplyDependencies = {},
): CodexConfigApplyResult {
  if (
    !plan.safeToApply ||
    plan.sourceHash === null ||
    plan.updatedSource === null
  ) {
    throw new Error("repair_not_safe")
  }
  if (plan.actions.length === 0) {
    return { backupCreated: false, status: "no_change" }
  }

  const file = lstatSync(configPath)
  if (!file.isFile() || file.isSymbolicLink()) {
    throw new Error("repair_not_safe")
  }
  const originalBytes = readFileSync(configPath)
  if (fingerprint(originalBytes) !== plan.sourceHash) {
    throw new Error("config_changed")
  }

  const backupPath = createBackupPath(configPath)
  const tempPath = join(
    dirname(configPath),
    `.${basename(configPath)}.semlens-${process.pid}-${randomUUID()}.tmp`,
  )

  copyFileSync(configPath, backupPath, constants.COPYFILE_EXCL)
  chmodSync(backupPath, file.mode & 0o777)
  try {
    writeRepairFile(tempPath, plan.updatedSource, file.mode & 0o777)

    dependencies.beforeReplace?.()
    const currentBytes = readFileSync(configPath)
    if (fingerprint(currentBytes) !== plan.sourceHash) {
      throw new Error("config_changed")
    }

    const renameFile = dependencies.renameFile ?? renameSync
    renameFile(tempPath, configPath)
    return { backupCreated: true, status: "applied" }
  } catch (error) {
    rmSync(tempPath, { force: true })
    throw new CodexConfigApplyError(
      error instanceof Error && error.message === "config_changed"
        ? "config_changed"
        : "filesystem_failure",
      true,
    )
  }
}
