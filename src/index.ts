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
import { createOcrProvider, providerDisplayName, providerI18nKey } from "./ocr";
import {
  createClipboardImageProvider,
  createScreenshotProvider,
  PlatformUnsupportedError,
} from "./platform";
import { findProviderRow, loadSettings } from "./settings";
import {
  CapturedImage,
  ClipboardImageProvider,
  I18nError,
  OcrProviderName,
  PluginSettings,
} from "./types";

let api: PublicAPI;
let pluginDirectory = "";
let clipboardImageProvider: ClipboardImageProvider;
const runningAutoRuns = new Map<string, string>();

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

async function resolveI18nMessage(
  ctx: Context,
  key: string,
  params: Record<string, string>,
  fallback: string,
): Promise<string> {
  let msg = await t(ctx, key);
  if (msg === key) return fallback;
  for (const [k, v] of Object.entries(params)) {
    msg = msg.replace(`{${k}}`, v);
  }
  return msg;
}

async function buildHelpResult(ctx: Context): Promise<Result> {
  const cmd = await t(ctx, "help_preview_command");
  const desc = await t(ctx, "help_preview_description");
  const title = await t(ctx, "help_title");
  const settings = await loadSettings(api, ctx);
  const def = settings.defaultCommand;
  const actionName =
    def === "clipboard"
      ? await t(ctx, "action_clipboard")
      : def === "capture"
        ? await t(ctx, "action_capture")
        : await t(ctx, "action_translate_capture");
  return {
    Title: title,
    SubTitle: await t(ctx, "help_subtitle"),
    Icon: PLUGIN_ICON,
    Score: 100,
    Preview: {
      PreviewType: "markdown",
      PreviewData: [
        `# ${title}`,
        "",
        `| ${cmd} | ${desc} |`,
        "| --- | --- |",
        `| ocr capture / cap | ${await t(ctx, "help_preview_capture")} |`,
        `| ocr clipboard / cb | ${await t(ctx, "help_preview_clipboard")} |`,
        `| ocr file <path> / f <path> | ${await t(ctx, "help_preview_file")} |`,
        `| ocr translate / tr | ${await t(ctx, "help_preview_translate")} |`,
        `| ocr clipboard translate / cb tr | ${await t(ctx, "help_preview_clipboard_translate")} |`,
        `| ocr <command> --run | ${await t(ctx, "help_preview_auto_run")} |`,
      ].join("\n"),
      PreviewProperties: {},
    },
    Actions: [
      {
        Name: actionName,
        IsDefault: true,
        PreventHideAfterAction: true,
        Action: async (actionCtx: Context, actionContext: ActionContext) => {
          if (def === "clipboard") {
            await runWorkflow(actionCtx, actionContext, "clipboard", false);
          } else {
            await runWorkflow(
              actionCtx,
              actionContext,
              "capture",
              def === "translate",
            );
          }
        },
      },
    ],
  };
}

