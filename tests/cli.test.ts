import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { crc32 } from "node:zlib"

// The package source is supplied by the reviewed export, not duplicated in the
// canonical public-repository template kept in the private monorepo.
const oauthModuleUrl = new URL("../package/src/oauth-metadata.js", import.meta.url).href
const repairModuleUrl = new URL("../package/src/codex-config-repair.js", import.meta.url).href
const operationalModuleUrl = new URL("../package/src/operational-mcp.js", import.meta.url).href
const imageFilesModuleUrl = new URL("../package/src/image-files.js", import.meta.url).href
const manifestModuleUrl = new URL("../package/dist/manifest.js", import.meta.url).href
const loadSourceModules = async () => {
  const [oauthModule, repairModule] = await Promise.all([
    import(oauthModuleUrl),
    import(repairModuleUrl),
  ])
  return {
    createAuthorizationServerMetadataUrl:
      oauthModule.createAuthorizationServerMetadataUrl,
    inspectAuthorizationServerMetadata:
      oauthModule.inspectAuthorizationServerMetadata,
    planCodexConfigRepair: repairModule.planCodexConfigRepair,
  }
}

const canonicalEndpoint = "https://agents.semlens.com/api/mcp"

test("Codex repair fails closed and recognizes the canonical starter profile", async () => {
  const { planCodexConfigRepair } = await loadSourceModules()
  const manifestModule = await import(manifestModuleUrl)
  assert.equal(
    planCodexConfigRepair(
      '[mcp_servers.semlens-mcp]\nurl = "unterminated\n',
    ).status,
    "blocked",
  )
  const plan = planCodexConfigRepair(
    [
      "[mcp_servers.semlens-mcp]",
      `url = "${canonicalEndpoint}"`,
      `enabled_tools = ${JSON.stringify(manifestModule.SEMLENS_MCP_STARTER_PROFILE_TOOL_NAMES)}`,
      "",
    ].join("\n"),
  )
  assert.equal(plan.status, "healthy")
  assert.deepEqual(plan.diagnostics, ["restricted_starter_profile"])
  assert.match(plan.updatedSource ?? "", new RegExp(canonicalEndpoint))
})

test("Codex repair keeps a custom allowlist separate from the starter profile", async () => {
  const { planCodexConfigRepair } = await loadSourceModules()
  const plan = planCodexConfigRepair(
    [
      "[mcp_servers.semlens-mcp]",
      `url = "${canonicalEndpoint}"`,
      'enabled_tools = ["inspect_mcp_authorization_status"]',
      "",
    ].join("\n"),
  )
  assert.equal(plan.status, "healthy")
  assert.deepEqual(plan.diagnostics, ["custom_enabled_tools"])
})

test("OAuth metadata discovery rejects unsafe issuers", async () => {
  const {
    createAuthorizationServerMetadataUrl,
    inspectAuthorizationServerMetadata,
  } = await loadSourceModules()
  assert.equal(
    createAuthorizationServerMetadataUrl("https://auth.example.com/oauth/v1"),
    "https://auth.example.com/.well-known/oauth-authorization-server/oauth/v1",
  )
  assert.throws(
    () => createAuthorizationServerMetadataUrl("https://[::1]/auth"),
    /not safe/,
  )
  const result = await inspectAuthorizationServerMetadata({
    authorizationServers: ["https://auth.example.com/oauth/v1"],
    fetchJson: async () => ({
      json: {
        client_id_metadata_document_supported: true,
        code_challenge_methods_supported: ["S256"],
        issuer: "https://auth.example.com/oauth/v1",
      },
      response: { ok: true, status: 200 },
    }),
  })
  assert.equal(result.clientRegistrationMode, "client_id_metadata_document")
  assert.equal(result.pkceS256Supported, true)
})

test("built CLI reports its offline compatibility and bundled skill", async () => {
  const manifestModule = await import(manifestModuleUrl)
  const skillsVersion =
    manifestModule.SEMLENS_MCP_SERVER_MANIFEST.compatibility
      .currentSkillsVersion as string
  const doctor = spawnSync(
    process.execPath,
    ["package/dist/index.js", "mcp", "doctor", "--offline", "--json"],
    { encoding: "utf8" },
  )
  assert.equal(doctor.status, 0, doctor.stderr)
  const report = JSON.parse(doctor.stdout)
  assert.equal(report.endpoint, canonicalEndpoint)
  assert.equal(report.expectedManifestVersion, manifestModule.SEMLENS_MCP_SERVER_MANIFEST.manifestVersion)
  assert.deepEqual(report.protocolCompatibility, manifestModule.SEMLENS_MCP_SERVER_MANIFEST.protocolCompatibility)
  assert.equal(report.checks.find((check: { name: string }) => check.name === "CLI version")?.status, "pass")
  assert.equal(report.checks.find((check: { name: string }) => check.name === "live metadata")?.status, "warn")
  assert.ok(report.checks.every((check: { status: string }) => check.status !== "fail"))

  const skills = spawnSync(
    process.execPath,
    ["package/dist/index.js", "skills", "list"],
    { encoding: "utf8" },
  )
  assert.equal(skills.status, 0, skills.stderr)
  assert.match(skills.stdout, /semlens-mcp/)
  assert.match(
    skills.stdout,
    new RegExp(skillsVersion.replaceAll(".", "\\.")),
  )

  const help = spawnSync(process.execPath, ["package/dist/index.js", "help"], {
    encoding: "utf8",
  })
  assert.equal(help.status, 0, help.stderr)
})

