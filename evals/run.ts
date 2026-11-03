import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import pg from "pg";
import { generateAndRun, type AskResult, type PromptVersion } from "../server/assistant";
import { createRunQuery, type RunQuery } from "../server/db";
import { createGemini, type Llm } from "../server/llm";
import { checkSql } from "../server/sqlGuard";
import { resultsMatch } from "./compare";
import { QUESTIONS, type EvalQuestion } from "./questions";

export type Outcome = "correct" | "wrong_result" | "wrongly_refused" | "should_refuse" | "sql_error" | "blocked" | "llm_error";

export type EvalRow = { id: number; category: string; question: string; outcome: Outcome; repaired: boolean; sql: string; detail: string };

export async function evaluate(item: EvalQuestion, llm: Llm, runQuery: RunQuery, version: PromptVersion): Promise<EvalRow> {
  const base = { id: item.id, category: item.category, question: item.question };
  let result: AskResult;
  try {
    result = await generateAndRun(item.question, llm, runQuery, version);
  } catch (error) {
    return { ...base, outcome: "llm_error", repaired: false, sql: "", detail: (error as Error).message };
  }

  if (result.status === "cannot_answer") {
    const outcome = item.gold === null ? "correct" : "wrongly_refused";
    return { ...base, outcome, repaired: false, sql: "", detail: result.reason };
  }
  if (result.status !== "ok") {
    return { ...base, outcome: result.status, repaired: result.repaired, sql: result.sql, detail: result.reason };
  }
  if (item.gold === null) {
    return { ...base, outcome: "should_refuse", repaired: result.repaired, sql: result.sql, detail: item.trap };
  }
  const correct = resultsMatch(await runQuery(item.gold), result);
  return {
    ...base,
    outcome: correct ? "correct" : "wrong_result",
    repaired: result.repaired,
    sql: result.sql,
    detail: correct ? "" : item.trap,
  };
}

export function summarize(version: string, model: string, rows: EvalRow[]): string {
  const correct = (list: EvalRow[]) => list.filter((row) => row.outcome === "correct").length;
  const percent = (part: number, whole: number) => `${Math.round((100 * part) / whole)}%`;
  const categories = [...new Set(rows.map((row) => row.category))];
  const outcomes = [...new Set(rows.map((row) => row.outcome))];

  return [
    `# Eval results: prompt ${version}`,
    "",
    `Model: ${model}`,
    "",
    `**${correct(rows)} of ${rows.length} correct (${percent(correct(rows), rows.length)})**`,
    "",
    "| Category | Correct | Total |",
    "|---|---|---|",
    ...categories.map((category) => {
      const list = rows.filter((row) => row.category === category);
      return `| ${category} | ${correct(list)} | ${list.length} |`;
    }),
    "",
    "| Outcome | Count |",
    "|---|---|",
    ...outcomes.map((outcome) => `| ${outcome} | ${rows.filter((row) => row.outcome === outcome).length} |`),
    "",
    "## Not correct",
    "",
    ...rows
      .filter((row) => row.outcome !== "correct")
      .flatMap((row) => [`### Q${row.id} (${row.outcome}): ${row.question}`, "", row.detail, "", "```sql", row.sql, "```", ""]),
  ].join("\n");
}

async function checkGold(runQuery: RunQuery) {
  let failed = 0;
  for (const item of QUESTIONS) {
    if (item.gold === null) continue;
    const guard = await checkSql(item.gold);
    try {
      if (!guard.ok) throw new Error(guard.reason);
      const result = await runQuery(guard.sql);
      console.log(`ok   Q${item.id}: ${result.rows.length} rows`);
    } catch (error) {
      failed++;
      console.log(`FAIL Q${item.id}: ${(error as Error).message}`);
    }
  }
  if (failed) process.exitCode = 1;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL in .env.");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const runQuery = createRunQuery(pool);

  if (process.argv.includes("--check")) {
    await checkGold(runQuery);
    await pool.end();
    return;
  }

  if (!process.env.GEMINI_API_KEY) throw new Error("Set GEMINI_API_KEY in .env.");
  const flag = process.argv.indexOf("--prompt");
  const version: PromptVersion = flag > -1 && process.argv[flag + 1] === "v1" ? "v1" : "v2";
  const model = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
  const llm = createGemini(process.env.GEMINI_API_KEY, model);
  const delay = Number(process.env.EVAL_DELAY_MS ?? 5000);

  const rows: EvalRow[] = [];
  for (const item of QUESTIONS) {
    const row = await evaluate(item, llm, runQuery, version);
    rows.push(row);
    console.log(`Q${row.id}: ${row.outcome}`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  mkdirSync(new URL("./results/", import.meta.url), { recursive: true });
  writeFileSync(new URL(`./results/${version}.json`, import.meta.url), JSON.stringify(rows, null, 2));
  writeFileSync(new URL(`./results/${version}.md`, import.meta.url), summarize(version, model, rows));
  console.log(`\nSaved evals/results/${version}.md`);
  await pool.end();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
