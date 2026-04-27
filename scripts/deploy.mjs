import { cpSync, existsSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

const manifest = JSON.parse(readFileSync("plugin.json", "utf8"))
const targetRoot = join(homedir(), ".wox", "wox-user", "plugins")
const target = join(targetRoot, `${manifest.Id}@${manifest.Version}`)

if (!existsSync("dist/index.js")) {
  throw new Error("dist/index.js does not exist. Run pnpm build before pnpm deploy.")
}

if (existsSync(target)) {
  rmSync(target, { recursive: true, force: true })
}

cpSync("dist", target, { recursive: true })
console.log(`Deployed Screenshot OCR to ${target}`)

