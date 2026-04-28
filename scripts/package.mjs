import { existsSync, rmSync } from "node:fs"
import { spawnSync } from "node:child_process"

const packageFile = "wox.plugin.screenshotocr.wox"
const packageZip = "wox.plugin.screenshotocr.zip"

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

for (const path of [packageFile, packageZip]) {
  if (existsSync(path)) {
    rmSync(path, { force: true })
  }
}

run("pnpm", ["run", "build"])

if (process.platform === "win32") {
  run("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `Compress-Archive -Path 'dist\\*' -DestinationPath '${packageZip}'; Move-Item '${packageZip}' '${packageFile}'`
  ])
} else {
  run("zip", ["-r", `../${packageFile}`, "."], { cwd: "dist" })
}
