const TZ = "America/Cuiaba";

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: TZ });
const dateOnly = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: TZ });

export const formatDateTime = (d: Date | null | undefined) => (d ? dateTime.format(d) : "—");
export const formatDate = (d: Date | null | undefined) => (d ? dateOnly.format(d) : "—");

/** Data de hoje (AAAA-MM-DD) no fuso da PROJETARQ. */
export const todayISO = (): string => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

/** "2026-11-16" → "16/11/2026". */
export const formatISODate = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

export const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
