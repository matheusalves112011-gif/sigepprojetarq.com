import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";

/** Verificação de saúde para o monitoramento: confirma que a aplicação alcança o banco. Não expõe detalhes. */
export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ status: "ok" });
  } catch (e) {
    console.error("[health] banco indisponível:", e);
    return Response.json({ status: "erro" }, { status: 503 });
  }
}
