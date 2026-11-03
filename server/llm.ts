export type Llm = (system: string, user: string) => Promise<string>;

const MAX_ATTEMPTS = 4;

export function createGemini(apiKey: string, model: string): Llm {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  return async (system, user) => {
    for (let attempt = 1; ; attempt++) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature: 0, responseMimeType: "application/json" },
        }),
      });

      if ((response.status === 429 || response.status >= 500) && attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 5000));
        continue;
      }
      if (!response.ok) {
        throw new Error(`Gemini returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
      }

      const data = (await response.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
      if (!text) throw new Error("Gemini returned an empty response.");
      return text;
    }
  };
}
