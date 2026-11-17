import { describe, expect, it } from "vitest";
import { can, DEFAULT_GRANTS, validateGrants } from "@/lib/rbac/can";
import { grantKey, MODULES } from "@/lib/rbac/modules";

const set = (role: "OPERACIONAL" | "CONSULTA") => new Set(DEFAULT_GRANTS[role].map((g) => grantKey(g.module, g.action)));

describe("can()", () => {
  it("administrador principal pode toda ação existente em todo módulo", () => {
    for (const m of MODULES) for (const a of m.actions) expect(can("ADMIN_PRINCIPAL", new Set(), m.key, a)).toBe(true);
  });

  it("nega ação que não existe no módulo, mesmo ao administrador", () => {
    expect(can("ADMIN_PRINCIPAL", new Set(), "REPORTS", "DELETE")).toBe(false);
    expect(can("ADMIN_PRINCIPAL", new Set(), "INEXISTENTE", "VIEW")).toBe(false);
  });

  it("módulos administrativos são negados a outros perfis mesmo com permissão gravada", () => {
    const forjado = new Set(["USERS:VIEW", "USERS:EDIT", "AUDIT:VIEW", "SETTINGS:EDIT"]);
    for (const role of ["OPERACIONAL", "CONSULTA"] as const) {
      expect(can(role, forjado, "USERS", "VIEW")).toBe(false);
      expect(can(role, forjado, "USERS", "EDIT")).toBe(false);
      expect(can(role, forjado, "AUDIT", "VIEW")).toBe(false);
      expect(can(role, forjado, "SETTINGS", "EDIT")).toBe(false);
    }
  });

  it("consulta nunca edita, mesmo com permissão gravada", () => {
    const forjado = new Set(["PROJECTS:VIEW", "PROJECTS:EDIT", "TASKS:CREATE"]);
    expect(can("CONSULTA", forjado, "PROJECTS", "VIEW")).toBe(true);
    expect(can("CONSULTA", forjado, "PROJECTS", "EDIT")).toBe(false);
    expect(can("CONSULTA", forjado, "TASKS", "CREATE")).toBe(false);
  });

  it("matriz inicial: operacional sem financeiro; consulta só visualiza", () => {
    const op = set("OPERACIONAL");
    expect(can("OPERACIONAL", op, "TASKS", "CREATE")).toBe(true);
    expect(can("OPERACIONAL", op, "DOCUMENTS", "CREATE")).toBe(true);
    expect(can("OPERACIONAL", op, "FINANCE", "VIEW")).toBe(false);
    expect(can("OPERACIONAL", op, "PROJECTS", "DELETE")).toBe(false);
    expect(DEFAULT_GRANTS.CONSULTA.every((g) => g.action === "VIEW")).toBe(true);
    expect(can("CONSULTA", set("CONSULTA"), "CONTRACTS", "VIEW")).toBe(false);
  });

  it("sem permissão gravada, nega", () => {
    expect(can("OPERACIONAL", new Set(), "DASHBOARD", "VIEW")).toBe(false);
  });
});

describe("validateGrants()", () => {
  it("aceita as matrizes iniciais", () => {
    expect(validateGrants("OPERACIONAL", DEFAULT_GRANTS.OPERACIONAL)).toEqual([]);
    expect(validateGrants("CONSULTA", DEFAULT_GRANTS.CONSULTA)).toEqual([]);
  });
  it("recusa alterar o administrador principal", () => {
    expect(validateGrants("ADMIN_PRINCIPAL", [])).toHaveLength(1);
  });
  it("recusa módulo administrativo, ação inexistente e módulo desconhecido", () => {
    expect(validateGrants("OPERACIONAL", [{ module: "USERS", action: "VIEW" }])).not.toEqual([]);
    expect(validateGrants("OPERACIONAL", [{ module: "REPORTS", action: "VIEW" }, { module: "REPORTS", action: "DELETE" }])).not.toEqual([]);
    expect(validateGrants("OPERACIONAL", [{ module: "XYZ", action: "VIEW" }])).not.toEqual([]);
  });
  it("recusa edição para consulta", () => {
    expect(validateGrants("CONSULTA", [{ module: "TASKS", action: "VIEW" }, { module: "TASKS", action: "EDIT" }])).not.toEqual([]);
  });
  it("exige Ver para conceder outra ação", () => {
    expect(validateGrants("OPERACIONAL", [{ module: "TASKS", action: "EDIT" }])).not.toEqual([]);
  });
});
