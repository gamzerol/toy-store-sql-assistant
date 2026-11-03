import "dotenv/config";
import pg from "pg";
import { createApp } from "./app";
import { createRunQuery } from "./db";
import { createGemini } from "./llm";
import type { PromptVersion } from "./assistant";

const { DATABASE_URL, GEMINI_API_KEY, GEMINI_MODEL, PORT, PROMPT_VERSION } = process.env;
if (!DATABASE_URL || !GEMINI_API_KEY) {
  throw new Error("Set DATABASE_URL and GEMINI_API_KEY in .env (see .env.example).");
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const llm = createGemini(GEMINI_API_KEY, GEMINI_MODEL ?? "gemini-3.5-flash-lite");
const version = (PROMPT_VERSION === "v1" ? "v1" : "v2") as PromptVersion;

const port = Number(PORT ?? 3001);
createApp(llm, createRunQuery(pool), version).listen(port, () => {
  console.log(`API running on http://localhost:${port} (prompt ${version})`);
});
