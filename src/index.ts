import {
  ActionContext,
  Context,
  Plugin,
  PluginInitParams,
  PublicAPI,
  Query,
  Result,
  UpdatableResult,
  WoxImage,
} from "@wox-launcher/wox-plugin";
import { existsSync } from "node:fs";
import { buildTranslateQuery, parseCommand } from "./commands";
import { createOcrProvider, providerDisplayName } from "./ocr";
import {
  createClipboardImageProvider,
  createScreenshotProvider,
  PlatformUnsupportedError,
} from "./platform";
import { findProviderRow, loadSettings } from "./settings";
import {
  CapturedImage,
  ClipboardImageProvider,
  OcrProviderName,
  PluginSettings,
  ScreenshotProvider,
} from "./types";

let api: PublicAPI;
let pluginDirectory = "";
let screenshotProvider: ScreenshotProvider;
let clipboardImageProvider: ClipboardImageProvider;

const PLUGIN_ICON: WoxImage = {
  ImageType: "relative",
  ImageData: "images/app.svg",
};

async function t(ctx: Context, key: string): Promise<string> {
  try {
    const value = await api.GetTranslation(ctx, key);
    return value.trim() === "" ? key : value;
  } catch {
    return key;
  }
}

async function buildHelpResult(ctx: Context): Promise<Result> {
  return {
    Title: await t(ctx, "help_title"),
    SubTitle: await t(ctx, "help_subtitle"),
    Icon: PLUGIN_ICON,
    Score: 100,
    Preview: {
      PreviewType: "markdown",
      PreviewData: [
        "# Screenshot OCR",
        "",
        "| Command | Description |",
        "| --- | --- |",
        "| `ocr capture` | Capture a region and recognize text |",
        "| `ocr clipboard` | Recognize the image currently in the clipboard |",
        "| `ocr file <path>` | Recognize an existing image file |",
        "| `ocr translate` | Capture, recognize, and send text to Translate |",
        "| `ocr clipboard translate` | Recognize clipboard image and send text to Translate |",
      ].join("\n"),
      PreviewProperties: {},
    },
  };
}

function buildUnknownResult(message: string): Result {
  return {
    Title: message,
    SubTitle: "Type ocr for help.",
    Icon: PLUGIN_ICON,
    Score: 100,
  };
}

async function buildImageCommandResult(
  ctx: Context,
  source: "capture" | "clipboard" | "file",
  translate: boolean,
  filePath?: string,
): Promise<Result> {
  const title =
    source === "capture"
      ? translate
        ? await t(ctx, "action_translate_capture")
        : await t(ctx, "action_capture")
      : source === "clipboard"
        ? translate
          ? await t(ctx, "action_translate_clipboard")
          : await t(ctx, "action_clipboard")
        : await t(ctx, "action_file");

  return {
    Title: title,
    SubTitle: await t(ctx, "result_ready"),
    Icon: PLUGIN_ICON,
    Score: 100,
    Preview: {
      PreviewType: "markdown",
      PreviewData: filePath ? `# ${title}\n\n${filePath}` : `# ${title}`,
      PreviewProperties: {},
    },
    Actions: [
      {
        Name: title,
        IsDefault: true,
        PreventHideAfterAction: true,
        Action: async (actionCtx: Context, actionContext: ActionContext) => {
          await runWorkflow(
            actionCtx,
            actionContext,
            source,
            translate,
            filePath,
          );
        },
      },
    ],
  };
}

async function resolveImage(
  ctx: Context,
  source: "capture" | "clipboard" | "file",
  filePath?: string,
): Promise<CapturedImage | null> {
  if (source === "file") {
    if (!filePath || !existsSync(filePath)) {
      throw new Error(`Image file does not exist: ${filePath || ""}`);
    }
    return { path: filePath, source: "file" };
  }

  if (source === "capture") {
    await api.HideApp(ctx);
    return screenshotProvider.captureRegion();
  }

  return clipboardImageProvider.readImage();
}

async function updateStatus(
  ctx: Context,
  resultId: string,
  title: string,
  subtitle?: string,
): Promise<void> {
  await api.UpdateResult(ctx, {
    Id: resultId,
    Title: title,
    SubTitle: subtitle,
    Icon: PLUGIN_ICON,
  } as UpdatableResult);
}

async function recognizeImage(
  settings: PluginSettings,
  provider: OcrProviderName,
  image: CapturedImage,
): Promise<{ text: string; providerName: string }> {
  const providerRow = findProviderRow(settings, provider);
  const ocrProvider = createOcrProvider(provider);
  const result = await ocrProvider.recognize({
    imagePath: image.path,
    settings,
    providerRow,
  });
  return {
    text: result.text.trim(),
    providerName:
      result.providerName || providerDisplayName(provider, providerRow),
  };
}

