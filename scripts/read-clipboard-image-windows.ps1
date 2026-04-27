param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$directory = [System.IO.Path]::GetDirectoryName($OutputPath)
if (-not [System.IO.Directory]::Exists($directory)) {
  [System.IO.Directory]::CreateDirectory($directory) | Out-Null
}

try {
  if (-not [System.Windows.Forms.Clipboard]::ContainsImage()) {
    @{ status = "empty" } | ConvertTo-Json -Compress
    exit 3
  }

  $image = [System.Windows.Forms.Clipboard]::GetImage()
  if ($null -eq $image) {
    @{ status = "empty" } | ConvertTo-Json -Compress
    exit 3
  }

  $image.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $image.Dispose()
  @{ status = "ok"; path = $OutputPath } | ConvertTo-Json -Compress
  exit 0
} catch {
  @{ status = "error"; message = $_.Exception.Message } | ConvertTo-Json -Compress
  exit 1
}

