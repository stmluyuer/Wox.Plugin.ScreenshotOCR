# Screenshot OCR

Screenshot OCR 是一个面向 [Wox](https://github.com/Wox-launcher/Wox) 的截图 OCR 插件。支持截图、剪贴板图片和图片文件的文字识别，设计上与 LuxTranslate 通过 `tr` 查询前缀协同工作，典型流程为：

```text
截图 -> OCR 识别文字 -> LuxTranslate -> 目标语言
```

## 功能

- `ocr capture` 在 Windows 上打开类似 Snipaste 的区域截图窗口。
- `ocr clipboard` 读取剪贴板中的图片并执行 OCR。
- `ocr file <path>` 识别本地已有图片文件。
- `ocr translate` 截图、识别并发送结果到 LuxTranslate。
- 在线 OCR 服务抽象层，兼容传统 OCR API 和支持视觉的大语言模型。
- 离线 OCR：支持 Windows 本地 OCR、Snipping Tool OCR 和微信/QQ OCR。
- 本地部署脚本，方便快速部署到 `C:\Users\权辉\.wox\wox-user\plugins` 测试。

## OCR 服务

Screenshot OCR 支持以下 OCR 服务：

| 类别       | 服务                                                     |
| ---------- | -------------------------------------------------------- |
| 传统 OCR   | 百度、有道、火山、Bing/Azure Vision、Google Cloud Vision |
| 大语言模型 | OpenAI 兼容视觉模型                                      |
| 离线 OCR   | Windows App SDK 本地 OCR、Snipping Tool OCR、微信/QQ OCR |

说明：

- 百度使用通用基础 OCR 接口，需要 API Key 和 Secret Key。
- 有道使用开放 OCR API，需要 App Key 和 Secret Key。
- 火山使用带签名的 Volcengine 视觉 OCR 请求。
- Bing/Azure Vision 需要 Computer Vision endpoint 和 subscription key。
- Google Cloud Vision 使用基于 API Key 的 `images:annotate`。
- LLM 提供者使用 OpenAI-compatible `chat/completions` 接口传入图片。
- Windows App SDK 本地 OCR 通过 Windows Runtime OCR 离线运行，需要 Windows 10 或 Windows 11。
- Snipping Tool OCR 面向 Windows 10/11 声明。如果配置了兼容的本地桥接命令则使用该命令，否则回退到内置的 Windows 本地 OCR 助手。
- 微信/QQ OCR 需要安装微信或 QQ 提供原生识别路径。如果配置了兼容的本地桥接命令则使用该命令，否则回退到内置的 Windows 本地 OCR 助手。

## 安装

安装依赖并构建：

```bash
pnpm install
pnpm build
```

将构建好的插件部署到本地 Wox 插件目录：

```bash
pnpm run deploy
```

部署目标路径为：

```text
C:\Users\权辉\.wox\wox-user\plugins\76d3be7c-7f4d-4a9d-9f8a-1e8d4c6b5a2f@0.1.0
```

部署后重新加载 Wox 插件即可。

## 使用

| 命令                                            | 说明                              |
| ----------------------------------------------- | --------------------------------- |
| `ocr`                                           | 显示帮助                          |
| `ocr capture` / `ocr cap`                       | 截取屏幕区域并 OCR                |
| `ocr clipboard` / `ocr cb`                      | 识别剪贴板中的图片                |
| `ocr file <path>` / `ocr f <path>`              | 识别已有的图片文件                |
| `ocr translate` / `ocr tr`                      | 截取区域、OCR 并打开 LuxTranslate |
| `ocr clipboard translate` / `ocr cb tr`         | 识别剪贴板图片并打开 LuxTranslate |
| `ocr file <path> translate` / `ocr f <path> tr` | 识别图片文件并打开 LuxTranslate   |

推荐 Wox 查询快捷键配置：

- 查询内容：`ocr translate`
- 静默执行：开启

## 配置

- `默认 OCR 服务`：普通 OCR 命令使用的服务。
- `OCR 后自动翻译`：即使使用非翻译命令，也将 OCR 结果发送到翻译。
- `翻译查询前缀`：默认为 `tr`。
- `请求超时`：在线 OCR 调用和本地 OCR 桥接命令的超时时间。
- `OCR 服务配置`：在服务表格中配置凭证、Base URL、模型、Region 和本地桥接命令。

## 开发

```bash
pnpm install
pnpm test
pnpm build
pnpm run deploy
```

常用脚本：

- `pnpm test`：运行 Jest 测试。
- `pnpm build`：运行 lint、format、打包插件资源到 `dist/`。
- `pnpm run deploy`：将 `dist/` 复制到 Wox 用户插件目录。
- `pnpm run lint`：运行 ESLint。

## 工作流

1. 构建并部署插件。
2. 运行 `ocr capture`，验证 Windows 区域选择覆盖层。
3. 复制图片到剪贴板，运行 `ocr clipboard`。
4. 配置在线 OCR 服务。
5. 运行 `ocr translate` 或 `ocr clipboard translate` 将 OCR 文字交给 LuxTranslate。

## 截图

截图暂未补充。建议后续加入：

- Windows 截图覆盖层（背景变暗 + 高亮选中区域）。
- Wox 中的 OCR 识别结果。
- OCR 服务配置表格。
- 翻译联动结果。

## AI 协作声明

本项目由作者在 OpenAI Codex 协助下大量生成、重构和测试。作者负责需求设计、代码审阅、功能验证和发布决策。

## License

MIT License. See [LICENSE](LICENSE).

---

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

Screenshot OCR supports these providers:

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

| Command                                         | Description                                     |
| ----------------------------------------------- | ----------------------------------------------- |
| `ocr`                                           | Show help                                       |
| `ocr capture` / `ocr cap`                       | Capture a screen region and OCR it              |
| `ocr clipboard` / `ocr cb`                      | OCR the image currently in the clipboard        |
| `ocr file <path>` / `ocr f <path>`              | OCR an existing image file                      |
| `ocr translate` / `ocr tr`                      | Capture a region, OCR it, and open LuxTranslate |
| `ocr clipboard translate` / `ocr cb tr`         | OCR clipboard image and open LuxTranslate       |
| `ocr file <path> translate` / `ocr f <path> tr` | OCR a file and open LuxTranslate                |

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
