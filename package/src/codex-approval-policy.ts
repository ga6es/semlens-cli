import { parse } from "smol-toml"
import { SEMLENS_MCP_SERVER_MANIFEST } from "./manifest.js"
import { parseSafeMcpUrl } from "./safe-mcp-url.js"

export type CodexApprovalContext = {
  profile?: string
  reportedPolicy?: "never" | "on-request"
  rejectionReported?: boolean
  tool?: string
}

export type CodexApprovalCheck = {
  name: string
  status: "fail" | "not_checked" | "pass" | "warn"
  message: string
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

/** Only allowlisted diagnostic inputs are retained; never echo raw flags/config. */
export function readCodexApprovalContext(flags: Map<string, string | true>): CodexApprovalContext {
  const allowed = ["codex-profile", "codex-approval-policy", "codex-approval-rejected", "codex-tool"]
  for (const name of flags.keys()) {
    if (name.startsWith("codex-") && !allowed.includes(name)) throw new Error("Unknown Codex approval diagnostic flag.")
  }
  const profile = flags.get("codex-profile")
  const policy = flags.get("codex-approval-policy")
  const rejected = flags.get("codex-approval-rejected")
  const tool = flags.get("codex-tool")
  if (profile !== undefined && (typeof profile !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(profile))) throw new Error("Invalid Codex legacy profile selector.")
  if (policy !== undefined && policy !== "never" && policy !== "on-request") throw new Error("Codex reported approval policy must be never or on-request.")
  if (rejected !== undefined && rejected !== true) throw new Error("Codex approval rejection is a boolean observation flag.")
  if (tool !== undefined && (typeof tool !== "string" || !/^[a-z][a-z0-9_]{0,127}$/.test(tool))) throw new Error("Invalid Codex diagnostic tool selector.")
  return { profile, reportedPolicy: policy, rejectionReported: rejected === true, tool }
}

export function createCodexApprovalEvidenceChecks(context: CodexApprovalContext): CodexApprovalCheck[] {
  const checks: CodexApprovalCheck[] = [{
    name: "codex effective approval policy", status: "not_checked",
    message: "Saved config and caller-reported settings do not verify loaded policy. CLI overrides, selected profiles, trusted project config and managed requirements may differ; inspect the affected client's supported session information.",
  }]
  if (context.reportedPolicy) checks.push({
    name: "codex caller reported approval policy", status: "warn",
    message: `Caller reports ${context.reportedPolicy}; this is not independently verified runtime policy.`,
  })
  if (context.rejectionReported) checks.push({
    name: "codex caller reported client approval rejection", status: "warn",
    message: "Caller reports the Codex approval-required/never rejection before Semlens execution. This is client-side, not a Semlens auth, owner or billing diagnosis. Preserve work; review the affected client's policy and explicitly authorized per-tool exceptions. Do not retry writes or broaden server approval automatically.",
  })
  return checks
}

function readSavedPolicy(value: unknown) {
  if (value === undefined) return "unspecified"
  if (value === "never" || value === "on-request" || value === "on-failure" || value === "untrusted") return value
  if (Object.hasOwn(record(value), "granular")) return "granular"
  return "unrecognized"
}

function readManualServers(config: Record<string, unknown>, partialName?: string) {
  return Object.entries(record(config.mcp_servers)).filter(([name, value]) => {
    const server = record(value)
    const url = typeof server.url === "string" ? parseSafeMcpUrl(server.url) : null
    return url?.toString().replace(/\/+$/, "") === SEMLENS_MCP_SERVER_MANIFEST.canonicalEndpoint
      || (name === partialName && server.url === undefined)
  }).map(([name, server]) => ({ name, origin: "manual" as const, settings: record(server) }))
}

function readPluginServers(config: Record<string, unknown>) {
  return Object.entries(record(config.plugins))
    .filter(([name]) => name.startsWith("semlens-mcp@"))
    .map(([, plugin]) => record(record(record(plugin).mcp_servers)[SEMLENS_MCP_SERVER_MANIFEST.serverName]))
    .filter(server => Object.keys(server).length > 0)
    .map(settings => ({ name: SEMLENS_MCP_SERVER_MANIFEST.serverName, origin: "plugin" as const, settings }))
}

function mergeServerSettings(base: Record<string, unknown> = {}, profile: Record<string, unknown> = {}) {
  const tools = { ...record(base.tools) }
  for (const [name, override] of Object.entries(record(profile.tools))) {
    tools[name] = { ...record(tools[name]), ...record(override) }
  }
  return { ...base, ...profile, tools }
}

function readServerApprovalCheck(server: Record<string, unknown>, context: CodexApprovalContext, policy: string): CodexApprovalCheck {
  const toolMode = context.tool ? record(record(server.tools)[context.tool]).approval_mode : undefined
  const mode = toolMode ?? server.default_tools_approval_mode
  if (mode !== undefined && !["auto", "prompt", "writes", "approve"].includes(String(mode))) return {
    name: "codex saved tool approval", status: "fail", message: "The inspected tool approval mode is invalid; review the affected client configuration manually. Nothing was changed.",
  }
  if (toolMode === "approve") return {
    name: "codex saved tool approval", status: "warn", message: "The selected tool has a saved scoped approve exception. This is not proof it was authorized or loaded; retain separate publishing/destructive approval gates.",
  }
  const never = context.reportedPolicy ? context.reportedPolicy === "never" : policy === "never"
  if (never && (mode === "writes" || mode === "prompt")) return {
    name: "codex saved approval conflict", status: "warn", message: "Saved writes/prompt mode may require approval that a never/noninteractive client cannot present. Confirm loaded policy; for authorized unattended work approve only the exact authorized tools, retaining publishing/destructive prompts. Do not switch the server default to approve.",
  }
  return {
    name: "codex saved tool approval", status: mode === "writes" ? "pass" : "warn",
    message: mode === "writes"
      ? "Saved writes is the interactive default: Codex may prompt for mutations. It grants no Semlens permissions and does not verify loaded policy."
      : "Saved tool approval differs from the interactive writes default or is unspecified. Review it manually; no approval settings were changed.",
  }
}

/** Profiles overlay the same manual connection ID only; endpoint equality is not identity. */
function readSavedConnectionApproval(config: Record<string, unknown>, profile: Record<string, unknown>, context: CodexApprovalContext, policy: string): CodexApprovalCheck | undefined {
  const baseServers = [...readManualServers(config), ...readPluginServers(config)]
  const profileServers = readManualServers(profile, baseServers.length === 1 ? baseServers[0].name : undefined)
  const base = baseServers[0]
  const overlay = profileServers[0]
  const differentConnection = base && overlay && (base.name !== overlay.name || base.origin !== overlay.origin)
  if (baseServers.length > 1 || profileServers.length > 1 || differentConnection) {
    return { name: "codex saved approval ambiguity", status: "warn", message: "Multiple saved Semlens blocks match. Tool approval was not resolved; inspect the affected client's selected connection manually. Nothing was changed." }
  }
  if (!baseServers.length && !profileServers.length) return undefined
  return readServerApprovalCheck(mergeServerSettings(base?.settings, overlay?.settings), context, policy)
}

/** Single-file evidence only. Legacy profile inspection never resolves modern/loaded config. */
export function createCodexSavedApprovalChecks(source: string, context: CodexApprovalContext): CodexApprovalCheck[] {
  let config: Record<string, unknown>
  try { config = record(parse(source.replace(/^\uFEFF/, ""))) } catch { return [] }
  const checks: CodexApprovalCheck[] = []
  const selectedProfile = context.profile ?? (typeof config.profile === "string" ? config.profile : undefined)
  const profile = selectedProfile ? record(record(config.profiles)[selectedProfile]) : {}
  if (selectedProfile) checks.push({
    name: "codex saved legacy profile", status: "warn",
    message: Object.keys(profile).length > 0
      ? "Inspected a saved legacy profile table over base settings; active selection/version remains unverified. Codex 0.134+ uses separate profile files, not these tables."
      : "The selected legacy profile table is absent. Modern profile files, command-line selection and loaded settings were not inspected.",
  })
  const policy = readSavedPolicy(profile.approval_policy ?? config.approval_policy)
  checks.push({
    name: "codex saved approval policy", status: policy === "unrecognized" ? "fail" : "warn",
    message: `Inspected saved policy: ${policy}. This file does not establish effective session policy; deprecated/unsupported modes and granular rules require the affected client's own validation.`,
  })
  const connectionCheck = readSavedConnectionApproval(config, profile, context, policy)
  if (connectionCheck) checks.push(connectionCheck)
  return checks
}