async function buildUnknownResult(
  ctx: Context,
  i18nKey: string,
  i18nParams: Record<string, string>,
  fallbackMessage: string,
): Promise<Result> {
  let message = await t(ctx, i18nKey);
  for (const [k, v] of Object.entries(i18nParams)) {
    message = message.replace(`{${k}}`, v);
  }
  return {
    Title: message || fallbackMessage,
    SubTitle: await t(ctx, "unknown_help_subtitle"),
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

async function buildAutoRunResult(
  ctx: Context,
  resultId: string,
  source: "capture" | "clipboard" | "file",
  translate: boolean,
  filePath?: string,
): Promise<Result> {
  const result = await buildImageCommandResult(
    ctx,
    source,
    translate,
    filePath,
  );
  return {
    ...result,
    Id: resultId,
    SubTitle: await t(ctx, "result_auto_running"),
  };
}

async function resolveImage(
  ctx: Context,
  source: "capture" | "clipboard" | "file",
  settings: PluginSettings,
  skipConfirm: boolean,
  filePath?: string,
): Promise<CapturedImage | null> {
  if (source === "file") {
    if (!filePath || !existsSync(filePath)) {
      throw new I18nError(
        "error_image_file_missing",
        { path: filePath || "" },
        `Image file does not exist: ${filePath || ""}`,
      );
    }
    return { path: filePath, source: "file" };
  }

  if (source === "capture") {
    return createScreenshotProvider(
      pluginDirectory,
      api,
      settings.screenshotCaptureMethod,
      settings.woxScreenshotHotkey,
    ).captureRegion(ctx, skipConfirm);
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
): Promise<{
  text: string;
  providerName: string;
  providerI18nKey: string;
  providerI18nParams: Record<string, string>;
}> {
  const providerRow = findProviderRow(settings, provider);
  const ocrProvider = createOcrProvider(provider);
  const result = await ocrProvider.recognize({
    imagePath: image.path,
    settings,
    providerRow,
    pluginDirectory,
  });
  const pName =
    result.providerName || providerDisplayName(provider, providerRow);
  let pKey = providerI18nKey(provider);
  const pParams: Record<string, string> = {};
  if (provider === "llm") {
    const match = pName.match(/\((.+)\)$/);
    if (match) {
      pKey = "provider_llm_with_model";
      pParams.model = match[1];
    }
  }
  return {
    text: result.text.trim(),
    providerName: pName,
    providerI18nKey: pKey,
    providerI18nParams: pParams,
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

    const image = await resolveImage(
      ctx,
      source,
      settings,
      settings.skipConfirmAfterSelection,
      filePath,
    );
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
    const displayName = await resolveI18nMessage(
      ctx,
      ocr.providerI18nKey,
      ocr.providerI18nParams,
      ocr.providerName,
    );
    if (ocr.text === "") {
      await updateStatus(
        ctx,
        actionContext.ResultId,
        await t(ctx, "result_empty"),
        displayName,
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
      SubTitle: `${displayName} | ${image.path}`,
      Icon: PLUGIN_ICON,
      Preview: {
        PreviewType: "markdown",
        PreviewData: [
          `# ${await t(ctx, "preview_text")}`,
          "",
          ocr.text,
          "",
          `## ${await t(ctx, "preview_provider")}`,
          displayName,
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
    const rawMessage = error instanceof Error ? error.message : String(error);
    await api.Log(
      ctx,
      "Error",
      error instanceof Error ? error.stack || error.message : String(error),
    );

    let title: string;
    let subtitle: string | undefined;

    if (error instanceof PlatformUnsupportedError) {
      title = await resolveI18nMessage(
        ctx,
        error.i18nKey,
        error.i18nParams,
        rawMessage,
      );
      subtitle = undefined;
    } else if (error instanceof I18nError) {
      title = await t(ctx, "result_failed");
      subtitle = await resolveI18nMessage(
        ctx,
        error.key,
        error.params,
        rawMessage,
      );
    } else {
      title = await t(ctx, "result_failed");
      subtitle = rawMessage;
    }

    await api.ShowApp(ctx);
    await api.UpdateResult(ctx, {
      Id: actionContext.ResultId,
      Title: title,
      SubTitle: subtitle,
      Icon: PLUGIN_ICON,
      Preview: {
        PreviewType: "markdown",
        PreviewData: `# ${title}\n\n${subtitle || rawMessage}`,
        PreviewProperties: {},
      },
    } as UpdatableResult);
  }
}

function autoRunKey(
  query: Query,
  source: "capture" | "clipboard" | "file",
  translate: boolean,
  filePath?: string,
): string {
  const rawSearch =
    query.Type === "selection" ? query.Selection.Text : query.Search;
  return [
    query.Type,
    query.TriggerKeyword,
    rawSearch.trim().toLowerCase(),
    source,
    translate ? "translate" : "ocr",
    filePath || "",
  ].join("|");
}

function queueAutoRun(
  ctx: Context,
  resultId: string,
  key: string,
  source: "capture" | "clipboard" | "file",
  translate: boolean,
  filePath?: string,
): void {
  if (runningAutoRuns.get(key)) {
    return;
  }

  runningAutoRuns.set(key, resultId);
  setTimeout(() => {
    void runWorkflow(
      ctx,
      {
        ResultId: resultId,
        ResultActionId: "auto_run",
        ContextData: {},
      },
      source,
      translate,
      filePath,
    ).finally(() => {
      setTimeout(() => {
        if (runningAutoRuns.get(key) === resultId) {
          runningAutoRuns.delete(key);
        }
      }, 1500);
    });
  }, 0);
}

export const plugin: Plugin = {
  init: async (ctx: Context, initParams: PluginInitParams) => {
    api = initParams.API;
    pluginDirectory = initParams.PluginDirectory;
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
      return [
        await buildUnknownResult(
          ctx,
          command.i18nKey,
          command.i18nParams,
          command.fallbackMessage,
        ),
      ];
    }
    const settings = await loadSettings(api, ctx);
    if (
      query.Type === "input" &&
      (command.autoRun || settings.autoExecuteCommands)
    ) {
      const key = autoRunKey(
        query,
        command.source,
        command.translate,
        command.filePath,
      );
      const resultId = runningAutoRuns.get(key) || `auto-run:${query.Id}`;
      queueAutoRun(
        ctx,
        resultId,
        key,
        command.source,
        command.translate,
        command.filePath,
      );
      return [
        await buildAutoRunResult(
          ctx,
          resultId,
          command.source,
          command.translate,
          command.filePath,
        ),
      ];
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
