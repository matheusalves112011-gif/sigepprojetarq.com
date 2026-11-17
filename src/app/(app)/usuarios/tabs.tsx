import Link from "next/link";
import { cn } from "@/components/ui";

export function AdminTabs({ current }: { current: "usuarios" | "permissoes" }) {
  const tabs = [
    { key: "usuarios", label: "Usuários", href: "/usuarios" },
    { key: "permissoes", label: "Permissões por perfil", href: "/permissoes" },
  ] as const;
  return (
    <div className="mb-6 flex gap-6 border-b border-slate-200">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={current === t.key ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 pb-3 text-sm font-medium",
            current === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
