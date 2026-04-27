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
- 免配置 OCR：支持 Windows 本地 OCR、Snipping Tool OCR 和微信/QQ OCR。
- 大模型 OCR：支持 OpenAI 兼容视觉模型。
- 本地部署脚本，方便快速部署到 `C:\Users\权辉\.wox\wox-user\plugins` 测试。

## OCR 服务

Screenshot OCR 支持以下 OCR 服务：

| 类别       | 服务                                                     |
| ---------- | -------------------------------------------------------- |
| 免配置 OCR | Windows App SDK 本地 OCR、Snipping Tool OCR、微信/QQ OCR |
| 大模型 OCR | OpenAI 兼容视觉模型                                      |

说明：

- 免配置 OCR 不需要 API Key。
- Windows App SDK 本地 OCR 通过 Windows Runtime OCR 离线运行，需要 Windows 10 或 Windows 11。
- Snipping Tool OCR 面向 Windows 10/11 声明。如果配置了兼容的本地桥接命令则使用该命令，否则回退到内置的 Windows 本地 OCR 助手。
- 微信/QQ OCR 需要安装微信或 QQ 提供原生识别路径。如果配置了兼容的本地桥接命令则使用该命令，否则回退到内置的 Windows 本地 OCR 助手。
- 大模型 OCR 使用 OpenAI-compatible `chat/completions` 接口传入图片。

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

在任意可执行命令末尾追加 `--run`、`--go` 或 `!`，可以输入完成后立即执行，不需要按回车。例如 `ocr tr --run`、`ocr cb tr --run`。也可以在设置中开启 `完整命令自动执行`，让识别到的完整命令自动运行。

推荐 Wox 查询快捷键配置：

- 查询内容：`ocr translate`
- 静默执行：开启

## 配置

- `OCR 服务类型`：选择免配置 OCR 或大模型 OCR。
- `免配置 OCR 服务`：选择免配置模式下使用的本地服务。
- `OCR 后自动翻译`：即使使用非翻译命令，也将 OCR 结果发送到翻译。
- `完整命令自动执行`：输入完整 OCR 命令后立即执行，不需要按回车。
- `框选后直接识别（跳过确认）`：截图框选完成后直接开始 OCR，不显示确认工具栏。
- `翻译查询前缀`：默认为 `tr`。
- `请求超时`：大模型 OCR 调用和本地 OCR 桥接命令的超时时间。
- `大模型 OCR 配置`：在服务表格中配置 API Key、Base URL 和模型。

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
4. 如需使用大模型 OCR，配置大模型服务。
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
- No-configuration OCR providers for Windows local OCR, Snipping Tool OCR, and WeChat/QQ OCR.
- Large model OCR through an OpenAI-compatible vision model.
- Local deploy script for quick testing in `C:\Users\权辉\.wox\wox-user\plugins`.

## Providers

Screenshot OCR supports these providers:

| Category             | Providers                                                   |
| -------------------- | ----------------------------------------------------------- |
| No-configuration OCR | Windows App SDK local OCR, Snipping Tool OCR, WeChat/QQ OCR |
| Large model OCR      | OpenAI-compatible vision model                              |

Notes:

- No-configuration OCR providers do not require API keys.
- Windows App SDK local OCR runs offline through Windows Runtime OCR and requires Windows 10 or Windows 11.
- Snipping Tool OCR is declared for Windows 10/11. If a compatible native bridge command is configured, the plugin uses it; otherwise it falls back to the bundled Windows local OCR helper instead of failing.
- WeChat/QQ OCR requires WeChat or QQ to be installed for the native path. If a compatible native bridge command is configured, the plugin uses it; otherwise it falls back to the bundled Windows local OCR helper instead of failing.
- Large model OCR uses an OpenAI-compatible `chat/completions` endpoint with image input.

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

Append `--run`, `--go`, or `!` to any executable command to run it immediately after typing, without pressing Enter. Examples: `ocr tr --run`, `ocr cb tr --run`. You can also enable `Auto execute exact commands` in settings to auto-run recognized complete commands.

Recommended Wox query hotkey:

- Query: `ocr translate`
- Silent execution: enabled

## Configuration

- `OCR service type`: choose between no-configuration OCR and large model OCR.
- `No-configuration OCR provider`: choose the local provider used when no-configuration OCR is selected.
- `Auto translate after OCR`: sends OCR text to Translate even for non-translate commands.
- `Auto execute exact commands`: runs complete OCR commands immediately without pressing Enter.
- `Skip confirm after selection`: starts OCR after selecting a screenshot region without showing the confirmation toolbar.
- `Translate query prefix`: defaults to `tr`.
- `Request timeout`: timeout for large model OCR calls and local OCR bridge commands.
- `Large model OCR settings`: configure API key, base URL, and model in the provider table.

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
4. Configure a large model OCR provider if needed.
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
