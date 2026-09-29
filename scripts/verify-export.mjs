import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"

const root = process.cwd()
const manifestPath = join(root, "SOURCE_EXPORT.json")
if (!existsSync(manifestPath)) {
  throw new Error("SOURCE_EXPORT.json is required.")
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.files)) {
  throw new Error("SOURCE_EXPORT.json has an unsupported shape.")
}

const ignoredRoots = new Set([".git", "node_modules"])
const ignoredGenerated = new Set([
  "semlens-cli.cdx.json",
  "npm-pack.json",
])

function listFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    const relativePath = relative(root, path).replaceAll("\\", "/")
    const rootName = relativePath.split("/")[0]
    if (ignoredRoots.has(rootName)) continue
    if (entry.isDirectory()) {
      if (relativePath === "package/dist") continue
      files.push(...listFiles(path))
      continue
    }
    if (ignoredGenerated.has(relativePath) || relativePath.endsWith(".tgz")) {
      continue
    }
    files.push(relativePath)
  }
  return files.sort()
}

const expectedFiles = manifest.files.map((entry) => entry.path).sort()
const actualFiles = listFiles(root).filter(
  (path) => path !== "SOURCE_EXPORT.json",
)
if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
  throw new Error(
    `Export file set drifted.\nExpected: ${expectedFiles.join(", ")}\nActual: ${actualFiles.join(", ")}`,
  )
}

for (const entry of manifest.files) {
  const normalizedText = readFileSync(join(root, entry.path), "utf8").replaceAll(
    "\r\n",
    "\n",
  )
  const digest = createHash("sha256")
    .update(normalizedText, "utf8")
    .digest("hex")
  if (digest !== entry.sha256) {
    throw new Error(`${entry.path} does not match its export fingerprint.`)
  }
}

process.stdout.write(
  `Verified ${manifest.files.length} files from ${manifest.source.commit}.\n`,
)
