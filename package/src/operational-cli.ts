import {
  connectAuthenticatedMcp,
  createStoredSessionProvider,
  loginWithBrowser,
  OAuthSessionError,
} from "./oauth-session.js"
import {
  executeRegisteredTool,
  inspectCliCapabilities,
  OperationalMcpError,
  readToolInput,
} from "./operational-mcp.js"
import { SEMLENS_MCP_SERVER_MANIFEST } from "./manifest.js"
import { CliImageFileError } from "./image-files.js"
import { CliExportFileError, validateExportOutputDestination } from "./export-files.js"
import {
  inspectFeedbackStatus,
  readFeedbackSubmission,
  submitFeedback,
} from "./feedback.js"
import {
  CliMediaUploadError,
  readBrandUploadItems,
  readMediaUploadItems,
  uploadBrandFiles,
  uploadMediaFiles,
} from "./media-upload.js"
import { parseSafeMcpUrl } from "./safe-mcp-url.js"
import { uploadStudioReference } from "./studio-reference-upload.js"
import {
  ProtectedCredentialStore,
  SecureCredentialError,
  withEndpointCredentialLock,
} from "./secure-credentials.js"

const DEFAULT_OPERATION_TIMEOUT_MS = 30_000
const MIN_TIMEOUT_MS = 1_000
const MAX_TIMEOUT_MS = 120_000
const MAX_EXPORT_TIMEOUT_MS = 600_000

type ParsedOperationalFlags = {
  attachmentFile: string | null
  attachmentsFile: string | null
  approveExternal: boolean
  approveWrite: boolean
  batchFile: string | null
  endpoint: string
  file: string | null
  inputFile: string | null
  inputJson: string | null
  json: boolean
  kind: string | null
  label: string | null
  operationIds: string[] | null
  outputDirectory: string | null
  outputFile: string | null
  overwrite: boolean
  pathname: string | null
  reportFile: string | null
  reportId: string | null
  requestId: string | null
  summary: string | null
  timeoutMs: number
}

const VALUE_FLAGS = new Set([
  "endpoint",
  "batch-file",
  "attachment-file",
  "attachments-file",
  "file",
  "input",
  "input-file",
  "kind",
  "label",
  "operation",
  "output-directory",
  "output-file",
  "pathname",
  "report-file",
  "report-id",
  "request-id",
  "summary",
  "timeout-ms",
])
const BOOLEAN_FLAGS = new Set([
  "approve-external",
  "approve-write",
  "json",
  "overwrite",
])
const AUTH_FLAGS = new Set(["endpoint", "json", "timeout-ms"])
const CAPABILITY_FLAGS = new Set([
  "endpoint",
  "json",
  "operation",
  "timeout-ms",
])
const CALL_FLAGS = new Set([
  "approve-external",
  "approve-write",
  "endpoint",
  "input",
  "input-file",
  "json",
  "output-directory",
  "output-file",
  "overwrite",
  "timeout-ms",
])
const MEDIA_UPLOAD_FLAGS = new Set([
  "approve-write",
  "batch-file",
  "endpoint",
  "file",
  "json",
  "request-id",
  "timeout-ms",
])
const STUDIO_REFERENCE_UPLOAD_FLAGS = new Set([
  "approve-write",
  "endpoint",
  "file",
  "json",
  "request-id",
  "timeout-ms",
])
const BRAND_UPLOAD_FLAGS = new Set([
  "approve-write",
  "batch-file",
  "endpoint",
  "file",
  "json",
  "kind",
  "label",
  "request-id",
  "timeout-ms",
])
const FEEDBACK_SUBMIT_FLAGS = new Set([
  "approve-write",
  "attachment-file",
  "attachments-file",
  "endpoint",
  "json",
  "pathname",
  "report-file",
  "request-id",
  "summary",
  "timeout-ms",
])
const FEEDBACK_STATUS_FLAGS = new Set([
  "endpoint",
  "json",
  "report-id",
  "request-id",
  "timeout-ms",
])

function parseTimeout(value: string | null, defaultTimeoutMs: number, maxTimeoutMs: number) {
  if (value === null) return defaultTimeoutMs
  const timeout = Number(value)
  if (
    !Number.isInteger(timeout) ||
    timeout < MIN_TIMEOUT_MS ||
    timeout > maxTimeoutMs
  ) {
    throw new OperationalMcpError("input_invalid")
  }
  return timeout
}

