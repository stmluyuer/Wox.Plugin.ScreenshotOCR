import { buildTranslateQuery, parseCommand } from "../commands";

describe("parseCommand", () => {
  test("parses capture command", () => {
    expect(parseCommand("capture")).toEqual({
      kind: "image",
      source: "capture",
      translate: false,
    });
    expect(parseCommand("cap")).toEqual({
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
    expect(parseCommand("tr")).toEqual({
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
    expect(parseCommand("cb")).toEqual({
      kind: "image",
      source: "clipboard",
      translate: false,
    });
  });

  test("parses clipboard translate command combinations", () => {
    const expected = { kind: "image", source: "clipboard", translate: true };

    expect(parseCommand("clipboard translate")).toEqual(expected);
    expect(parseCommand("translate clipboard")).toEqual(expected);
    expect(parseCommand("clipboard tr")).toEqual(expected);
    expect(parseCommand("tr clipboard")).toEqual(expected);
    expect(parseCommand("cb translate")).toEqual(expected);
    expect(parseCommand("translate cb")).toEqual(expected);
    expect(parseCommand("cb tr")).toEqual(expected);
    expect(parseCommand("tr cb")).toEqual(expected);
  });

  test("parses file command", () => {
    expect(parseCommand('file "C:\\Temp\\shot.png"')).toEqual({
      kind: "image",
      source: "file",
      translate: false,
      filePath: "C:\\Temp\\shot.png",
    });
    expect(parseCommand('f "C:\\Temp\\shot.png"')).toEqual({
      kind: "image",
      source: "file",
      translate: false,
      filePath: "C:\\Temp\\shot.png",
    });
  });

  test("parses file with translate command variants", () => {
    const expected = {
      kind: "image",
      source: "file",
      translate: true,
      filePath: "C:\\Temp\\shot.png",
    };

    expect(parseCommand('file "C:\\Temp\\shot.png" translate')).toEqual(
      expected,
    );
    expect(parseCommand('file "C:\\Temp\\shot.png" tr')).toEqual(expected);
    expect(parseCommand('f "C:\\Temp\\shot.png" translate')).toEqual(expected);
    expect(parseCommand('f "C:\\Temp\\shot.png" tr')).toEqual(expected);
  });

  test("handles file path without quotes", () => {
    const r1 = parseCommand("file /tmp/img.png tr");
    expect(r1.kind).toBe("image");
    if (r1.kind === "image") expect(r1.filePath).toBe("/tmp/img.png");

    const r2 = parseCommand("f /tmp/img.png");
    expect(r2.kind).toBe("image");
    if (r2.kind === "image") expect(r2.filePath).toBe("/tmp/img.png");
  });

  test("builds translate query", () => {
    expect(buildTranslateQuery("tr", " hello ")).toBe("tr hello");
    expect(buildTranslateQuery("", "hello")).toBe("tr hello");
  });
});
