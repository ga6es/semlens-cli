/**
 * Public compatibility contract shared by the application and CLI package.
 * Keep this module dependency-free so the public CLI export can consume it
 * without importing application source.
 */
export const SEMLENS_CODEX_APPROVAL_GUIDANCE = [
    'Keep default_tools_approval_mode="writes" for interactive Codex: client-side prompts for mutations are separate from Semlens account/workflow permissions.',
    'If Codex reports "MCP tool call requires approval, but approval policy is never", the client rejected the call before Semlens. For explicitly authorized unattended work, review only the exact tool exceptions; never blanket-approve the server. Keep publishing and destructive actions separately prompted and authorized.',
    'Manual server exception syntax: [mcp_servers.semlens-mcp.tools.<authorized-tool>] with approval_mode="approve". Plugin overrides use [plugins."<installed-plugin-id>".mcp_servers.semlens-mcp.tools.<authorized-tool>]; use the host-reported plugin ID, not a second manual connection.',
    'Saved top-level/profile/per-tool settings do not prove loaded policy. CLI overrides, trusted project config and managed requirements may differ. Use supported client session information; never infer that a later config edit caused recovery or automatically reconnect, repair approval settings, or retry writes.'
] as const;
export const SEMLENS_PUBLIC_COMPATIBILITY = {
    canonicalEndpoint: "https://agents.semlens.com/api/mcp",
    clientProfiles: {
        default: {
            description: "Use the bounded default tools for native authoring, image quotes, Research and account assets; full adds image execution and other workflows.",
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
            capabilityChange: "Restart or reconnect the MCP client, or begin a new agent task, so it rediscovers the current tool manifest. OAuth reauthorization is not normally required.",
            endpointChange: "Reconnect the MCP client after changing the endpoint. The client may require OAuth authentication for the canonical endpoint.",
            permissionInvariant: "Tool discovery never grants write access. Semlens access, workflow permissions, billing, ownership, provider requirements, and client approval still govern mutations.",
        },
        updateContract: "CLI, plugins, skills, docs, smoke tests, and Account UI consume the public compatibility contract instead of inventing release metadata.",
    },
    manifestVersion: "2026-10-19.mcp-gpt-image-only",
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
            "inspect_uploaded_assets",
            "import_uploaded_assets_from_urls",
            "inspect_brand_kit",
            "import_brand_assets_from_urls",
            "inspect_studio_generation_capabilities",
            "quote_studio_generation",
            "list_native_projects",
            "inspect_native_project",
            "inspect_native_project_read_target",
            "read_native_project_files",
            "inspect_native_project_history_health",
            "lint_native_project_html",
            "read_native_project_imported_asset",
            "create_native_project",
            "open_native_project",
            "save_native_project_files",
            "read_native_project_sidecars",
            "save_native_project_sidecars",
            "import_native_project_asset",
            "list_native_project_catalog",
            "install_native_project_catalog",
            "preview_native_project_candidate",
            "inspect_native_project_candidate",
            "cancel_native_project_candidate",
            "save_native_project_candidate",
            "capture_native_project",
            "export_native_project",
            "inspect_native_project_job",
            "cancel_native_project_job",
            "inspect_native_project_result",
            "publish_native_project_preview",
            "check_native_project",
            "inspect_native_speech_configuration",
            "quote_native_project_speech",
            "submit_native_project_speech",
            "inspect_native_project_speech",
            "cancel_native_project_speech",
            "verify_native_project_speech",
            "apply_native_project_speech",
            "retrieve_native_project_speech_audio",
            "recover_native_project_speech_intent",
            "prepare_native_project_media_upload",
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
            current: "0.5.5",
            minimumCompatible: "0.5.0",
            published: "",
        },
        plugin: {
            current: "0.5.1",
            minimumCompatible: "0.5.0",
        },
        skills: {
            current: "0.5.1",
            minimumCompatible: "0.5.0",
        },
    },
} as const;
export function isSemlensPublicCliSetupAvailable(input: {
    currentVersion: string;
    publishedVersion: string;
}) {
    return input.currentVersion === input.publishedVersion;
}
