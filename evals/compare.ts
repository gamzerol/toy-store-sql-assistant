import type { QueryResult } from "../server/db";

type Cell = number | string | null;

const TOLERANCE = 0.01;
const SCALES = [1, 100, 0.01]; 

function normalize(value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  let text = String(value).trim().toLowerCase();
  if (text !== "" && !Number.isNaN(Number(text))) return Number(text);
  text = text.replace(/^(\d{4}-\d{2}-\d{2})[ t]00:00:00(\.0+)?$/, "$1");
  if (/^\d{4}-\d{2}$/.test(text)) text += "-01";
  return text;
}

function same(gold: Cell, predicted: Cell, scale: number): boolean {
  const g = gold ?? 0;
  const p = predicted ?? 0;
  if (typeof g === "number" && typeof p === "number") {
    const scaled = p * scale;
    return Math.abs(g - scaled) <= Math.max(Math.abs(g) * TOLERANCE, 1e-9);
  }
  return scale === 1 && g === p;
}

function sortCells(cells: Cell[]): Cell[] {
  return [...cells].map((cell) => cell ?? 0).sort((a, b) =>
    typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b)),
  );
}


export function resultsMatch(gold: QueryResult, predicted: QueryResult): boolean {
  if (gold.rows.length !== predicted.rows.length) return false;

  const goldRows = gold.rows.map((row) => row.map(normalize));
  const predictedRows = predicted.rows.map((row) => row.map(normalize));
  if (goldRows.length === 0) return predicted.columns.length >= gold.columns.length;

  const goldSorted = gold.columns.map((_, g) => sortCells(goldRows.map((row) => row[g])));
  const predictedSorted = predicted.columns.map((_, p) => sortCells(predictedRows.map((row) => row[p])));

  const candidates = gold.columns.map((_, g) =>
    predicted.columns.flatMap((_, p) =>
      SCALES.filter((scale) =>
        goldSorted[g].every((cell, i) => same(cell, predictedSorted[p][i], scale)),
      ).map((scale) => ({ p, scale })),
    ),
  );

  const chosen: { p: number; scale: number }[] = [];
  const used = new Set<number>();

  const rowsMatch = () => {
    const free = new Set(predictedRows.keys());
    return goldRows.every((goldRow) => {
      for (const index of free) {
        if (chosen.every(({ p, scale }, g) => same(goldRow[g], predictedRows[index][p], scale))) {
          free.delete(index);
          return true;
        }
      }
      return false;
    });
  };

  const assign = (g: number): boolean => {
    if (g === gold.columns.length) return rowsMatch();
    for (const candidate of candidates[g]) {
      if (used.has(candidate.p)) continue;
      used.add(candidate.p);
      chosen.push(candidate);
      if (assign(g + 1)) return true;
      chosen.pop();
      used.delete(candidate.p);
    }
    return false;
  };

  return assign(0);
}
