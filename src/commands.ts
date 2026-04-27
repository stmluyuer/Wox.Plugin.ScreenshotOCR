import { ImageSource } from "./types";

export type OcrCommand =
  | { kind: "help" }
  | {
      kind: "image";
      source: ImageSource;
      translate: boolean;
      filePath?: string;
    }
  | {
      kind: "unknown";
      i18nKey: string;
      i18nParams: Record<string, string>;
      fallbackMessage: string;
    };

function stripOuterQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseCommand(search: string): OcrCommand {
  const trimmed = search.trim();
  if (trimmed === "" || trimmed === "help") {
    return { kind: "help" };
  }

  const lower = trimmed.toLowerCase();
  if (lower === "capture") {
    return { kind: "image", source: "capture", translate: false };
  }
  if (lower === "translate") {
    return { kind: "image", source: "capture", translate: true };
  }
  if (lower === "clipboard") {
    return { kind: "image", source: "clipboard", translate: false };
  }
  if (lower === "clipboard translate" || lower === "translate clipboard") {
    return { kind: "image", source: "clipboard", translate: true };
  }
  if (lower.startsWith("file ")) {
    let rest = trimmed.slice(5).trim();
    let translate = false;
    if (/\s+translate$/i.test(rest)) {
      translate = true;
      rest = rest.replace(/\s+translate$/i, "").trim();
    }
    const filePath = stripOuterQuotes(rest);
    if (filePath === "") {
      return {
        kind: "unknown",
        i18nKey: "error_image_file_path_empty",
        i18nParams: {},
        fallbackMessage: "Image file path is empty.",
      };
    }
    return { kind: "image", source: "file", translate, filePath };
  }

  return {
    kind: "unknown",
    i18nKey: "error_unknown_command",
    i18nParams: { command: trimmed },
    fallbackMessage: `Unknown OCR command: ${trimmed}`,
  };
}

export function buildTranslateQuery(prefix: string, text: string): string {
  return `${prefix.trim() || "tr"} ${text.trim()}`;
}
