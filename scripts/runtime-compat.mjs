import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export function parseVersion(value) {
  const match = String(value ?? "").match(/(\d+)\.(\d+)\.(\d+)/)
  return match ? match.slice(1).map(Number) : null
}

export function isVersionAtLeast(current, required) {
  const currentParts = parseVersion(current)
  const requiredParts = parseVersion(required)
  if (!currentParts || !requiredParts) return false
  for (let index = 0; index < 3; index += 1) {
    if (currentParts[index] !== requiredParts[index]) {
      return currentParts[index] > requiredParts[index]
    }
  }
  return true
}

export function getRuntimeCompatibility(rootDir = process.cwd()) {
  const projectPackage = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"))
  const requiredRange = projectPackage.devDependencies?.["@openai/codex-sdk"]
  const requiredVersion = parseVersion(requiredRange)?.join(".")
  let installedVersion = null
  try {
    installedVersion = JSON.parse(
      fs.readFileSync(path.join(rootDir, "node_modules", "@openai", "codex-sdk", "package.json"), "utf8"),
    ).version
  } catch {
    // Report a missing runtime below.
  }
  return {
    compatible: Boolean(requiredVersion && installedVersion && isVersionAtLeast(installedVersion, requiredVersion)),
    installedVersion,
    requiredVersion,
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  const result = getRuntimeCompatibility()
  if (!result.compatible) {
    console.error(
      `[runtime-check] Codex SDK ${result.requiredVersion ?? "required by package.json"}+ is required; installed: ${result.installedVersion ?? "missing"}. Run setup.bat or npm install.`,
    )
    process.exitCode = 1
  } else {
    console.log(`[runtime-check] Codex SDK ${result.installedVersion} is ready.`)
  }
}
