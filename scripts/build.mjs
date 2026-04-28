import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

if (existsSync("dist")) {
  rmSync("dist", { recursive: true, force: true })
}

run("eslint", ["src"])
run("prettier", ["--write", "src/**/*", "**/*.json", "README.md", "README.en.md"])
run(
  "dotnet",
  [
    "publish",
    "tools/WindowsOcr/WindowsOcr.csproj",
    "-c",
    "Release",
    "-o",
    "tools/WindowsOcr/publish"
  ],
  {
    env: {
      ...process.env,
      DOTNET_CLI_HOME: join(process.cwd(), ".dotnet-home"),
      DOTNET_SKIP_FIRST_TIME_EXPERIENCE: "1",
      DOTNET_CLI_TELEMETRY_OPTOUT: "1"
    }
  }
)
run("ncc", ["build", "src/index.ts", "-o", "dist"])
run("babel", ["dist", "--out-dir", "dist"])

mkdirSync("dist/scripts", { recursive: true })
mkdirSync("dist/bin", { recursive: true })
cpSync("images", "dist/images", { recursive: true })
cpSync("tools/WindowsOcr/publish", "dist/bin/WindowsOcr", { recursive: true })
cpSync("scripts/capture-windows.ps1", "dist/scripts/capture-windows.ps1")
cpSync("scripts/read-clipboard-image-windows.ps1", "dist/scripts/read-clipboard-image-windows.ps1")
cpSync("plugin.json", "dist/plugin.json")
