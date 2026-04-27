param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing @"
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public static class WoxScreenshotNative {
  [DllImport("user32.dll")]
  public static extern bool SetProcessDPIAware();

  [DllImport("user32.dll")]
  public static extern bool SetProcessDpiAwarenessContext(IntPtr dpiContext);
}

public sealed class WoxSnipOverlayForm : Form {
  private readonly Bitmap desktopBitmap;
  private readonly string outputPath;
  private bool dragging;
  private Point startPoint;
  private Point currentPoint;
  private Rectangle selection;
  private Rectangle previousSelection;

  // toolbar button rectangles (set after each repaint)
  private Rectangle btnConfirmRect;
  private Rectangle btnCopyRect;
  private Rectangle btnSaveRect;
  private int hoveredButton; // 0=none, 1=confirm, 2=copy, 3=save

  public bool Completed { get; private set; }
  public bool Cancelled { get; private set; }
  public bool Copied { get; private set; }
  public string SavedPath { get; private set; }

  protected override CreateParams CreateParams {
    get {
      CreateParams cp = base.CreateParams;
      cp.ExStyle |= 0x02000000; // WS_EX_COMPOSITED
      return cp;
    }
  }

  public WoxSnipOverlayForm(Rectangle bounds, Bitmap desktopBitmap, string outputPath) {
    this.desktopBitmap = desktopBitmap;
    this.outputPath = outputPath;
    this.FormBorderStyle = FormBorderStyle.None;
    this.StartPosition = FormStartPosition.Manual;
    this.Bounds = bounds;
    this.TopMost = true;
    this.ShowInTaskbar = false;
    this.KeyPreview = true;
    this.Cursor = Cursors.Cross;
    this.AutoScaleMode = AutoScaleMode.None;
    this.BackColor = Color.Black;
    this.SetStyle(
      ControlStyles.UserPaint |
      ControlStyles.AllPaintingInWmPaint |
      ControlStyles.OptimizedDoubleBuffer |
      ControlStyles.ResizeRedraw,
      true
    );
    this.UpdateStyles();
  }

  protected override void OnPaintBackground(PaintEventArgs e) {
    // Handled entirely in OnPaint.
  }

  protected override void OnPaint(PaintEventArgs e) {
    Graphics g = e.Graphics;
    g.CompositingMode = CompositingMode.SourceOver;
    g.CompositingQuality = CompositingQuality.HighSpeed;
    g.InterpolationMode = InterpolationMode.NearestNeighbor;
    g.PixelOffsetMode = PixelOffsetMode.Half;

    g.DrawImageUnscaled(desktopBitmap, 0, 0);

    using (SolidBrush overlay = new SolidBrush(Color.FromArgb(150, 0, 0, 0))) {
      g.FillRectangle(overlay, this.ClientRectangle);
    }

    if (selection.Width > 0 && selection.Height > 0) {
      // draw clean selection without dimming
      g.SetClip(selection);
      g.DrawImageUnscaled(desktopBitmap, 0, 0);
      g.ResetClip();

      // selection border
      using (Pen border = new Pen(Color.FromArgb(255, 74, 163, 255), 2)) {
        g.DrawRectangle(border, selection);
      }

      // size label
      string label = selection.Width + " x " + selection.Height;
      using (Font font = new Font("Segoe UI", 10)) {
        SizeF textSize = g.MeasureString(label, font);
        float labelX = selection.Left;
        float labelY = Math.Max(0, selection.Top - textSize.Height - 8);
        RectangleF labelRect = new RectangleF(labelX, labelY, textSize.Width + 12, textSize.Height + 6);
        using (SolidBrush labelBrush = new SolidBrush(Color.FromArgb(230, 15, 23, 42)))
        using (SolidBrush textBrush = new SolidBrush(Color.White)) {
          g.FillRectangle(labelBrush, labelRect);
          g.DrawString(label, font, textBrush, labelRect.X + 6, labelRect.Y + 3);
        }
      }

      // toolbar
      DrawToolbar(g);
    }
  }

