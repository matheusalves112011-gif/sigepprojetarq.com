import { describe, expect, it } from "vitest";
import { formatDocument, isValidCNPJ, isValidCPF, normalizeDocument } from "@/lib/documents";
import { addDays, formatISODate } from "@/lib/format";
import { formatBRL, moneyInput, parseMoney } from "@/lib/money";
import { likePattern } from "@/lib/validation";
import { parseStageLines } from "@/modules/workflow/service";

describe("valores monetários", () => {
  it("interpreta o formato brasileiro sem ponto flutuante", () => {
    expect(parseMoney("1.234,56")).toBe("1234.56");
    expect(parseMoney("R$ 12.500,00")).toBe("12500.00");
    expect(parseMoney("1500")).toBe("1500.00");
    expect(parseMoney("1.500")).toBe("1500.00");
    expect(parseMoney("0,1")).toBe("0.10");
    expect(parseMoney("1234.5")).toBe("1234.50");
    expect(parseMoney("007,5")).toBe("7.50");
    expect(parseMoney("999999999999,99")).toBe("999999999999.99");
  });
  it("recusa texto, negativos, excesso de casas e vazio", () => {
    for (const v of ["", "abc", "-10", "1,234", "1.2.3,4,5", "12,345", "1e5", "9999999999999"]) expect(parseMoney(v), v).toBeNull();
  });
  it("formata para exibição e para campo de formulário", () => {
    expect(formatBRL("1234.5").replace(/\s/g, " ")).toBe("R$ 1.234,50");
    expect(formatBRL(null)).toBe("—");
    expect(moneyInput("12500.00")).toBe("12.500,00");
  });
});

describe("CPF e CNPJ", () => {
  it("valida dígitos verificadores de CPF", () => {
    expect(isValidCPF("529.982.247-25")).toBe(true);
    expect(isValidCPF("529.982.247-26")).toBe(false);
    expect(isValidCPF("111.111.111-11")).toBe(false);
    expect(isValidCPF("123")).toBe(false);
  });
  it("valida CNPJ numérico e alfanumérico", () => {
    expect(isValidCNPJ("11.222.333/0001-81")).toBe(true);
    expect(isValidCNPJ("11.222.333/0001-82")).toBe(false);
    expect(isValidCNPJ("00.000.000/0000-00")).toBe(false);
    expect(isValidCNPJ("12.ABC.345/01DE-35")).toBe(true);
    expect(isValidCNPJ("12.ABC.345/01DE-36")).toBe(false);
  });
  it("normaliza e formata", () => {
    expect(normalizeDocument("529.982.247-25")).toBe("52998224725");
    expect(formatDocument("52998224725")).toBe("529.982.247-25");
    expect(formatDocument("11222333000181")).toBe("11.222.333/0001-81");
  });
});

describe("datas e busca", () => {
  it("soma dias atravessando mês e ano", () => {
    expect(addDays("2026-12-30", 5)).toBe("2027-01-04");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(formatISODate("2026-11-16")).toBe("16/11/2026");
  });
  it("neutraliza curingas na busca", () => {
    expect(likePattern("100%_a\\")).toBe("%100\\%\\_a\\\\%");
  });
});

describe("texto de etapas do fluxo", () => {
  it("lê uma etapa por linha com prazo opcional", () => {
    expect(parseStageLines("Vistoria | 5\n\n  Laudo técnico \nEntrega|0")).toEqual([
      { name: "Vistoria", defaultDays: 5 },
      { name: "Laudo técnico", defaultDays: null },
      { name: "Entrega", defaultDays: 0 },
    ]);
  });
  it("recusa prazo não numérico", () => {
    expect(() => parseStageLines("Vistoria | cinco")).toThrow(/Prazo inválido/);
  });
});
