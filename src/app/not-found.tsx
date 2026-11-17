import Link from "next/link";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-semibold tracking-widest text-brand-600 uppercase">Erro 404</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Página não encontrada</h1>
      <Link href="/" className={buttonClass("primary", "mt-6")}>
        Ir para o início
      </Link>
    </div>
  );
}
