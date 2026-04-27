using System.Text.Encodings.Web;
using System.Text.Json;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;
using Windows.Storage;

Console.OutputEncoding = System.Text.Encoding.UTF8;

try
{
    if (args.Length < 1 || string.IsNullOrWhiteSpace(args[0]))
    {
        throw new ArgumentException("Image path is required.");
    }

    var imagePath = Path.GetFullPath(args[0]);
    var file = await StorageFile.GetFileFromPathAsync(imagePath);
    await using var stream = await file.OpenStreamForReadAsync();
    var randomAccessStream = stream.AsRandomAccessStream();
    var decoder = await BitmapDecoder.CreateAsync(randomAccessStream);
    var bitmap = await decoder.GetSoftwareBitmapAsync();

    if (bitmap.BitmapPixelFormat != BitmapPixelFormat.Bgra8 ||
        bitmap.BitmapAlphaMode != BitmapAlphaMode.Premultiplied)
    {
        bitmap = SoftwareBitmap.Convert(
            bitmap,
            BitmapPixelFormat.Bgra8,
            BitmapAlphaMode.Premultiplied);
    }

    var engine = OcrEngine.TryCreateFromUserProfileLanguages();
    if (engine is null)
    {
        throw new InvalidOperationException("Windows OCR engine is not available for the current user language.");
    }

    var result = await engine.RecognizeAsync(bitmap);
    var lines = result.Lines
        .Select(line => line.Text?.Trim())
        .Where(line => !string.IsNullOrWhiteSpace(line))
        .ToArray();

    WriteJson(new
    {
        status = "ok",
        text = string.Join("\n", lines),
        lines,
    });
}
catch (Exception ex)
{
    WriteJson(new
    {
        status = "error",
        message = ex.Message,
    });
    Environment.ExitCode = 1;
}

static void WriteJson<T>(T value)
{
    Console.WriteLine(JsonSerializer.Serialize(value, new JsonSerializerOptions
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    }));
}
