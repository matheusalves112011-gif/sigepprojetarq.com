import { Brand } from "@/components/ui";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="flex flex-col justify-between bg-brand-950 px-6 py-6 lg:w-[42%] lg:px-12 lg:py-12">
        <Brand />
        <div className="mt-6 hidden lg:block">
          <p className="text-3xl leading-tight font-semibold text-white">Gestão de projetos, engenharia e arquitetura em um só lugar.</p>
          <p className="mt-4 max-w-md text-sm text-brand-200">
            Clientes, contratos, tramitação, documentos, prazos e financeiro da PROJETARQ, com acesso controlado por perfil.
          </p>
        </div>
        <p className="mt-6 hidden text-xs text-brand-300 lg:block">Acesso restrito a usuários autorizados. As ações são registradas em auditoria.</p>
      </aside>
      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
