import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { spawnSync } from "node:child_process"

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32"
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

if (existsSync("dist")) {
  rmSync("dist", { recursive: true, force: true })
}

run("eslint", ["src"])
run("prettier", ["--write", "src/**/*", "**/*.json", "README.md"])
run("ncc", ["build", "src/index.ts", "-o", "dist"])
run("babel", ["dist", "--out-dir", "dist"])

mkdirSync("dist/scripts", { recursive: true })
cpSync("images", "dist/images", { recursive: true })
cpSync("scripts/capture-windows.ps1", "dist/scripts/capture-windows.ps1")
cpSync("scripts/read-clipboard-image-windows.ps1", "dist/scripts/read-clipboard-image-windows.ps1")
cpSync("plugin.json", "dist/plugin.json")