async function runWorkflow(
  ctx: Context,
  actionContext: ActionContext,
  source: "capture" | "clipboard" | "file",
  translate: boolean,
  filePath?: string,
): Promise<void> {
  const settings = await loadSettings(api, ctx);
  const shouldTranslate = translate || settings.autoTranslateAfterOcr;
  const provider = settings.defaultOcrProvider;

  try {
    await updateStatus(
      ctx,
      actionContext.ResultId,
      source === "capture"
        ? await t(ctx, "result_capture_processing")
        : source === "clipboard"
          ? await t(ctx, "result_clipboard_processing")
          : await t(ctx, "result_processing"),
    );

    const image = await resolveImage(ctx, source, filePath);
    if (!image) {
      const title =
        source === "clipboard"
          ? await t(ctx, "result_no_clipboard_image")
          : await t(ctx, "result_cancelled");
      await updateStatus(ctx, actionContext.ResultId, title);
      await api.ShowApp(ctx);
      return;
    }

    await updateStatus(
      ctx,
      actionContext.ResultId,
      await t(ctx, "result_processing"),
      image.path,
    );
    const ocr = await recognizeImage(settings, provider, image);
    if (ocr.text === "") {
      await updateStatus(
        ctx,
        actionContext.ResultId,
        await t(ctx, "result_empty"),
        ocr.providerName,
      );
      await api.ShowApp(ctx);
      return;
    }

    if (shouldTranslate) {
      await api.ChangeQuery(ctx, {
        QueryType: "input",
        QueryText: buildTranslateQuery(settings.translateQueryPrefix, ocr.text),
      });
      await api.ShowApp(ctx);
      return;
    }

    await api.ShowApp(ctx);
    await api.UpdateResult(ctx, {
      Id: actionContext.ResultId,
      Title: ocr.text,
      SubTitle: `${ocr.providerName} | ${image.path}`,
      Icon: PLUGIN_ICON,
      Preview: {
        PreviewType: "markdown",
        PreviewData: [
          `# ${await t(ctx, "preview_text")}`,
          "",
          ocr.text,
          "",
          `## ${await t(ctx, "preview_provider")}`,
          ocr.providerName,
          "",
          `## ${await t(ctx, "preview_source_image")}`,
          image.path,
        ].join("\n"),
        PreviewProperties: {},
      },
      Actions: [
        {
          Name: await t(ctx, "action_copy_text"),
          IsDefault: true,
          Action: async (copyCtx) => {
            await api.Copy(copyCtx, { type: "text", text: ocr.text });
          },
        },
        {
          Name: await t(ctx, "action_translate_text"),
          Action: async (translateCtx) => {
            await api.ChangeQuery(translateCtx, {
              QueryType: "input",
              QueryText: buildTranslateQuery(
                settings.translateQueryPrefix,
                ocr.text,
              ),
            });
          },
        },
      ],
    } as UpdatableResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await api.Log(
      ctx,
      "Error",
      error instanceof Error ? error.stack || error.message : String(error),
    );
    await api.ShowApp(ctx);
    await api.UpdateResult(ctx, {
      Id: actionContext.ResultId,
      Title:
        error instanceof PlatformUnsupportedError
          ? message
          : await t(ctx, "result_failed"),
      SubTitle: error instanceof PlatformUnsupportedError ? undefined : message,
      Icon: PLUGIN_ICON,
      Preview: {
        PreviewType: "markdown",
        PreviewData: `# ${await t(ctx, "result_failed")}\n\n${message}`,
        PreviewProperties: {},
      },
    } as UpdatableResult);
  }
}

export const plugin: Plugin = {
  init: async (ctx: Context, initParams: PluginInitParams) => {
    api = initParams.API;
    pluginDirectory = initParams.PluginDirectory;
    screenshotProvider = createScreenshotProvider(pluginDirectory);
    clipboardImageProvider = createClipboardImageProvider(pluginDirectory);
    await api.Log(
      ctx,
      "Info",
      `Screenshot OCR initialized from ${pluginDirectory}`,
    );
  },

  query: async (ctx: Context, query: Query): Promise<Result[]> => {
    const search =
      query.Type === "selection" ? query.Selection.Text : query.Search;
    const command = parseCommand(search);
    if (command.kind === "help") {
      return [await buildHelpResult(ctx)];
    }
    if (command.kind === "unknown") {
      return [buildUnknownResult(command.message)];
    }
    return [
      await buildImageCommandResult(
        ctx,
        command.source,
        command.translate,
        command.filePath,
      ),
    ];
  },
};
