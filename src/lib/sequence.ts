import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { todayISO } from "./format";

/** Próximo número de uma sequência anual, de forma atômica (ex.: "PROP" → "PROP-2026-001"). */
export async function nextNumber(tx: DbOrTx, prefix: "PROP" | "CT" | "PRJ"): Promise<string> {
  const year = todayISO().slice(0, 4);
  const key = `${prefix}:${year}`;
  const result = await tx.execute<{ value: number }>(
    sql`insert into counters (key, value) values (${key}, 1)
        on conflict (key) do update set value = counters.value + 1
        returning value`,
  );
  const n = String(result.rows[0].value).padStart(3, "0");
  return prefix === "PRJ" ? `${year}-${n}` : `${prefix}-${year}-${n}`;
}
