import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const metadata = JSON.parse(readFileSync("package/package.json", "utf8"))
assert.equal(metadata.name, "@semlens/cli")
assert.equal(metadata.version, "0.5.0")
assert.equal(metadata.license, "Apache-2.0")
assert.equal(metadata.repository.url, "git+https://github.com/ga6es/semlens-cli.git")
assert.equal(metadata.repository.directory, "package")
assert.deepEqual(metadata.dependencies, {
  "@modelcontextprotocol/client": "2.0.0",
  "@napi-rs/keyring": "2.1.0",
  "open": "11.0.0",
  "smol-toml": "1.7.1",
})
assert.equal(metadata.scripts.postinstall, undefined)
assert.deepEqual(metadata.files, [
  "dist",
  "LICENSE",
  "NOTICE",
  "README.md",
  "package.json",
  "skills/semlens-mcp",
])

const license = readFileSync("package/LICENSE", "utf8")
const notice = readFileSync("package/NOTICE", "utf8")
assert.match(license, /Apache License/)
assert.match(license, /Copyright 2026 Desk Rules contributors/)
assert.match(notice, /Semlens contributors/)

process.stdout.write("Semlens CLI package contract passed.\n")
