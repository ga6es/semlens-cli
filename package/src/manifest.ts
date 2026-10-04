import { SEMLENS_PUBLIC_COMPATIBILITY } from "./public-compatibility.js"

/**
 * Runtime-neutral CLI metadata. Public compatibility literals come from the
 * dependency-free contract shared with the application.
 */
export const SEMLENS_MCP_SERVER_MANIFEST = {
  canonicalEndpoint: SEMLENS_PUBLIC_COMPATIBILITY.canonicalEndpoint,
  cli: {
    binaryName: "semlens",
    currentVersion: SEMLENS_PUBLIC_COMPATIBILITY.versions.cli.current,
    npmPackageName: "@semlens/cli",
    npmPackageStatus: "prepared",
    npmPersistentInstallCommand: "npm install -g @semlens/cli",
    npmRunCommand: "npm exec @semlens/cli@latest --",
    preparedVersion: SEMLENS_PUBLIC_COMPATIBILITY.versions.cli.current,
    publishedVersion: SEMLENS_PUBLIC_COMPATIBILITY.versions.cli.published,
    standaloneBinaryStatus: "planned",
  },
  compatibility: {
    currentPluginVersion:
      SEMLENS_PUBLIC_COMPATIBILITY.versions.plugin.current,
    currentSkillsVersion:
      SEMLENS_PUBLIC_COMPATIBILITY.versions.skills.current,
    minimumCliVersion:
      SEMLENS_PUBLIC_COMPATIBILITY.versions.cli.minimumCompatible,
    minimumPluginVersion:
      SEMLENS_PUBLIC_COMPATIBILITY.versions.plugin.minimumCompatible,
    minimumSkillsVersion:
      SEMLENS_PUBLIC_COMPATIBILITY.versions.skills.minimumCompatible,
    reconnectPolicy:
      SEMLENS_PUBLIC_COMPATIBILITY.compatibilityText.reconnectPolicy,
    updateContract:
      SEMLENS_PUBLIC_COMPATIBILITY.compatibilityText.updateContract,
  },
  protocolCompatibility: SEMLENS_PUBLIC_COMPATIBILITY.protocolCompatibility,
  designOperationContract: SEMLENS_PUBLIC_COMPATIBILITY.designOperationContract,
  clientProfiles: SEMLENS_PUBLIC_COMPATIBILITY.clientProfiles,
  recoveryPaths: {
    accountAccess: "/account/agent",
    billing: null,
    pricing: null,
    providerConnections: null,
  },
  manifestVersion: SEMLENS_PUBLIC_COMPATIBILITY.manifestVersion,
  plugin: {
    codexMarketplaceStatus: "private-preview",
    packageName: "semlens-mcp",
  },
  productName: "Semlens MCP",
  serverName: SEMLENS_PUBLIC_COMPATIBILITY.serverName,
} as const

export const SEMLENS_MCP_READ_FIRST_TOOL_NAMES = [
  "inspect_mcp_capabilities",
  "inspect_mcp_authorization_status",
  "inspect_rules",
  "list_recent_designs",
  "inspect_design_metadata",
  "inspect_design_document",
  "inspect_design_page",
] as const

export const SEMLENS_MCP_STARTER_PROFILE_TOOL_NAMES =
  SEMLENS_PUBLIC_COMPATIBILITY.profiles.starterTools
