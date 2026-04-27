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

function isTranslateSuffix(word: string): boolean {
  const w = word.toLowerCase();
  return w === "translate" || w === "tr";
}

export function parseCommand(search: string): OcrCommand {
  const trimmed = search.trim();
  if (trimmed === "" || trimmed === "help") {
    return { kind: "help" };
  }

  const lower = trimmed.toLowerCase();

  // capture / cap
  if (lower === "capture" || lower === "cap") {
    return { kind: "image", source: "capture", translate: false };
  }

  // translate / tr (capture + translate)
  if (lower === "translate" || lower === "tr") {
    return { kind: "image", source: "capture", translate: true };
  }

  // clipboard / cb
  if (lower === "clipboard" || lower === "cb") {
    return { kind: "image", source: "clipboard", translate: false };
  }

  // clipboard translate / cb tr / ... (all combinations)
  if (
    lower === "clipboard translate" ||
    lower === "translate clipboard" ||
    lower === "clipboard tr" ||
    lower === "tr clipboard" ||
    lower === "cb translate" ||
    lower === "translate cb" ||
    lower === "cb tr" ||
    lower === "tr cb"
  ) {
    return { kind: "image", source: "clipboard", translate: true };
  }

  // file <path> [translate|tr] / f <path> [translate|tr]
  const fileMatch = lower.match(/^(file|f)\s+(.+)/);
  if (fileMatch) {
    let rest = trimmed.slice(fileMatch[1].length + 1).trim();
    let translate = false;
    const words = rest.split(/\s+/);
    if (words.length > 0 && isTranslateSuffix(words[words.length - 1])) {
      translate = true;
      rest = words.slice(0, -1).join(" ");
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
