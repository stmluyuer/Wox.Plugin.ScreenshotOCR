import { WoxScreenshotProvider } from "../platform";

describe("WoxScreenshotProvider", () => {
  test("uses built-in selector when skip-confirm is requested", async () => {
    const api = {
      HideApp: jest.fn(async () => undefined),
      Log: jest.fn(async () => undefined),
      Screenshot: jest.fn(async () => ({
        Success: true,
        ScreenshotPath: "should-not-be-used.png",
        ErrMsg: "",
      })),
    };
    const provider = new WoxScreenshotProvider({
      pluginDirectory: __dirname,
      api: api as never,
    });
    const fallbackResult = { path: "capture.png", source: "capture" as const };
    (
      provider as unknown as {
        fallbackProvider: {
          captureRegion: jest.Mock;
        };
      }
    ).fallbackProvider.captureRegion = jest.fn(async () => fallbackResult);

    const result = await provider.captureRegion({} as never, "wox", true);

    expect(result).toBe(fallbackResult);
    expect(api.Screenshot).not.toHaveBeenCalled();
    expect(api.HideApp).toHaveBeenCalledTimes(1);
    expect(api.Log).toHaveBeenCalledWith(
      {},
      "Info",
      expect.stringContaining("skip-confirm"),
    );
  });
});
