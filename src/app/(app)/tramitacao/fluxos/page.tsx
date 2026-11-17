import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Alert, Badge, Card, Field, PageHeader, Textarea } from "@/components/ui";
import { requireAdmin } from "@/lib/session";
import { listTemplates } from "@/modules/workflow/service";
import { saveTemplateAction } from "../actions";

export const metadata: Metadata = { title: "Fluxos de tramitação" };

export default async function TemplatesPage() {
  const user = await requireAdmin();
  const templates = await listTemplates(user);
  return (
    <>
      <PageHeader title="Fluxos de tramitação" description="Etapas que cada modalidade de serviço percorre." />
      <Link href="/tramitacao" className="mb-6 inline-block text-sm font-medium text-brand-600 hover:text-brand-700">
        ← Voltar para tramitação
      </Link>
      <div className="mb-6">
        <Alert kind="info">
          Uma etapa por linha, na ordem. Para definir um prazo padrão, acrescente “| dias” (ex.: “Vistoria | 5”). Modalidades com fluxo vazio não aceitam
          projetos novos. As mudanças valem só para projetos criados depois.
        </Alert>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {templates.map((t) => (
          <Card key={t.id} title={t.name} description={`Modalidades: ${t.serviceTypes.join(", ") || "nenhuma"}`}>
            <div className="mb-3">{t.stages.length === 0 ? <Badge kind="warning">Sem etapas definidas</Badge> : <Badge kind="success">{t.stages.length} etapas</Badge>}</div>
            <ActionForm action={saveTemplateAction.bind(null, t.id)} submitLabel="Salvar fluxo" variant="secondary">
              <Field label="Etapas" htmlFor={`stages-${t.id}`}>
                <Textarea
                  id={`stages-${t.id}`}
                  name="stages"
                  rows={Math.max(6, t.stages.length + 1)}
                  defaultValue={t.stages.map((s) => (s.defaultDays === null ? s.name : `${s.name} | ${s.defaultDays}`)).join("\n")}
                  className="font-mono"
                />
              </Field>
            </ActionForm>
          </Card>
        ))}
      </div>
    </>
  );
}