function parseOperationIds(value: string | null) {
  if (value === null) return null
  const ids = [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ]
  if (ids.length < 1 || ids.length > 40 || ids.some((id) => id.length > 160)) {
    throw new OperationalMcpError("input_invalid")
  }
  return ids
}

function collectOperationalFlags(
  argv: readonly string[],
  allowedFlags: ReadonlySet<string>,
) {
  const values = new Map<string, string>()
  const booleans = new Set<string>()
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index]!
    if (!raw.startsWith("--") || raw.includes("=")) {
      throw new OperationalMcpError("input_invalid")
    }
    const name = raw.slice(2)
    if (!allowedFlags.has(name)) throw new OperationalMcpError("input_invalid")
    if (values.has(name) || booleans.has(name)) {
      throw new OperationalMcpError("input_invalid")
    }
    if (BOOLEAN_FLAGS.has(name)) {
      booleans.add(name)
      continue
    }
    if (!VALUE_FLAGS.has(name)) throw new OperationalMcpError("input_invalid")
    const value = argv[index + 1]
    if (!value || value.startsWith("--")) {
      throw new OperationalMcpError("input_invalid")
    }
    values.set(name, value)
    index += 1
  }
  return { booleans, values }
}

function validateOutputFlags(input: {
  booleans: ReadonlySet<string>
  outputDirectory: string | null
  outputFile: string | null
}) {
  if (
    (Boolean(input.outputDirectory) && Boolean(input.outputFile)) ||
    (input.booleans.has("overwrite") &&
      !input.outputDirectory &&
      !input.outputFile)
  ) {
    throw new OperationalMcpError("input_invalid")
  }
}

function readOptionalFlag(
  values: ReadonlyMap<string, string>,
  name: string,
) {
  return values.get(name) ?? null
}

function parseOperationalFlags(
  argv: readonly string[],
  allowedFlags: ReadonlySet<string>,
  defaultTimeoutMs = DEFAULT_OPERATION_TIMEOUT_MS,
  maxTimeoutMs = MAX_TIMEOUT_MS,
): ParsedOperationalFlags {
  const { booleans, values } = collectOperationalFlags(argv, allowedFlags)
  const endpointInput =
    values.get("endpoint") ?? SEMLENS_MCP_SERVER_MANIFEST.canonicalEndpoint
  const endpoint = parseSafeMcpUrl(endpointInput, { allowLocalHttp: true })
  if (!endpoint) throw new OperationalMcpError("input_invalid")
  const outputDirectory = readOptionalFlag(values, "output-directory")
  const outputFile = readOptionalFlag(values, "output-file")
  validateOutputFlags({ booleans, outputDirectory, outputFile })
  return {
    attachmentFile: readOptionalFlag(values, "attachment-file"),
    attachmentsFile: readOptionalFlag(values, "attachments-file"),
    approveExternal: booleans.has("approve-external"),
    approveWrite: booleans.has("approve-write"),
    batchFile: readOptionalFlag(values, "batch-file"),
    endpoint: endpoint.toString(),
    file: readOptionalFlag(values, "file"),
    inputFile: readOptionalFlag(values, "input-file"),
    inputJson: readOptionalFlag(values, "input"),
    json: booleans.has("json"),
    kind: readOptionalFlag(values, "kind"),
    label: readOptionalFlag(values, "label"),
    operationIds: parseOperationIds(readOptionalFlag(values, "operation")),
    outputDirectory,
    outputFile,
    overwrite: booleans.has("overwrite"),
    pathname: readOptionalFlag(values, "pathname"),
    reportFile: readOptionalFlag(values, "report-file"),
    reportId: readOptionalFlag(values, "report-id"),
    requestId: readOptionalFlag(values, "request-id"),
    summary: readOptionalFlag(values, "summary"),
    timeoutMs: parseTimeout(readOptionalFlag(values, "timeout-ms"), defaultTimeoutMs, maxTimeoutMs),
  }
}

type OperationalInvocation = {
  action: string
  allowedFlags: ReadonlySet<string>
  flagArgs: readonly string[]
  group: "auth" | "brand" | "feedback" | "mcp" | "media" | "studio"
  toolName?: string
}

