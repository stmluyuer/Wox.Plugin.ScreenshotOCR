# Screenshot OCR

Screenshot OCR is a [Wox](https://github.com/Wox-launcher/Wox) plugin for recognizing text from screenshots, clipboard images, or image files. It is designed to work with LuxTranslate through the `tr` query prefix, so the common flow is:

```text
screenshot -> OCR text -> LuxTranslate -> target language
```

## Features

- `ocr capture` opens a Snipaste-like region capture window on Windows.
- `ocr clipboard` reads an image from the clipboard and runs OCR.
- `ocr file <path>` recognizes an existing local image.
- `ocr translate` captures, recognizes, and sends the result to LuxTranslate.
- Online OCR provider abstraction for traditional OCR APIs and vision-capable large language models.
- Offline OCR providers for Windows local OCR, Snipping Tool OCR, and WeChat/QQ OCR.
- Local deploy script for quick testing in `C:\Users\权辉\.wox\wox-user\plugins`.

## Providers

Screenshot OCR supports these provider slots:

| Category              | Providers                                                      |
| --------------------- | -------------------------------------------------------------- |
| Traditional OCR       | Baidu, Youdao, Volcano, Bing/Azure Vision, Google Cloud Vision |
| Large language models | OpenAI-compatible vision model                                 |
| Offline OCR           | Windows App SDK local OCR, Snipping Tool OCR, WeChat/QQ OCR    |

Notes:

- Baidu uses the general basic OCR endpoint with API key and secret key.
- Youdao uses the open OCR API with app key and secret key.
- Volcano uses a signed Volcengine visual OCR request.
- Bing/Azure Vision requires a Computer Vision endpoint and subscription key.
- Google Cloud Vision uses API-key based `images:annotate`.
- The LLM provider uses OpenAI-compatible `chat/completions` with image input.
- Windows App SDK local OCR runs offline through Windows Runtime OCR and requires Windows 10 or Windows 11.
- Snipping Tool OCR is declared for Windows 10/11. If a compatible native bridge command is configured, the plugin uses it; otherwise it falls back to the bundled Windows local OCR helper instead of failing.
- WeChat/QQ OCR requires WeChat or QQ to be installed for the native path. If a compatible native bridge command is configured, the plugin uses it; otherwise it falls back to the bundled Windows local OCR helper instead of failing.

## Installation

Install dependencies and build:

```bash
pnpm install
pnpm build
```

Deploy the built plugin to the local Wox plugin directory:

```bash
pnpm run deploy
```

The deployment target is:

```text
C:\Users\权辉\.wox\wox-user\plugins\76d3be7c-7f4d-4a9d-9f8a-1e8d4c6b5a2f@0.1.0
```

Reload Wox plugins after deployment.

## Usage

| Command                     | Description                                     |
| --------------------------- | ----------------------------------------------- |
| `ocr`                       | Show help                                       |
| `ocr capture`               | Capture a screen region and OCR it              |
| `ocr clipboard`             | OCR the image currently in the clipboard        |
| `ocr file <path>`           | OCR an existing image file                      |
| `ocr translate`             | Capture a region, OCR it, and open LuxTranslate |
| `ocr clipboard translate`   | OCR clipboard image and open LuxTranslate       |
| `ocr file <path> translate` | OCR a file and open LuxTranslate                |

Recommended Wox query hotkey:

- Query: `ocr translate`
- Silent execution: enabled

## Configuration

- `Default OCR provider`: provider used by normal OCR commands.
- `Auto translate after OCR`: sends OCR text to Translate even for non-translate commands.
- `Translate query prefix`: defaults to `tr`.
- `Request timeout`: timeout for online OCR calls and local OCR bridge commands.
- `OCR provider settings`: configure credentials, base URLs, models, regions, and local bridge commands in the provider table.

## Development

```bash
pnpm install
pnpm test
pnpm build
pnpm run deploy
```

Useful scripts:

- `pnpm test`: run Jest tests.
- `pnpm build`: lint, format, bundle, and copy plugin assets into `dist/`.
- `pnpm run deploy`: copy `dist/` into the Wox user plugin directory.
- `pnpm run lint`: run ESLint.

## Workflow

1. Build and deploy the plugin.
2. Run `ocr capture` and verify the Windows selection overlay.
3. Copy an image to the clipboard and run `ocr clipboard`.
4. Configure an online OCR provider.
5. Run `ocr translate` or `ocr clipboard translate` to hand the OCR text to LuxTranslate.

## Screenshots

Screenshots are not included yet. Recommended additions:

- Windows capture overlay with dimmed background and highlighted selection.
- OCR result in Wox.
- OCR provider settings table.
- Translate handoff result.

## AI Assistance Disclosure

This project was substantially generated, refactored, and tested with assistance from OpenAI Codex. The author is responsible for requirements, code review, validation, and release decisions.

## License

MIT License. See [LICENSE](LICENSE).
