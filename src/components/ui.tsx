import type { ComponentProps, ReactNode } from "react";

export const cn = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60";

export const BUTTON_VARIANTS = {
  primary: "bg-brand-600 text-white hover:bg-brand-700",
  secondary: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-100",
  danger: "bg-red-600 text-white hover:bg-red-700",
  success: "bg-emerald-600 text-white hover:bg-emerald-700",
} as const;
export type ButtonVariant = keyof typeof BUTTON_VARIANTS;

export const buttonClass = (variant: ButtonVariant = "primary", extra?: string) =>
  cn(BUTTON_BASE, BUTTON_VARIANTS[variant], extra);

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      {...props}
      className={cn(
        "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 disabled:bg-slate-100 disabled:text-slate-500",
        className,
      )}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      {...props}
      className={cn(
        "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 disabled:bg-slate-100",
        className,
      )}
    />
  );
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function Card({ title, description, children, className }: { title?: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>
      {title ? (
        <header className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </header>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

const BADGE = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  brand: "bg-brand-50 text-brand-700 ring-brand-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  danger: "bg-red-50 text-red-700 ring-red-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
} as const;

export function Badge({ kind = "neutral", children }: { kind?: keyof typeof BADGE; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset", BADGE[kind])}>
      {children}
    </span>
  );
}

const ALERT = {
  error: "border-red-200 bg-red-50 text-red-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  info: "border-brand-200 bg-brand-50 text-brand-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
} as const;

export function Alert({ kind = "info", children }: { kind?: keyof typeof ALERT; children: ReactNode }) {
  return (
    <div role={kind === "error" ? "alert" : "status"} className={cn("rounded-lg border px-4 py-3 text-sm", ALERT[kind])}>
      {children}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Brand({ tone = "dark" }: { tone?: "dark" | "light" }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-500 text-sm font-bold text-brand-950">SG</div>
      <div className="leading-tight">
        <p className={cn("text-base font-semibold tracking-wide", tone === "dark" ? "text-white" : "text-slate-900")}>SIGEP</p>
        <p className={cn("text-xs tracking-widest", tone === "dark" ? "text-brand-200" : "text-slate-500")}>PROJETARQ</p>
      </div>
    </div>
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      rows={3}
      {...props}
      className={cn(
        "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 disabled:bg-slate-100 disabled:text-slate-500",
        className,
      )}
    />
  );
}

/** Tabela dentro de cartão; em telas estreitas rola na horizontal sem estourar a página. */
export function TableCard({ head, children, minWidth = 720 }: { head: ReactNode; children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold tracking-wide text-slate-600 uppercase">{head}</thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export const TH = "px-4 py-3";
export const TD = "px-4 py-3";

export function EmptyRow({ cols, children }: { cols: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-8 text-center text-slate-500">
        {children}
      </td>
    </tr>
  );
}

/** Barra de busca e filtros por GET (funciona sem JavaScript). */
export function FilterBar({ action, children }: { action: string; children: ReactNode }) {
  return (
    <form action={action} className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      {children}
      <button type="submit" className={buttonClass("secondary")}>
        Filtrar
      </button>
    </form>
  );
}

/** Grupo de campos somente leitura para quem não pode editar. */
export function ReadOnly({ children }: { children: ReactNode }) {
  return (
    <fieldset disabled className="space-y-4">
      {children}
    </fieldset>
  );
}

export function Tabs({ tabs, current }: { tabs: { key: string; label: string; href: string }[]; current: string }) {
  return (
    <div className="mb-6 flex gap-6 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <a
          key={t.key}
          href={t.href}
          aria-current={current === t.key ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 pb-3 text-sm font-medium whitespace-nowrap",
            current === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800",
          )}
        >
          {t.label}
        </a>
      ))}
    </div>
  );
}