test("offline doctor rejects a CLI contract below the server minimum", () => {
  const doctor = spawnSync(
    process.execPath,
    ["package/dist/index.js", "mcp", "doctor", "--offline", "--json", "--cli-version", "0.0.0"],
    { encoding: "utf8" },
  )
  assert.equal(doctor.status, 1, doctor.stderr)
  const report = JSON.parse(doctor.stdout)
  assert.equal(report.checks.find((check: { name: string }) => check.name === "CLI version")?.status, "fail")
})

test("login and generic-call dispatch reject malformed input before credentials or network", () => {
  const loaderUrl = new URL("./deny-keyring-loader.mjs", import.meta.url).href
  for (const command of [
    ["auth", "login", "--endpoint", "not-a-url", "--json"],
    ["mcp", "call", "--json"],
  ]) {
    const result = spawnSync(
      process.execPath,
      ["--experimental-loader", loaderUrl, "package/dist/index.js", ...command],
      { encoding: "utf8" },
    )
    assert.equal(result.status, 1, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), { code: "input_invalid", ok: false })
  }
})

test("legacy commands do not load the optional native credential backend", () => {
  const loaderUrl = new URL("./deny-keyring-loader.mjs", import.meta.url).href
  const help = spawnSync(
    process.execPath,
    [
      "--experimental-loader",
      loaderUrl,
      "package/dist/index.js",
      "help",
    ],
    { encoding: "utf8" },
  )
  assert.equal(help.status, 0, help.stderr)
})

test("machine output withholds credentials and signed capabilities", async () => {
  const { sanitizeMachineValue } = await import(operationalModuleUrl)
  assert.deepEqual(
    sanitizeMachineValue({
      accessToken: "secret",
      downloadUrl: "https://files.example/download?token=secret",
      sourceUrl: "https://example.com/story?id=42",
    }),
    {
      accessToken: "[withheld]",
      downloadUrl: "[withheld]",
      sourceUrl: "https://example.com/story?id=42",
    },
  )
})

test("image output accepts large canonical PNGs and rejects malformed Base64", async () => {
  const { saveToolResultImages } = await import(imageFilesModuleUrl)
  const onePixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  )
  const metadata = Buffer.concat([Buffer.from("Comment\0"), Buffer.alloc(5 * 1024 * 1024, 97)])
  const textChunk = Buffer.alloc(12 + metadata.byteLength)
  textChunk.writeUInt32BE(metadata.byteLength, 0)
  textChunk.write("tEXt", 4, "ascii")
  metadata.copy(textChunk, 8)
  textChunk.writeUInt32BE(crc32(textChunk.subarray(4, -4)), textChunk.byteLength - 4)
  const largePng = Buffer.concat([onePixel.subarray(0, -12), textChunk, onePixel.subarray(-12)])
  const directory = await mkdtemp(join(tmpdir(), "semlens-cli-image-test-"))
  try {
    const outputFile = join(directory, "large.png")
    await saveToolResultImages({
      outputDirectory: null,
      outputFile,
      overwrite: false,
      result: { content: [{ data: largePng.toString("base64"), mimeType: "image/png", type: "image" }] },
      signal: AbortSignal.timeout(10_000),
    })
    assert.deepEqual(await readFile(outputFile), largePng)

    const canonical = onePixel.toString("base64")
    for (const malformed of [
      canonical.slice(0, -1),
      `${canonical}=`,
      `${canonical.slice(0, -2)}=A`,
      `${canonical.slice(0, -1)}_`,
    ]) {
      await assert.rejects(saveToolResultImages({
        outputDirectory: null,
        outputFile: join(directory, "malformed.png"),
        overwrite: false,
        result: { content: [{ data: malformed, mimeType: "image/png", type: "image" }] },
        signal: AbortSignal.timeout(2_000),
      }), (error: unknown) =>
        error instanceof Error && "code" in error && error.code === "image_payload_invalid")
    }
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
})

test("breaking CLI rejects the removed mcp install alias", () => {
  const result = spawnSync(
    process.execPath,
    ["package/dist/index.js", "mcp", "install"],
    { encoding: "utf8" },
  )
  assert.equal(result.status, 1)
  assert.doesNotMatch(result.stderr, /mcp install/)
})