export function resolveTimeoutPolicy(invocation: OperationalInvocation) {
  if (invocation.group === "mcp" && invocation.toolName === "create_design_export") {
    // A measured 22.94-second clip took 95.734 seconds to render and store.
    // Keep the longer client wait exclusive to synchronous export creation.
    return { defaultMs: MAX_EXPORT_TIMEOUT_MS, maxMs: MAX_EXPORT_TIMEOUT_MS }
  }
  if (["media", "brand", "studio"].includes(invocation.group) ||
    (invocation.group === "feedback" && invocation.action === "submit")) {
    return { defaultMs: MAX_TIMEOUT_MS, maxMs: MAX_TIMEOUT_MS }
  }
  return { defaultMs: DEFAULT_OPERATION_TIMEOUT_MS, maxMs: MAX_TIMEOUT_MS }
}

function assertMcpCallToolName(input: {
  action: string | undefined
  group: string | undefined
  toolName: string | undefined
}) {
  if (input.group !== "mcp" || input.action !== "call") return
  if (!input.toolName || !/^[a-z0-9_]{1,160}$/.test(input.toolName)) {
    throw new OperationalMcpError("input_invalid")
  }
}

function isSupportedOperationalCommand(
  group: string | undefined,
  action: string | undefined,
) {
  if (group === "auth") return ["login", "logout", "status"].includes(action ?? "")
  if (group === "mcp") return ["call", "capabilities"].includes(action ?? "")
  if (group === "media" || group === "brand") return action === "upload"
  if (group === "feedback") return ["status", "submit"].includes(action ?? "")
  return false
}

function readOperationalInvocation(
  argv: readonly string[],
): OperationalInvocation | null {
  const [group, action, toolName, ...rest] = argv
  if (group === "studio" && action === "reference" && toolName === "upload") {
    return {
      action: "reference-upload",
      allowedFlags: STUDIO_REFERENCE_UPLOAD_FLAGS,
      flagArgs: rest,
      group,
    }
  }
  if (!isSupportedOperationalCommand(group, action)) return null
  assertMcpCallToolName({ action, group, toolName })
  if (group === "auth") {
    return {
      action: action!,
      allowedFlags: AUTH_FLAGS,
      flagArgs: argv.slice(2),
      group,
    }
  }
  if (group === "media") {
    return {
      action: action!,
      allowedFlags: MEDIA_UPLOAD_FLAGS,
      flagArgs: argv.slice(2),
      group,
    }
  }
  if (group === "brand") {
    return {
      action: action!,
      allowedFlags: BRAND_UPLOAD_FLAGS,
      flagArgs: argv.slice(2),
      group,
    }
  }
  if (group === "feedback") {
    return {
      action: action!,
      allowedFlags:
        action === "submit" ? FEEDBACK_SUBMIT_FLAGS : FEEDBACK_STATUS_FLAGS,
      flagArgs: argv.slice(2),
      group,
    }
  }
  if (action === "capabilities") {
    return {
      action,
      allowedFlags: CAPABILITY_FLAGS,
      flagArgs: argv.slice(2),
      group: "mcp",
    }
  }
  return {
    action: action!,
    allowedFlags: CALL_FLAGS,
    flagArgs: rest,
    group: "mcp",
    toolName,
  }
}

function safeErrorCode(error: unknown) {
  if (
    error instanceof OperationalMcpError ||
    error instanceof CliExportFileError ||
    error instanceof CliMediaUploadError ||
    error instanceof CliImageFileError ||
    error instanceof OAuthSessionError ||
    error instanceof SecureCredentialError
  ) {
    return error.code
  }
  return "operation_failed"
}

function safeErrorResult(error: unknown) {
  return {
    code: safeErrorCode(error),
    ...(error instanceof CliImageFileError &&
    error.createdOutputPaths.length > 0
      ? { createdOutputPaths: error.createdOutputPaths }
      : {}),
    ok: false as const,
  }
}

function printResult(value: Record<string, unknown>, json: boolean) {
  if (json) {
    process.stdout.write(`${JSON.stringify(value)}\n`)
    return
  }
  process.stdout.write("Semlens CLI\n")
  for (const [key, item] of Object.entries(value)) {
    process.stdout.write(
      `${key}: ${typeof item === "string" ? item : JSON.stringify(item)}\n`,
    )
  }
}

