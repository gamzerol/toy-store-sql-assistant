import { useRef, useState, type FormEvent } from "react";

type Answer =
  | { status: "cannot_answer"; reason: string }
  | { status: "blocked" | "sql_error"; sql: string; reason: string; assumptions: string[] }
  | {
      status: "ok";
      sql: string;
      assumptions: string[];
      columns: string[];
      rows: unknown[][];
      truncated: boolean;
      insight: string | null;
      repaired: boolean;
    };

const EXAMPLES = [
  "What is the conversion rate of each marketing channel?",
  "Show revenue per session for each month.",
  "What is the refund rate of each product?",
  "What is the customer acquisition cost of paid non-brand traffic?",
];

export function App() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const request = useRef<AbortController | null>(null);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setQuestion(trimmed);
    setLoading(true);
    setAnswer(null);
    setError(null);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setAnswer(data);
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(caught instanceof Error && caught.message ? caught.message : "The server did not respond. Check that the API is running.");
    }
    setLoading(false);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(question);
  }

  return (
    <>
      <header className="ask">
        <div className="wrap">
          <h1><label htmlFor="question">What do you want to know about the toy store?</label></h1>
          <form onSubmit={submit}>
            <textarea
              id="question"
              rows={2}
              maxLength={500}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) submit(event);
              }}
              placeholder="Ask in plain English"
            />
            <button type="submit" disabled={loading || !question.trim()}>
              {loading ? "Working on it" : "Get answer"}
            </button>
          </form>
          <div className="examples">
            {EXAMPLES.map((example) => (
              <button key={example} type="button" onClick={() => void ask(example)} disabled={loading}>
                {example}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="wrap" aria-live="polite">
        {loading && <p className="status">Writing the query and running it on the database.</p>}
        {error && <p className="problem">{error}</p>}
        {answer && <AnswerView answer={answer} />}
        {!loading && !error && !answer && (
          <p className="status">
            You get an answer, the table behind it and the SQL, so you can check every number. Data covers March 2012 to March 2015.
          </p>
        )}
      </main>
    </>
  );
}

function AnswerView({ answer }: { answer: Answer }) {
  if (answer.status === "cannot_answer") {
    return (
      <section className="insight">
        <h2>This data can't answer that</h2>
        <p>{answer.reason}</p>
      </section>
    );
  }
  if (answer.status !== "ok") {
    return (
      <>
        <p className="problem">
          {answer.status === "blocked"
            ? "The query was stopped because it did not pass the safety check."
            : "The query failed on the database."}{" "}
          {answer.reason}
        </p>
        <SqlBlock sql={answer.sql} />
      </>
    );
  }
  return (
    <>
      {answer.insight && (
        <section className="insight">
          <p>{answer.insight}</p>
          <small>Written by AI from the table below. Check it before you quote it.</small>
        </section>
      )}
      <ResultTable columns={answer.columns} rows={answer.rows} truncated={answer.truncated} />
      {answer.assumptions.length > 0 && (
        <section>
          <h2>Assumptions</h2>
          <ul>{answer.assumptions.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
      )}
      <SqlBlock sql={answer.sql} repaired={answer.repaired} />
    </>
  );
}

function ResultTable({ columns, rows, truncated }: { columns: string[]; rows: unknown[][]; truncated: boolean }) {
  if (rows.length === 0) return <p className="status">The query ran and returned no rows.</p>;
  return (
    <section>
      <h2>{rows.length} {rows.length === 1 ? "row" : "rows"}{truncated && ", cut at the limit"}</h2>
      <div className="table" tabIndex={0} role="region" aria-label="Query result">
        <table>
          <thead>
            <tr>
              {columns.map((column, i) => (
                <th key={i} scope="col" className={typeof rows[0][i] === "number" ? "number" : undefined}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c} className={typeof cell === "number" ? "number" : undefined}>{formatCell(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatCell(cell: unknown): string {
  if (cell === null) return "–";
  if (typeof cell === "number") return cell.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return String(cell).replace(/ 00:00:00$/, "");
}

function SqlBlock({ sql, repaired = false }: { sql: string; repaired?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <section>
      <div className="sql-head">
        <h2>SQL</h2>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(sql).then(() => setCopied(true));
          }}
        >
          {copied ? "Copied" : "Copy SQL"}
        </button>
      </div>
      {repaired && <p className="note">The first query failed, so the AI corrected it once.</p>}
      <pre><code>{sql}</code></pre>
    </section>
  );
}
