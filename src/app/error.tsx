"use client";

import { buttonClass } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold text-slate-900">Ocorreu um erro</h1>
      <p className="mt-2 max-w-md text-sm text-slate-600">A operação não foi concluída. Tente novamente; se persistir, avise o administrador.</p>
      <button type="button" onClick={reset} className={buttonClass("primary", "mt-6")}>
        Tentar novamente
      </button>
    </div>
  );
}
