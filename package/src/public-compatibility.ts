/**
 * Public compatibility contract shared by the application and CLI package.
 * Keep this module dependency-free so the public CLI export can consume it
 * without importing application source.
 */
export const SEMLENS_PUBLIC_COMPATIBILITY = {
  canonicalEndpoint: "https://agents.semlens.com/api/mcp",
  clientProfiles: {
    default: {
      description:
        "Use the manifest-generated starter tool set for common Semlens workflows.",
      id: "starter",
      toolDiscovery: "starter_profile",
    },
    full: {
      description: "Explicitly discover every registered Semlens MCP tool.",
      id: "full",
      toolDiscovery: "all_registered",
    },
  },
  compatibilityText: {
    reconnectPolicy: {
      capabilityChange:
        "Restart or reconnect the MCP client, or begin a new agent task, so it rediscovers the current tool manifest. OAuth reauthorization is not normally required.",
      endpointChange:
        "Reconnect the MCP client after changing the endpoint. The client may require OAuth authentication for the canonical endpoint.",
      permissionInvariant:
        "Tool discovery never grants write access. Semlens access, workflow permissions, billing, ownership, provider requirements, and client approval still govern mutations.",
    },
    updateContract:
      "CLI, plugins, skills, docs, smoke tests, and Account UI consume the public compatibility contract instead of inventing release metadata.",
  },
  manifestVersion: "2026-09-26.semlens-identity",
  profiles: {
    starterTools: [
      "inspect_mcp_capabilities",
      "inspect_mcp_authorization_status",
      "inspect_rules",
      "inspect_news_board_source_catalog",
      "inspect_news_board_story_targets",
      "inspect_news_board_story",
      "inspect_news_board_story_research",
      "inspect_news_board_story_factual_research",
      "validate_news_board_story_research",
      "validate_news_board_story_factual_research",
      "save_news_board_story_research",
      "save_news_board_story_factual_research",
      "append_news_board_story_research_media",
      "inspect_template_candidates",
      "inspect_template_fields",
      "prepare_template_autofill",
      "create_design_from_story_research",
      "prepare_editor_action_context",
      "list_recent_designs",
      "search_user_designs",
      "inspect_design_metadata",
      "inspect_design_document",
      "inspect_design_page",
      "inspect_design_page_preview",
      "inspect_uploaded_assets",
      "import_uploaded_assets_from_urls",
      "inspect_brand_kit",
      "import_brand_assets_from_urls",
      "prepare_workspace_feedback_attachment_upload",
      "submit_workspace_feedback",
      "inspect_workspace_feedback_status",
      "inspect_export_options",
      "prepare_design_export",
      "inspect_publish_targets",
      "prepare_publish",
      "start_agent_draft",
      "start_agent_draft_recovery",
      "inspect_agent_draft_action_schema",
      "apply_actions_to_draft",
      "preview_agent_draft_page",
      "commit_agent_draft",
      "discard_agent_draft",
      "create_design_export",
      "publish_design",
    ],
  },
  protocolCompatibility: {
    cache: {
      methods: ["server/discover", "tools/list"],
      scope: "public",
      ttlMs: 300000,
    },
    legacy: {
      mode: "stateless",
      protocolVersion: "2025-11-25",
      status: "supported",
    },
    modern: {
      discoveryMethod: "server/discover",
      protocolVersion: "2026-07-28",
      status: "supported",
    },
    multiRoundTrip: {
      eligibleInteractions: ["news_board_story_target_clarification"],
      maxRounds: 2,
      status: "supported",
      unsupportedClientFallback: "bounded_tool_result",
    },
    negotiation: "automatic",
    routing: {
      bodyAuthoritative: true,
      headers: ["Mcp-Method", "Mcp-Name"],
      mismatchBehavior: "reject",
    },
    tasks: {
      advertised: false,
      extension: "io.modelcontextprotocol/tasks",
      status: "deferred",
    },
  },
  serverName: "semlens-mcp",
  versions: {
    cli: {
      current: "0.5.0",
      minimumCompatible: "0.5.0",
      published: "",
    },
    plugin: {
      current: "0.5.0",
      minimumCompatible: "0.5.0",
    },
    skills: {
      current: "0.5.0",
      minimumCompatible: "0.5.0",
    },
  },
} as const

export function isSemlensPublicCliSetupAvailable(input: {
  currentVersion: string
  publishedVersion: string
}) {
  return input.currentVersion === input.publishedVersion
}
