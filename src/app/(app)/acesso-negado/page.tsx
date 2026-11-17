import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass, Card } from "@/components/ui";

export const metadata: Metadata = { title: "Acesso negado" };

export default function ForbiddenPage() {
  return (
    <Card className="mx-auto mt-10 max-w-lg text-center">
      <p className="text-sm font-semibold tracking-widest text-red-600 uppercase">Acesso negado</p>
      <h1 className="mt-2 text-xl font-semibold text-slate-900">Seu perfil não tem permissão para esta área</h1>
      <p className="mt-2 text-sm text-slate-600">Se você precisa deste acesso, solicite ao administrador principal.</p>
      <Link href="/" className={buttonClass("primary", "mt-6")}>
        Voltar ao início
      </Link>
    </Card>
  );
}
