"use client";

import {
  BarChart3,
  Briefcase,
  CalendarDays,
  ClipboardList,
  FileSignature,
  FileText,
  FolderOpen,
  GitBranch,
  History,
  Landmark,
  Layers,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Menu,
  Settings,
  UserCircle,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { Brand, cn } from "./ui";

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  clients: Landmark,
  projects: Briefcase,
  proposals: FileText,
  contracts: FileSignature,
  workflow: GitBranch,
  disciplines: Layers,
  tasks: ClipboardList,
  finance: Wallet,
  documents: FolderOpen,
  calendar: CalendarDays,
  reports: BarChart3,
  users: Users,
  audit: History,
  settings: Settings,
};

export type NavItem = { key: string; label: string; icon: string; href?: string; phase: number; match?: string[] };
export type NavSection = { title: string; items: NavItem[] };

type Props = {
  user: { name: string; roleLabel: string };
  sections: NavSection[];
  logoutAction: () => Promise<void>;
  children: ReactNode;
};

function isActive(pathname: string, item: NavItem): boolean {
  if (!item.href) return false;
  const prefixes = [item.href, ...(item.match ?? [])];
  return prefixes.some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`)));
}

function Nav({ sections, pathname, onNavigate }: { sections: NavSection[]; pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Menu principal" className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="px-3 pb-2 text-[11px] font-semibold tracking-widest text-brand-300 uppercase">{section.title}</p>
          <ul className="space-y-1">
            {section.items.map((item) => {
              const Icon = ICONS[item.icon] ?? LayoutDashboard;
              if (!item.href) {
                return (
                  <li key={item.key}>
                    <span
                      aria-disabled="true"
                      title={`Módulo previsto para a Fase ${item.phase}`}
                      className="flex cursor-default items-center gap-3 rounded-lg px-3 py-2 text-sm text-brand-300/70"
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="flex-1 truncate">{item.label}</span>
                      <span className="rounded border border-brand-700 px-1.5 py-0.5 text-[10px] font-medium text-brand-300">Fase {item.phase}</span>
                    </span>
                  </li>
                );
              }
              const active = isActive(pathname, item);
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-sm font-medium transition-colors",
                      active ? "border-accent-400 bg-white/10 text-white" : "border-transparent text-brand-100 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function UserBox({ user, logoutAction, onNavigate }: Pick<Props, "user" | "logoutAction"> & { onNavigate?: () => void }) {
  return (
    <div className="border-t border-white/10 p-3">
      <Link href="/conta" onClick={onNavigate} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/5">
        <UserCircle className="h-8 w-8 shrink-0 text-brand-200" aria-hidden />
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-medium text-white">{user.name}</span>
          <span className="block truncate text-xs text-brand-200">{user.roleLabel}</span>
        </span>
      </Link>
      <form action={logoutAction}>
        <button type="submit" className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-brand-100 hover:bg-white/5 hover:text-white">
          <LogOut className="h-4 w-4" aria-hidden />
          Sair
        </button>
      </form>
    </div>
  );
}

export function AppShell({ user, sections, logoutAction, children }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Menu lateral fixo (computadores) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-brand-950 lg:flex" data-testid="sidebar-desktop">
        <div className="flex h-16 items-center border-b border-white/10 px-5">
          <Brand />
        </div>
        <Nav sections={sections} pathname={pathname} />
        <UserBox user={user} logoutAction={logoutAction} />
      </aside>

      {/* Barra superior (tablets e celulares) */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          aria-expanded={open}
          aria-controls="menu-movel"
          className="-ml-1 rounded-lg p-2 text-slate-700 hover:bg-slate-100"
        >
          <Menu className="h-6 w-6" aria-hidden />
        </button>
        <Brand tone="light" />
      </header>

      {/* Menu deslizante (tablets e celulares) */}
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-slate-900/60" onClick={() => setOpen(false)} />
          <aside id="menu-movel" role="dialog" aria-modal="true" aria-label="Menu" className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-brand-950 shadow-xl" data-testid="sidebar-mobile">
            <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
              <Brand />
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar menu" className="rounded-lg p-2 text-brand-100 hover:bg-white/10">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <Nav sections={sections} pathname={pathname} onNavigate={() => setOpen(false)} />
            <UserBox user={user} logoutAction={logoutAction} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
