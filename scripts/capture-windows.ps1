param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class WoxScreenshotNative {
  [DllImport("user32.dll")]
  public static extern bool SetProcessDPIAware();

  [DllImport("user32.dll")]
  public static extern bool SetProcessDpiAwarenessContext(IntPtr dpiContext);
}
"@

try {
  # Per-monitor DPI awareness keeps WinForms coordinates aligned with physical
  # screen pixels on scaled displays such as 150%.
  [WoxScreenshotNative]::SetProcessDpiAwarenessContext([IntPtr](-4)) | Out-Null
} catch {
  try {
    [WoxScreenshotNative]::SetProcessDPIAware() | Out-Null
  } catch {
  }
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Forms.Application]::EnableVisualStyles()

$screenBounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
$directory = [System.IO.Path]::GetDirectoryName($OutputPath)
if (-not [System.IO.Directory]::Exists($directory)) {
  [System.IO.Directory]::CreateDirectory($directory) | Out-Null
}

$desktopBitmap = New-Object System.Drawing.Bitmap $screenBounds.Width, $screenBounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($desktopBitmap)
$graphics.CopyFromScreen($screenBounds.Left, $screenBounds.Top, 0, 0, $screenBounds.Size)
$graphics.Dispose()

$form = New-Object System.Windows.Forms.Form
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$form.Bounds = $screenBounds
$form.TopMost = $true
$form.ShowInTaskbar = $false
$form.KeyPreview = $true
$form.Cursor = [System.Windows.Forms.Cursors]::Cross
$form.DoubleBuffered = $true
$form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::None
$form.BackColor = [System.Drawing.Color]::Black
$form.Opacity = 1

$state = @{
  Dragging = $false
  Start = [System.Drawing.Point]::Empty
  Current = [System.Drawing.Point]::Empty
  Selection = [System.Drawing.Rectangle]::Empty
  PreviousSelection = [System.Drawing.Rectangle]::Empty
  Cancelled = $false
  Completed = $false
}

function Get-SelectionRectangle([System.Drawing.Point]$a, [System.Drawing.Point]$b) {
  $x = [Math]::Min($a.X, $b.X)
  $y = [Math]::Min($a.Y, $b.Y)
  $w = [Math]::Abs($a.X - $b.X)
  $h = [Math]::Abs($a.Y - $b.Y)
  return New-Object System.Drawing.Rectangle $x, $y, $w, $h
}

function Get-RepaintRectangle([System.Drawing.Rectangle]$a, [System.Drawing.Rectangle]$b) {
  if ($a.IsEmpty) {
    $union = $b
  } elseif ($b.IsEmpty) {
    $union = $a
  } else {
    $union = [System.Drawing.Rectangle]::Union($a, $b)
  }

  $top = [Math]::Max(0, $union.Top - 34)
  $left = [Math]::Max(0, $union.Left - 4)
  $right = [Math]::Min($form.Width, $union.Right + 4)
  $bottom = [Math]::Min($form.Height, $union.Bottom + 4)
  return New-Object System.Drawing.Rectangle $left, $top, ([Math]::Max(1, $right - $left)), ([Math]::Max(1, $bottom - $top))
}

function Set-Selection([System.Drawing.Rectangle]$nextSelection) {
  $previous = $state.Selection
  $state.PreviousSelection = $previous
  $state.Selection = $nextSelection
  $form.Invalidate((Get-RepaintRectangle $previous $nextSelection))
}

function Complete-Capture {
  if ($state.Selection.Width -lt 2 -or $state.Selection.Height -lt 2) {
    return
  }

  $crop = New-Object System.Drawing.Bitmap $state.Selection.Width, $state.Selection.Height
  $cropGraphics = [System.Drawing.Graphics]::FromImage($crop)
  $sourceRect = New-Object System.Drawing.Rectangle $state.Selection.X, $state.Selection.Y, $state.Selection.Width, $state.Selection.Height
  $targetRect = New-Object System.Drawing.Rectangle 0, 0, $state.Selection.Width, $state.Selection.Height
  $cropGraphics.DrawImage($desktopBitmap, $targetRect, $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)
  $cropGraphics.Dispose()
  $crop.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $crop.Dispose()

  $state.Completed = $true
  $form.Close()
}

$form.Add_Paint({
    param($sender, $event)
    $g = $event.Graphics
    $g.DrawImage($desktopBitmap, 0, 0)

    $overlay = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(145, 0, 0, 0))
    $g.FillRectangle($overlay, 0, 0, $form.Width, $form.Height)
    $overlay.Dispose()

    if ($state.Selection.Width -gt 0 -and $state.Selection.Height -gt 0) {
      $g.DrawImage($desktopBitmap, $state.Selection, $state.Selection, [System.Drawing.GraphicsUnit]::Pixel)

      $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 74, 163, 255)), 2
      $g.DrawRectangle($pen, $state.Selection)
      $pen.Dispose()

      $label = "{0} x {1}" -f $state.Selection.Width, $state.Selection.Height
      $font = New-Object System.Drawing.Font "Segoe UI", 10
      $labelSize = $g.MeasureString($label, $font)
      $labelRect = New-Object System.Drawing.RectangleF $state.Selection.X, ([Math]::Max(0, $state.Selection.Y - $labelSize.Height - 8)), ($labelSize.Width + 12), ($labelSize.Height + 6)
      $labelBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(225, 15, 23, 42))
      $textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
      $g.FillRectangle($labelBrush, $labelRect)
      $g.DrawString($label, $font, $textBrush, ($labelRect.X + 6), ($labelRect.Y + 3))
      $font.Dispose()
      $labelBrush.Dispose()
      $textBrush.Dispose()
    }
  })

$form.Add_MouseDown({
    param($sender, $event)
    if ($event.Button -eq [System.Windows.Forms.MouseButtons]::Right) {
      $state.Cancelled = $true
      $form.Close()
      return
    }
    if ($event.Button -ne [System.Windows.Forms.MouseButtons]::Left) {
      return
    }
    $state.Dragging = $true
    $state.Start = $event.Location
    $state.Current = $event.Location
    Set-Selection (Get-SelectionRectangle $state.Start $state.Current)
  })

$form.Add_MouseMove({
    param($sender, $event)
    if (-not $state.Dragging) {
      return
    }
    $state.Current = $event.Location
    Set-Selection (Get-SelectionRectangle $state.Start $state.Current)
  })

$form.Add_MouseUp({
    param($sender, $event)
    if ($event.Button -ne [System.Windows.Forms.MouseButtons]::Left) {
      return
    }
    $state.Dragging = $false
    $state.Current = $event.Location
    Set-Selection (Get-SelectionRectangle $state.Start $state.Current)
  })

$form.Add_MouseDoubleClick({
    Complete-Capture
  })

$form.Add_KeyDown({
    param($sender, $event)
    if ($event.KeyCode -eq [System.Windows.Forms.Keys]::Escape) {
      $state.Cancelled = $true
      $form.Close()
      return
    }
    if ($event.KeyCode -eq [System.Windows.Forms.Keys]::Enter) {
      Complete-Capture
    }
  })

[System.Windows.Forms.Application]::Run($form)
$desktopBitmap.Dispose()

if ($state.Completed) {
  @{ status = "ok"; path = $OutputPath } | ConvertTo-Json -Compress
  exit 0
}

if ($state.Cancelled) {
  @{ status = "cancelled" } | ConvertTo-Json -Compress
  exit 2
}

@{ status = "cancelled" } | ConvertTo-Json -Compress
exit 2
