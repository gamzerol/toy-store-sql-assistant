import express from "express";
import { generateAndRun, writeInsight, type PromptVersion } from "./assistant";
import type { RunQuery } from "./db";
import type { Llm } from "./llm";

const MAX_QUESTION_LENGTH = 500;

export function createApp(
  llm: Llm,
  runQuery: RunQuery,
  version: PromptVersion,
) {
  const app = express();
  app.use(express.json({ limit: "10kb" }));

  app.post("/api/ask", async (req, res) => {
    const question =
      typeof req.body?.question === "string" ? req.body.question.trim() : "";
    if (!question || question.length > MAX_QUESTION_LENGTH) {
      res
        .status(400)
        .json({
          error: `Enter a question of up to ${MAX_QUESTION_LENGTH} characters.`,
        });
      return;
    }

    try {
      const result = await generateAndRun(question, llm, runQuery, version);
      if (result.status !== "ok") {
        res.json(result);
        return;
      }
      const insight = await writeInsight(question, result, llm).catch(
        () => null,
      );
      res.json({ ...result, insight });
    } catch (error) {
      console.error(error);
      res
        .status(502)
        .json({
          error:
            "The AI service did not respond correctly. Try again in a minute.",
        });
    }
  });

  return app;
}