  private void DrawToolbar(Graphics g) {
    int btnW = 90;
    int btnH = 34;
    int padding = 7;
    int totalW = btnW * 3 + padding * 4;
    int totalH = btnH + padding * 2;

    // position: bottom-right corner of the selection
    int barX = selection.Right - totalW;
    int barY = selection.Bottom + 8;
    if (barY + totalH > ClientSize.Height) barY = selection.Top - totalH - 8;
    if (barY < 0) barY = selection.Bottom - totalH - 4;

    // bar background
    Rectangle barRect = new Rectangle(barX, barY, totalW, totalH);
    using (GraphicsPath barPath = RoundedRect(barRect, 6))
    using (SolidBrush barBrush = new SolidBrush(Color.FromArgb(235, 30, 30, 32))) {
      g.SmoothingMode = SmoothingMode.AntiAlias;
      g.FillPath(barBrush, barPath);
      g.SmoothingMode = SmoothingMode.None;
    }

    btnConfirmRect = new Rectangle(barX + padding, barY + padding, btnW, btnH);
    btnCopyRect    = new Rectangle(barX + padding * 2 + btnW, barY + padding, btnW, btnH);
    btnSaveRect    = new Rectangle(barX + padding * 3 + btnW * 2, barY + padding, btnW, btnH);

    DrawButton(g, btnConfirmRect, "确认", hoveredButton == 1);
    DrawButton(g, btnCopyRect,    "复制", hoveredButton == 2);
    DrawButton(g, btnSaveRect,    "保存", hoveredButton == 3);
  }

  private void DrawButton(Graphics g, Rectangle rect, string text, bool hovered) {
    g.SmoothingMode = SmoothingMode.AntiAlias;

    Color bg = hovered ? Color.FromArgb(80, 80, 88) : Color.FromArgb(60, 60, 66);
    Color border = hovered ? Color.FromArgb(120, 120, 128) : Color.FromArgb(80, 80, 86);
    Color fg = hovered ? Color.White : Color.FromArgb(220, 220, 224);

    using (GraphicsPath path = RoundedRect(rect, 5))
    using (SolidBrush bgBrush = new SolidBrush(bg))
    using (Pen pen = new Pen(border, 1)) {
      g.FillPath(bgBrush, path);
      g.DrawPath(pen, path);
    }

    using (Font font = new Font("Microsoft YaHei", 11, FontStyle.Regular))
    using (SolidBrush textBrush = new SolidBrush(fg))
    using (StringFormat sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center }) {
      g.DrawString(text, font, textBrush, rect, sf);
    }

