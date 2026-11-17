/** Remove pontuação e padroniza em maiúsculas (o CNPJ pode ser alfanumérico desde julho de 2026). */
export const normalizeDocument = (value: string): string => value.toUpperCase().replace(/[^0-9A-Z]/g, "");

export function isValidCPF(value: string): boolean {
  const d = normalizeDocument(value);
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const digit = (n: number) => {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Number(d[i]) * (n + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digit(9) === Number(d[9]) && digit(10) === Number(d[10]);
}

export function isValidCNPJ(value: string): boolean {
  const d = normalizeDocument(value);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const val = (i: number) => d.charCodeAt(i) - 48;
  const digit = (n: 12 | 13) => {
    const weights = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = weights.reduce((acc, w, i) => acc + w * val(i), 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return digit(12) === Number(d[12]) && digit(13) === Number(d[13]);
}

export function formatDocument(value: string | null | undefined): string {
  if (!value) return "—";
  if (value.length === 11) return value.replace(/^(.{3})(.{3})(.{3})(.{2})$/, "$1.$2.$3-$4");
  if (value.length === 14) return value.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, "$1.$2.$3/$4-$5");
  return value;
}
