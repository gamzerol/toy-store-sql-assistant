import pg from "pg";

// Keep dates as text and turn numeric values into numbers for the UI and evals.
pg.types.setTypeParser(1114, (value) => value);
pg.types.setTypeParser(1082, (value) => value);
pg.types.setTypeParser(1700, parseFloat);
pg.types.setTypeParser(20, (value) => Number(value));

export const MAX_ROWS = 1000;

export type QueryResult = {
  columns: string[];
  rows: unknown[][];
  truncated: boolean;
};

export type RunQuery = (sql: string) => Promise<QueryResult>;

export function createRunQuery(pool: pg.Pool): RunQuery {
  return async (sql) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      await client.query("SET LOCAL statement_timeout = '10s'");
      await client.query("SET LOCAL search_path = toystore");
      // Newline: a trailing "-- comment" in the query must not swallow the bracket.
      const result = await client.query({
        text: `SELECT * FROM (\n${sql}\n) AS result LIMIT ${MAX_ROWS + 1}`,
        rowMode: "array",
      });
      const rows = result.rows as unknown[][];
      return {
        columns: result.fields.map((field) => field.name),
        rows: rows.slice(0, MAX_ROWS),
        truncated: rows.length > MAX_ROWS,
      };
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  };
}