    g.SmoothingMode = SmoothingMode.None;
  }

  private static GraphicsPath RoundedRect(Rectangle rect, int radius) {
    GraphicsPath path = new GraphicsPath();
    int d = radius * 2;
    path.AddArc(rect.X, rect.Y, d, d, 180, 90);
    path.AddArc(rect.Right - d, rect.Y, d, d, 270, 90);
    path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
    path.AddArc(rect.X, rect.Bottom - d, d, d, 90, 90);
    path.CloseFigure();
    return path;
  }

  protected override void OnMouseDown(MouseEventArgs e) {
    if (e.Button == MouseButtons.Right) {
      Cancelled = true;
      Close();
      return;
    }
    if (e.Button != MouseButtons.Left) return;

    // check button clicks first
    if (hoveredButton == 1) { CompleteCapture(); return; }
    if (hoveredButton == 2) { CopyToClipboard(); return; }
    if (hoveredButton == 3) { SaveToFile(); return; }

    // start new selection
    dragging = true;
    startPoint = e.Location;
    currentPoint = e.Location;
    selection = Rectangle.Empty;
    Invalidate();
  }

  protected override void OnMouseMove(MouseEventArgs e) {
    if (dragging) {
      currentPoint = e.Location;
      SetSelection(RectangleFromPoints(startPoint, currentPoint));
      return;
    }

    // track hover on buttons
    int prev = hoveredButton;
    hoveredButton = 0;
    if (selection.Width > 0 && selection.Height > 0) {
      if (btnConfirmRect.Contains(e.Location)) hoveredButton = 1;
      else if (btnCopyRect.Contains(e.Location)) hoveredButton = 2;
      else if (btnSaveRect.Contains(e.Location)) hoveredButton = 3;
    }
    if (hoveredButton != prev) InvalidateToolbar();
    Cursor = hoveredButton > 0 ? Cursors.Hand : Cursors.Cross;
  }

  protected override void OnMouseUp(MouseEventArgs e) {
    if (e.Button != MouseButtons.Left) return;
    dragging = false;
    currentPoint = e.Location;
    SetSelection(RectangleFromPoints(startPoint, currentPoint));
  }

  protected override void OnMouseDoubleClick(MouseEventArgs e) {
    CompleteCapture();
  }

  protected override void OnKeyDown(KeyEventArgs e) {
    if (e.KeyCode == Keys.Escape) {
      Cancelled = true;
      Close();
      return;
    }
    if (e.KeyCode == Keys.Enter) {
      CompleteCapture();
    }
  }

  private bool EnsureMinSelection() {
    return selection.Width >= 2 && selection.Height >= 2;
  }

  private void CompleteCapture() {
    if (!EnsureMinSelection()) return;
    string path = SaveCroppedImage(outputPath);
    if (path == null) return;
    Completed = true;
    Close();
  }

  private void CopyToClipboard() {
    if (!EnsureMinSelection()) return;
    string path = SaveCroppedImage(outputPath);
    if (path == null) return;
    try {
      using (Bitmap img = new Bitmap(path)) {
        Clipboard.SetImage(img);
      }
    } catch { }
    Copied = true;
    Completed = true;
    Close();
  }

  private void SaveToFile() {
    if (!EnsureMinSelection()) return;
    using (SaveFileDialog dlg = new SaveFileDialog()) {
      dlg.Filter = "PNG Image|*.png|JPEG Image|*.jpg|Bitmap|*.bmp";
      dlg.DefaultExt = "png";
      dlg.FileName = "screenshot-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".png";
      dlg.Title = "保存截图";
      if (dlg.ShowDialog() != DialogResult.OK) return;
      string path = SaveCroppedImage(dlg.FileName);
      if (path != null) {
        SavedPath = path;
      }
    }
    Completed = true;
    Close();
  }

  private string SaveCroppedImage(string path) {
    try {
      Directory.CreateDirectory(Path.GetDirectoryName(path));
      using (Bitmap crop = new Bitmap(selection.Width, selection.Height))
      using (Graphics cropGraphics = Graphics.FromImage(crop)) {
        cropGraphics.DrawImage(
          desktopBitmap,
          new Rectangle(0, 0, selection.Width, selection.Height),
          selection,
          GraphicsUnit.Pixel
        );
        crop.Save(path, ImageFormat.Png);
      }
      return path;
    } catch {
      return null;
    }
  }

  private void InvalidateToolbar() {
    if (selection.Width <= 0) return;
    int btnW = 90, btnH = 34, padding = 7;
    int totalW = btnW * 3 + padding * 4;
    int totalH = btnH + padding * 2;
    int barX = selection.Right - totalW;
    int barY = selection.Bottom + 8;
    if (barY + totalH > ClientSize.Height) barY = selection.Top - totalH - 8;
    if (barY < 0) barY = selection.Bottom - totalH - 4;
    Invalidate(new Rectangle(barX, barY, totalW, totalH), false);
  }

  private static Rectangle RectangleFromPoints(Point a, Point b) {
    int x = Math.Min(a.X, b.X);
    int y = Math.Min(a.Y, b.Y);
    int w = Math.Abs(a.X - b.X);
    int h = Math.Abs(a.Y - b.Y);
    return new Rectangle(x, y, w, h);
  }

  private void SetSelection(Rectangle nextSelection) {
    previousSelection = selection;
    selection = nextSelection;
    Invalidate(RepaintRectangle(previousSelection, selection), false);
  }

  private Rectangle RepaintRectangle(Rectangle a, Rectangle b) {
    Rectangle union;
    if (a.IsEmpty) union = b;
    else if (b.IsEmpty) union = a;
    else union = Rectangle.Union(a, b);

    int left = Math.Max(0, union.Left - 6);
    int top = Math.Max(0, union.Top - 50);
    int right = Math.Min(ClientSize.Width, union.Right + 6);
    int bottom = Math.Min(ClientSize.Height, union.Bottom + 56);
    return new Rectangle(left, top, Math.Max(1, right - left), Math.Max(1, bottom - top));
  }

  protected override void Dispose(bool disposing) {
    if (disposing) {
      desktopBitmap.Dispose();
    }
    base.Dispose(disposing);
  }
}
"@

try {
  [WoxScreenshotNative]::SetProcessDpiAwarenessContext([IntPtr](-4)) | Out-Null
} catch {
  try {
    [WoxScreenshotNative]::SetProcessDPIAware() | Out-Null
  } catch {
  }
}

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

$form = [WoxSnipOverlayForm]::new($screenBounds, $desktopBitmap, $OutputPath)
[System.Windows.Forms.Application]::Run($form)

if ($form.Completed) {
  $result = @{ status = "ok"; path = $OutputPath }
  if ($form.Copied) { $result["copied"] = $true }
  if ($form.SavedPath) { $result["path"] = $form.SavedPath }
  $form.Dispose()
  $result | ConvertTo-Json -Compress
  exit 0
}

$form.Dispose()

if ($form.Cancelled) {
  @{ status = "cancelled" } | ConvertTo-Json -Compress
  exit 2
}

@{ status = "cancelled" } | ConvertTo-Json -Compress
exit 2
