import { describe, expect, it } from "vitest";
import { resultsMatch } from "../evals/compare";

const table = (columns: string[], rows: unknown[][]) => ({ columns, rows, truncated: false });
const gold = table(["device", "cvr"], [["desktop", 0.085], ["mobile", 0.031]]);

describe("resultsMatch", () => {
  it("ignores column names, column order and row order", () => {
    expect(resultsMatch(gold, table(["rate", "d"], [[0.031, "mobile"], [0.085, "desktop"]]))).toBe(true);
  });
  it("accepts rounding, percentages and extra columns", () => {
    expect(resultsMatch(gold, table(["d", "pct", "n"], [["desktop", 8.5, 10], ["mobile", 3.1, 20]]))).toBe(true);
  });
  it("rejects a different value", () => {
    expect(resultsMatch(gold, table(["d", "cvr"], [["desktop", 0.09], ["mobile", 0.031]]))).toBe(false);
  });
  it("rejects values attached to the wrong row", () => {
    expect(resultsMatch(gold, table(["d", "cvr"], [["desktop", 0.031], ["mobile", 0.085]]))).toBe(false);
  });
  it("rejects a missing row or column", () => {
    expect(resultsMatch(gold, table(["d", "cvr"], [["desktop", 0.085]]))).toBe(false);
    expect(resultsMatch(gold, table(["d"], [["desktop"], ["mobile"]]))).toBe(false);
  });
  it("treats month formats and midnight timestamps as equal", () => {
    const month = table(["m"], [["2012-04-01"]]);
    expect(resultsMatch(month, table(["m"], [["2012-04"]]))).toBe(true);
    expect(resultsMatch(month, table(["m"], [["2012-04-01 00:00:00"]]))).toBe(true);
  });
});
