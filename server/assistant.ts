import { readFileSync } from "node:fs";
import type { RunQuery, QueryResult } from "./db";
import type { Llm } from "./llm";
import { checkSql } from "./sqlGuard";

export type PromptVersion = "v1" | "v2";

const read = (name: string) =>
  readFileSync(new URL(`../context/${name}`, import.meta.url), "utf8");
const SCHEMA = read("schema.sql");
const RULES = read("business_rules.md");

export function sqlSystemPrompt(version: PromptVersion): string {
  return `You write one PostgreSQL SELECT query for an analyst working on an online toy store.

Return JSON only, in this shape:
{"sql": "the query, or null", "assumptions": ["short notes on choices the question left open"], "cannot_answer": "why the data cannot answer this, or null"}

Rules:
- Use only the tables below. All of them are in the toystore schema.
- If the data cannot answer the question, set sql to null and explain in cannot_answer. Do not use a proxy without saying so.
- Use clear column aliases. Do not add a semicolon.

Schema:
${SCHEMA}${version === "v2" ? `\n${RULES}` : ""}`;
}

type Draft = { sql: string | null; assumptions: string[]; cannot_answer: string | null };

export type AskResult =
  | { status: "cannot_answer"; reason: string }
  | { status: "blocked" | "sql_error"; sql: string; reason: string; assumptions: string[]; repaired: boolean }
  | ({ status: "ok"; sql: string; assumptions: string[]; repaired: boolean } & QueryResult);

function parseDraft(text: string): Draft {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const draft = JSON.parse(cleaned) as Partial<Draft>;
  return {
    sql: typeof draft.sql === "string" ? draft.sql : null,
    assumptions: Array.isArray(draft.assumptions) ? draft.assumptions.map(String) : [],
    cannot_answer: typeof draft.cannot_answer === "string" ? draft.cannot_answer : null,
  };
}

export async function generateAndRun(
  question: string,
  llm: Llm,
  runQuery: RunQuery,
  version: PromptVersion,
): Promise<AskResult> {
  const system = sqlSystemPrompt(version);
  let draft = parseDraft(await llm(system, question));
  let repaired = false;

  for (;;) {
    if (!draft.sql) {
      return { status: "cannot_answer", reason: draft.cannot_answer ?? "The model did not return a query." };
    }

    const sql = draft.sql;
    const assumptions = draft.assumptions;
    let failure: string;
    let failedStatus: "blocked" | "sql_error";

    const guard = await checkSql(sql);
    if (guard.ok) {
      try {
        return { status: "ok", sql: guard.sql, assumptions, repaired, ...(await runQuery(guard.sql)) };
      } catch (error) {
        failure = (error as Error).message;
        failedStatus = "sql_error";
      }
    } else {
      failure = guard.reason;
      failedStatus = "blocked";
    }

    // One repair attempt: the model sees its query and the exact error.
    if (repaired) return { status: failedStatus, sql, reason: failure, assumptions, repaired };
    repaired = true;
    draft = parseDraft(
      await llm(system, `Question: ${question}\n\nThis query failed:\n${sql}\n\nError: ${failure}\n\nReturn a corrected query.`),
    );
  }
}

const MAX_ROWS_FOR_INSIGHT = 50;

export async function writeInsight(question: string, result: QueryResult, llm: Llm): Promise<string> {
  const rows = result.rows.slice(0, MAX_ROWS_FOR_INSIGHT);
  const text = await llm(
    `You explain query results to a product manager at an online toy store.
Return JSON only: {"insight": "at most two plain sentences"}.
Use only numbers that appear in the rows. Do not claim causes. If the rows are empty, say so.`,
    JSON.stringify({
      question,
      columns: result.columns,
      rows,
      rows_not_shown: result.truncated || result.rows.length > rows.length,
    }),
  );
  const { insight } = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as { insight?: unknown };
  if (typeof insight !== "string") throw new Error("The model did not return an insight.");
  return insight;
}
