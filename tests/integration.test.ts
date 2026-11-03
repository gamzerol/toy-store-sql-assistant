// Needs a real Postgres loaded with tests/fixtures/sample_data.sql:
// TEST_DATABASE_URL=postgres://toystore_readonly:...@localhost/toystore_test npm test
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { QUESTIONS } from "../evals/questions";
import { evaluate } from "../evals/run";
import { generateAndRun } from "../server/assistant";
import { createRunQuery } from "../server/db";
import type { Llm } from "../server/llm";

const url = process.env.TEST_DATABASE_URL;
const pool = url ? new pg.Pool({ connectionString: url }) : null;
const runQuery = pool ? createRunQuery(pool) : async () => { throw new Error("no database"); };
const reply = (sql: string | null, cannot: string | null = null) =>
  JSON.stringify({ sql, assumptions: [], cannot_answer: cannot });

describe.skipIf(!url)("against Postgres", () => {
  afterAll(() => pool?.end());

  it("runs every gold query and returns rows", async () => {
    for (const { id, gold } of QUESTIONS) {
      if (gold) expect((await runQuery(gold)).rows.length, `Q${id}`).toBeGreaterThan(0);
    }
  });

  it("scores a perfect model 30 of 30", async () => {
    for (const item of QUESTIONS) {
      const llm: Llm = async () => reply(item.gold, item.gold ? null : "Not in the data.");
      expect((await evaluate(item, llm, runQuery, "v2")).outcome, `Q${item.id}`).toBe("correct");
    }
  });

  it("marks wrong answers", async () => {
    const q11 = QUESTIONS.find((q) => q.id === 11)!;
    const q10 = QUESTIONS.find((q) => q.id === 10)!;
    const q23 = QUESTIONS.find((q) => q.id === 23)!;
    const q28 = QUESTIONS.find((q) => q.id === 28)!;
    const out = (item: typeof q11, sql: string) => evaluate(item, async () => reply(sql), runQuery, "v2");

    // Inner join loses sessions without an order.
    expect((await out(q10, `SELECT s.device_type, COUNT(o.order_id)::numeric / COUNT(*) AS cvr
      FROM website_sessions s JOIN orders o ON o.website_session_id = s.website_session_id GROUP BY 1`)).outcome).toBe("wrong_result");
    // Refund join repeats order revenue.
    expect((await out(q23, `SELECT SUM(o.price_usd) - COALESCE(SUM(r.refund_amount_usd), 0) AS n
      FROM orders o LEFT JOIN order_item_refunds r ON r.order_id = o.order_id`)).outcome).toBe("wrong_result");
    expect((await out(q11, "SELECT utm_source, COUNT(*) FROM website_sessions GROUP BY 1")).outcome).toBe("wrong_result");
    expect((await out(q28, "SELECT COUNT(*) FROM website_sessions")).outcome).toBe("should_refuse");
  });

  it("repairs a failed query once", async () => {
    let calls = 0;
    const llm: Llm = async (_, user) => {
      calls++;
      return calls === 1 ? reply("SELECT nope FROM orders") : (expect(user).toContain("nope"), reply("SELECT COUNT(*) AS n FROM orders"));
    };
    expect(await generateAndRun("q", llm, runQuery, "v2")).toMatchObject({ status: "ok", repaired: true });
  });

  it("stops after one failed repair", async () => {
    let calls = 0;
    const llm: Llm = async () => (calls++, reply("DROP TABLE orders"));
    expect(await generateAndRun("q", llm, runQuery, "v2")).toMatchObject({ status: "blocked" });
    expect(calls).toBe(2);
  });

  it("the database refuses writes even without the SQL check", async () => {
    await expect(pool!.query("DELETE FROM toystore.orders")).rejects.toThrow(/permission denied|read-only/);
    await expect(runQuery("SELECT 1 AS a")).resolves.toMatchObject({ rows: [[1]] });
  });

  it("handles repeated column names and a trailing comment", async () => {
    const result = await runQuery("SELECT 1 AS a, 2 AS a -- note");
    expect(result.rows).toEqual([[1, 2]]);
  });

  it("cuts long results at the row limit", async () => {
    const big = await runQuery("SELECT g FROM generate_series(1, 2000) AS g");
    expect(big.rows.length).toBe(1000);
    expect(big.truncated).toBe(true);
  });
});
