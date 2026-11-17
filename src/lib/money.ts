/**
 * Converte texto digitado em valor monetário com duas casas ("1.234,56" → "1234.56").
 * Trabalha com texto, sem ponto flutuante. Devolve null se o valor for inválido ou negativo.
 */
export function parseMoney(input: string): string | null {
  let s = input.replace(/R\$/i, "").replace(/\s/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(s)) return null;
  const [int, dec = ""] = s.split(".");
  return `${int.replace(/^0+(?=\d)/, "")}.${dec.padEnd(2, "0")}`;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const formatBRL = (value: string | number | null | undefined): string => (value == null ? "—" : brl.format(Number(value)));

/** Valor para preencher um campo de formulário ("1234.50" → "1.234,50"). */
export const moneyInput = (value: string | null | undefined): string =>
  value == null ? "" : Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
