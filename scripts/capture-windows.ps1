param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing @"
using System;
using System.Drawing;
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

  public bool Completed { get; private set; }
  public bool Cancelled { get; private set; }

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
    // Prevent the default erase-background pass. The whole frame is composed in OnPaint.
  }

  protected override void OnPaint(PaintEventArgs e) {
    Graphics g = e.Graphics;
    g.CompositingMode = System.Drawing.Drawing2D.CompositingMode.SourceOver;
    g.CompositingQuality = System.Drawing.Drawing2D.CompositingQuality.HighSpeed;
    g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.NearestNeighbor;
    g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.Half;

    g.DrawImageUnscaled(desktopBitmap, 0, 0);

    using (SolidBrush overlay = new SolidBrush(Color.FromArgb(150, 0, 0, 0))) {
      g.FillRectangle(overlay, this.ClientRectangle);
    }

    if (selection.Width > 0 && selection.Height > 0) {
      g.SetClip(selection);
      g.DrawImageUnscaled(desktopBitmap, 0, 0);
      g.ResetClip();

      using (Pen border = new Pen(Color.FromArgb(255, 74, 163, 255), 2)) {
        g.DrawRectangle(border, selection);
      }

      string label = selection.Width + " x " + selection.Height;
      using (Font font = new Font("Segoe UI", 10))
      using (SolidBrush labelBrush = new SolidBrush(Color.FromArgb(230, 15, 23, 42)))
      using (SolidBrush textBrush = new SolidBrush(Color.White)) {
        SizeF textSize = g.MeasureString(label, font);
        float labelX = selection.Left;
        float labelY = Math.Max(0, selection.Top - textSize.Height - 8);
        RectangleF labelRect = new RectangleF(labelX, labelY, textSize.Width + 12, textSize.Height + 6);
        g.FillRectangle(labelBrush, labelRect);
        g.DrawString(label, font, textBrush, labelRect.X + 6, labelRect.Y + 3);
      }
    }
  }

  protected override void OnMouseDown(MouseEventArgs e) {
    if (e.Button == MouseButtons.Right) {
      Cancelled = true;
      Close();
      return;
    }
    if (e.Button != MouseButtons.Left) {
      return;
    }
    dragging = true;
    startPoint = e.Location;
    currentPoint = e.Location;
    SetSelection(RectangleFromPoints(startPoint, currentPoint));
  }

  protected override void OnMouseMove(MouseEventArgs e) {
    if (!dragging) {
      return;
    }
    currentPoint = e.Location;
    SetSelection(RectangleFromPoints(startPoint, currentPoint));
  }

  protected override void OnMouseUp(MouseEventArgs e) {
    if (e.Button != MouseButtons.Left) {
      return;
    }
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

  private void CompleteCapture() {
    if (selection.Width < 2 || selection.Height < 2) {
      return;
    }

    Directory.CreateDirectory(Path.GetDirectoryName(outputPath));
    using (Bitmap crop = new Bitmap(selection.Width, selection.Height))
    using (Graphics cropGraphics = Graphics.FromImage(crop)) {
      cropGraphics.DrawImage(
        desktopBitmap,
        new Rectangle(0, 0, selection.Width, selection.Height),
        selection,
        GraphicsUnit.Pixel
      );
      crop.Save(outputPath, ImageFormat.Png);
    }

    Completed = true;
    Close();
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
    if (a.IsEmpty) {
      union = b;
    } else if (b.IsEmpty) {
      union = a;
    } else {
      union = Rectangle.Union(a, b);
    }

    int left = Math.Max(0, union.Left - 6);
    int top = Math.Max(0, union.Top - 38);
    int right = Math.Min(ClientSize.Width, union.Right + 6);
    int bottom = Math.Min(ClientSize.Height, union.Bottom + 6);
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
  # Per-monitor DPI awareness keeps WinForms coordinates aligned with physical
  # screen pixels on scaled displays such as 150%.
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
  $form.Dispose()
  @{ status = "ok"; path = $OutputPath } | ConvertTo-Json -Compress
  exit 0
}

$form.Dispose()

if ($form.Cancelled) {
  @{ status = "cancelled" } | ConvertTo-Json -Compress
  exit 2
}

@{ status = "cancelled" } | ConvertTo-Json -Compress
exit 2