async function withStoredConnection<T>(input: {
  endpoint: string
  timeoutMs: number
  run: (
    client: Awaited<ReturnType<typeof connectAuthenticatedMcp>>["client"],
    signal: AbortSignal,
    provider: Awaited<ReturnType<typeof createStoredSessionProvider>>,
  ) => Promise<T>
}) {
  const signal = AbortSignal.timeout(input.timeoutMs)
  const provider = await createStoredSessionProvider({
    endpoint: input.endpoint,
    signal,
  })
  const connected = await connectAuthenticatedMcp({
    endpoint: input.endpoint,
    provider,
    signal,
  })
  try {
    return await input.run(connected.client, signal, provider)
  } finally {
    await connected.client.close().catch(() => undefined)
  }
}

async function runAuthCommand(
  action: string,
  flags: ParsedOperationalFlags,
  testOptions?: { callbackPort: number },
) {
  const store = new ProtectedCredentialStore(flags.endpoint)
  if (action === "login") {
    return withEndpointCredentialLock(flags.endpoint, () =>
      loginWithBrowser({
        callbackPort: testOptions?.callbackPort,
        endpoint: flags.endpoint,
        store,
        timeoutMs: flags.timeoutMs,
      }),
    )
  }
  if (action === "logout") {
    const signal = AbortSignal.timeout(flags.timeoutMs)
    const deleted = await withEndpointCredentialLock(flags.endpoint, () =>
      store.delete(signal),
    )
    return {
      localCredentialsRemoved: deleted,
      ok: true,
      remoteRevocation: "not_attempted",
    }
  }
  if (action === "status") {
    return withEndpointCredentialLock(flags.endpoint, async () => {
      const stored = await store.load(AbortSignal.timeout(flags.timeoutMs))
      if (!stored || Object.keys(stored.tokensByIssuer).length === 0) {
        return { credentialsStored: false, ok: true, verified: false }
      }
      try {
        await withStoredConnection({
          endpoint: flags.endpoint,
          run: async (client, signal) => {
            await client.listTools({}, { signal })
          },
          timeoutMs: flags.timeoutMs,
        })
        return { credentialsStored: true, ok: true, verified: true }
      } catch {
        const current = await store.load(AbortSignal.timeout(flags.timeoutMs))
        return {
          credentialsStored: Boolean(current && Object.keys(current.tokensByIssuer).length),
          ok: false,
          verified: false,
        }
      }
    })
  }
  throw new OperationalMcpError("input_invalid")
}

async function runMcpCommand(
  action: string,
  toolName: string | undefined,
  flags: ParsedOperationalFlags,
) {
  if (action === "call" && ["create_design_export", "retrieve_design_video_export"].includes(toolName ?? "") &&
    (flags.outputDirectory || flags.outputFile)) {
    await validateExportOutputDestination({
      outputDirectory: flags.outputDirectory,
      outputFile: flags.outputFile,
      overwrite: flags.overwrite,
    })
  }
  return withEndpointCredentialLock(flags.endpoint, () =>
    withStoredConnection({
      endpoint: flags.endpoint,
      timeoutMs: flags.timeoutMs,
      run: async (client, signal) => {
        if (action === "capabilities") {
          return inspectCliCapabilities({
            client,
            operationIds: flags.operationIds,
            signal,
          })
        }
        if (action !== "call" || !toolName || toolName.length > 160) {
          throw new OperationalMcpError("input_invalid")
        }
        const argumentsValue = readToolInput({
          inputFile: flags.inputFile,
          inputJson: flags.inputJson,
        })
        return executeRegisteredTool({
          approvals: {
            external: flags.approveExternal,
            write: flags.approveWrite,
          },
          arguments: argumentsValue,
          client,
          endpoint: flags.endpoint,
          outputDirectory: flags.outputDirectory,
          outputFile: flags.outputFile,
          overwrite: flags.overwrite,
          requestTimeoutMs: flags.timeoutMs,
          signal,
          toolName,
        })
      },
    }),
  )
}

