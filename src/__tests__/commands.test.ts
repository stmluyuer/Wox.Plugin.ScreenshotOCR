import { buildTranslateQuery, parseCommand } from "../commands";

describe("parseCommand", () => {
  test("parses capture command", () => {
    expect(parseCommand("capture")).toEqual({
      kind: "image",
      source: "capture",
      translate: false,
    });
  });

  test("parses capture translate command", () => {
    expect(parseCommand("translate")).toEqual({
      kind: "image",
      source: "capture",
      translate: true,
    });
  });

  test("parses clipboard commands", () => {
    expect(parseCommand("clipboard")).toEqual({
      kind: "image",
      source: "clipboard",
      translate: false,
    });
    expect(parseCommand("clipboard translate")).toEqual({
      kind: "image",
      source: "clipboard",
      translate: true,
    });
  });

  test("parses file command with quoted path", () => {
    expect(parseCommand('file "C:\\Temp\\shot.png" translate')).toEqual({
      kind: "image",
      source: "file",
      translate: true,
      filePath: "C:\\Temp\\shot.png",
    });
  });

  test("builds translate query", () => {
    expect(buildTranslateQuery("tr", " hello ")).toBe("tr hello");
    expect(buildTranslateQuery("", "hello")).toBe("tr hello");
  });
});
