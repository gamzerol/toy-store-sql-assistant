import { describe, expect, it } from "vitest";
import { QUESTIONS } from "../evals/questions";
import { checkSql } from "../server/sqlGuard";

const blocked = [
  "DROP TABLE orders",
  "DELETE FROM orders",
  "UPDATE orders SET price_usd = 0",
  "INSERT INTO orders VALUES (1)",
  "SELECT 1; DROP TABLE orders",
  "WITH gone AS (DELETE FROM orders RETURNING *) SELECT * FROM gone",
  "SELECT * INTO copy_of_orders FROM orders",
  "SELECT * FROM orders FOR UPDATE",
  "SELECT * FROM pg_user",
  "SELECT * FROM pg_catalog.pg_user",
  "SELECT * FROM information_schema.tables",
  "SELECT * FROM public.orders",
  "SELECT pg_sleep(30)",
  "SELECT pg_catalog.pg_read_file('/etc/passwd')",
  "SELECT set_config('statement_timeout', '0', true)",
  "SELECT * FROM (SELECT * FROM pg_user) a, (WITH pg_user AS (SELECT 1) SELECT * FROM pg_user) b",
  "SET ROLE postgres",
  "COPY orders TO '/tmp/orders.csv'",
  "EXPLAIN ANALYZE SELECT 1",
  "not sql at all",
  "",
];

describe("checkSql", () => {
  it.each(blocked)("blocks: %s", async (sql) => {
    expect((await checkSql(sql)).ok).toBe(false);
  });

  it("allows CTEs, window functions and a trailing semicolon", async () => {
    const result = await checkSql(`WITH m AS (
      SELECT DATE_TRUNC('month', created_at) AS month, SUM(price_usd) AS revenue FROM orders GROUP BY 1
    ) SELECT month, LAG(revenue) OVER (ORDER BY month) FROM m;`);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sql.endsWith(";")).toBe(false);
  });

  it("allows every gold query", async () => {
    for (const { id, gold } of QUESTIONS) {
      if (gold) expect(await checkSql(gold), `Q${id}`).toMatchObject({ ok: true });
    }
  });
});
