# Screenshot OCR

[中文](README.md) | [English](README.en.md)

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
- 本地部署脚本，方便快速部署到 `%USERPROFILE%\.wox\wox-user\plugins` 测试。

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

仓库已按 Wox Store 打包流程准备。发布前请在 GitHub Release 上传生成的 `.wox` 资产，然后再提交 Wox Store 条目。

```bash
git clone https://github.com/stmluyuer/Wox.Plugin.ScreenshotOCR.git
cd Wox.Plugin.ScreenshotOCR
pnpm install
pnpm run build
pnpm run package
```

构建产物会生成在 `dist/`。`pnpm run package` 会生成 `wox.plugin.screenshotocr.wox`，用于 GitHub Releases 和 Wox Store 下载地址。

本地测试时可以运行 `pnpm run deploy`，将 `dist/` 部署到当前用户的 Wox 插件目录。

```bash
pnpm run deploy
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
pnpm run build
pnpm run deploy
pnpm run package
```

常用脚本：

- `pnpm test`：运行 Jest 测试。
- `pnpm run build`：运行 lint、format、编译 Windows OCR 助手，并打包插件资源到 `dist/`。
- `pnpm run deploy`：将 `dist/` 复制到 Wox 用户插件目录。
- `pnpm run package`：生成 `wox.plugin.screenshotocr.wox`。
- `pnpm run lint`：运行 ESLint。

## 工作流

1. 构建并部署插件。
2. 运行 `ocr capture`，验证 Windows 区域选择覆盖层。
3. 复制图片到剪贴板，运行 `ocr clipboard`。
4. 如需使用大模型 OCR，配置大模型服务。
5. 运行 `ocr translate` 或 `ocr clipboard translate` 将 OCR 文字交给 LuxTranslate。

## 截图

- **指令帮助页面**：`ocr` 命令展示的完整帮助信息。

  ![命令帮助](screenshots/command-help.jpg)

- **插件配置页面**：Wox 插件设置面板。

  ![插件配置](screenshots/settings.jpg)

- **大模型 OCR 配置**：OpenAI 兼容视觉模型的服务配置。

  ![模型配置](screenshots/model-config.jpg)

## AI 协作声明

本项目由作者在 OpenAI Codex 协助下大量生成、重构和测试。作者负责需求设计、代码审阅、功能验证和发布决策。

## License

MIT License. See [LICENSE](LICENSE).