async function runMediaCommand(action: string, flags: ParsedOperationalFlags) {
  if (action !== "upload") throw new OperationalMcpError("input_invalid")
  const items = readMediaUploadItems({
    batchFile: flags.batchFile,
    file: flags.file,
    requestId: flags.requestId,
  })
  return withEndpointCredentialLock(flags.endpoint, () =>
    withStoredConnection({
      endpoint: flags.endpoint,
      timeoutMs: flags.timeoutMs,
      run: (client, signal, provider) =>
        uploadMediaFiles({
          approveWrite: flags.approveWrite,
          client,
          endpoint: flags.endpoint,
          items,
          provider,
          signal,
        }),
    }),
  )
}

async function runBrandCommand(action: string, flags: ParsedOperationalFlags) {
  if (action !== "upload") throw new OperationalMcpError("input_invalid")
  const items = readBrandUploadItems({
    batchFile: flags.batchFile,
    file: flags.file,
    kind: flags.kind,
    label: flags.label,
    requestId: flags.requestId,
  })
  return withEndpointCredentialLock(flags.endpoint, () =>
    withStoredConnection({
      endpoint: flags.endpoint,
      timeoutMs: flags.timeoutMs,
      run: (client, signal, provider) =>
        uploadBrandFiles({
          approveWrite: flags.approveWrite,
          client,
          endpoint: flags.endpoint,
          items,
          provider,
          signal,
        }),
    }),
  )
}

async function runStudioCommand(action: string, flags: ParsedOperationalFlags) {
  if (action !== "reference-upload") {
    throw new OperationalMcpError("input_invalid")
  }
  return withEndpointCredentialLock(flags.endpoint, () =>
    withStoredConnection({
      endpoint: flags.endpoint,
      timeoutMs: flags.timeoutMs,
      run: (client, signal, provider) =>
        uploadStudioReference({
          approveWrite: flags.approveWrite,
          client,
          endpoint: flags.endpoint,
          filePath: flags.file,
          provider,
          requestId: flags.requestId,
          signal,
        }),
    }),
  )
}

async function runFeedbackCommand(
  action: string,
  flags: ParsedOperationalFlags,
) {
  return withEndpointCredentialLock(flags.endpoint, () =>
    withStoredConnection({
      endpoint: flags.endpoint,
      timeoutMs: flags.timeoutMs,
      run: async (client, signal, provider) => {
        if (action === "status") {
          return inspectFeedbackStatus({
            client,
            clientSubmissionKey: flags.requestId,
            reportId: flags.reportId,
            signal,
          })
        }
        if (action !== "submit") throw new OperationalMcpError("input_invalid")
        const prepared = await readFeedbackSubmission({
          attachmentFile: flags.attachmentFile,
          attachmentsFile: flags.attachmentsFile,
          pathname: flags.pathname,
          reportFile: flags.reportFile,
          requestId: flags.requestId,
          signal,
          summary: flags.summary,
        })
        return submitFeedback({
          approveWrite: flags.approveWrite,
          client,
          endpoint: flags.endpoint,
          prepared,
          provider,
          signal,
        })
      },
    }),
  )
}

export async function runOperationalCommand(
  argv: readonly string[],
  testOptions?: { callbackPort: number },
) {
  let invocation: OperationalInvocation | null = null
  let json = argv.includes("--json")
  try {
    invocation = readOperationalInvocation(argv)
    if (!invocation) return false
    const timeoutPolicy = resolveTimeoutPolicy(invocation)
    const flags = parseOperationalFlags(
      invocation.flagArgs,
      invocation.allowedFlags,
      timeoutPolicy.defaultMs,
      timeoutPolicy.maxMs,
    )
    json = flags.json
    let result
    if (invocation.group === "auth") {
      result = await runAuthCommand(invocation.action, flags, testOptions)
    } else if (invocation.group === "mcp") {
      result = await runMcpCommand(
        invocation.action,
        invocation.toolName,
        flags,
      )
    } else if (invocation.group === "brand") {
      result = await runBrandCommand(invocation.action, flags)
    } else if (invocation.group === "feedback") {
      result = await runFeedbackCommand(invocation.action, flags)
    } else if (invocation.group === "studio") {
      result = await runStudioCommand(invocation.action, flags)
    } else {
      result = await runMediaCommand(invocation.action, flags)
    }
    printResult({ ...result, endpoint: flags.endpoint }, flags.json)
    if ("ok" in result && result.ok === false) process.exitCode = 1
  } catch (error) {
    printResult(safeErrorResult(error), json)
    process.exitCode = 1
  }
  return true
}
