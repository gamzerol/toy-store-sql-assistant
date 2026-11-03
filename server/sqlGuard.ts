import { loadModule, parse } from "libpg-query";

const ALLOWED_TABLES = new Set([
  "products",
  "website_sessions",
  "website_pageviews",
  "orders",
  "order_items",
  "order_item_refunds",
]);

// An allowlist is safer than a blocklist: an unknown function is rejected by default.
const ALLOWED_FUNCTIONS = new Set([
  "count", "sum", "avg", "min", "max", "stddev", "stddev_samp", "stddev_pop",
  "variance", "percentile_cont", "percentile_disc", "bool_or", "bool_and",
  "round", "abs", "ceil", "ceiling", "floor", "power", "sqrt",
  "date_trunc", "date_part", "extract", "age", "to_char", "make_date",
  "timezone", "overlaps", "date", "to_date", "trunc", "mod", "left", "right", "regexp_replace",
  "lag", "lead", "row_number", "rank", "dense_rank", "ntile",
  "first_value", "last_value", "nth_value", "percent_rank", "cume_dist",
  "lower", "upper", "length", "concat", "replace", "split_part", "substring",
  "substr", "position", "trim", "btrim", "ltrim", "rtrim", "string_agg",
  "array_agg", "generate_series",
]);

export type GuardResult = { ok: true; sql: string } | { ok: false; reason: string };

export async function checkSql(rawSql: string): Promise<GuardResult> {
  const sql = rawSql.trim().replace(/;\s*$/, "");
  if (!sql) return { ok: false, reason: "The query is empty." };

  await loadModule();
  let ast: Awaited<ReturnType<typeof parse>>;
  try {
    ast = await parse(sql);
  } catch (error) {
    return { ok: false, reason: `The query could not be parsed: ${(error as Error).message}` };
  }

  const statements = ast.stmts ?? [];
  if (statements.length !== 1) {
    return { ok: false, reason: "Only one statement is allowed." };
  }
  if (!statements[0].stmt || !("SelectStmt" in statements[0].stmt)) {
    return { ok: false, reason: "Only SELECT queries are allowed." };
  }

  const problem = findProblem(statements[0].stmt);
  return problem ? { ok: false, reason: problem } : { ok: true, sql };
}

function findProblem(root: unknown): string | null {
  const cteNames = new Set<string>();
  const tables: { schema?: string; name: string }[] = [];
  const functions: string[] = [];
  let problem: string | null = null;

  const visit = (node: unknown): void => {
    if (problem || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);

    for (const [key, value] of Object.entries(node)) {
      if (key.endsWith("Stmt") && key !== "SelectStmt") {
        problem = "Only SELECT queries are allowed.";
        return;
      }
      if (key === "intoClause") {
        problem = "SELECT INTO is not allowed.";
        return;
      }
      if (key === "lockingClause") {
        problem = "Row locks are not allowed.";
        return;
      }
      if (key === "CommonTableExpr") {
        cteNames.add((value as { ctename: string }).ctename.toLowerCase());
      }
      if (key === "RangeVar") {
        const table = value as { schemaname?: string; relname: string };
        tables.push({ schema: table.schemaname?.toLowerCase(), name: table.relname.toLowerCase() });
      }
      if (key === "FuncCall") {
        const parts = (value as { funcname: { String: { sval: string } }[] }).funcname;
        functions.push(parts[parts.length - 1].String.sval.toLowerCase());
      }
      visit(value);
    }
  };
  visit(root);
  if (problem) return problem;

  // A CTE named like a system table could hide a real system table reference elsewhere.
  for (const name of cteNames) {
    if (name.startsWith("pg_")) return `The CTE name "${name}" is not allowed.`;
  }
  for (const table of tables) {
    const isCte = !table.schema && cteNames.has(table.name);
    const isAllowed = (!table.schema || table.schema === "toystore") && ALLOWED_TABLES.has(table.name);
    if (!isCte && !isAllowed) {
      return `The table "${table.schema ? `${table.schema}.` : ""}${table.name}" is not allowed.`;
    }
  }
  for (const name of functions) {
    if (!ALLOWED_FUNCTIONS.has(name)) return `The function "${name}" is not allowed.`;
  }
  return null;
}
