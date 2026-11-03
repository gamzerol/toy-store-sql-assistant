import { afterEach, describe, expect, it, vi } from "vitest";
import { createGemini } from "../server/llm";

afterEach(() => vi.unstubAllGlobals());

describe("createGemini", () => {
  it("sends the key in a header and returns the text", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{\"sql\":null}" }] } }] })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(createGemini("key", "model-x")("system", "user")).resolves.toBe("{\"sql\":null}");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/models/model-x:generateContent");
    expect(url).not.toContain("key");
    expect(init.headers).toMatchObject({ "x-goog-api-key": "key" });
    expect(JSON.parse(init.body as string).generationConfig.temperature).toBe(0);
  });

  it("reports an API error", async () => {
    vi.stubGlobal("fetch", async () => new Response("bad key", { status: 403 }));
    await expect(createGemini("key", "m")("s", "u")).rejects.toThrow(/403/);
  });
});
