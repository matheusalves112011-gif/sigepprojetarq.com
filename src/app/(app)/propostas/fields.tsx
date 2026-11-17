import { Field, Input, Select, Textarea } from "@/components/ui";
import { moneyInput } from "@/lib/money";

type Option = { id: string; name: string };
type Values = { clientId: string; serviceTypeId: string; title: string; description: string | null; value: string | null; validUntil: string | null };

export function ProposalFields({ clients, serviceTypes, values, clientId }: { clients: Option[]; serviceTypes: Option[]; values?: Values; clientId?: string }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Cliente" htmlFor="clientId">
          <Select id="clientId" name="clientId" defaultValue={values?.clientId ?? clientId ?? ""} required>
            <option value="">Selecione…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Modalidade" htmlFor="serviceTypeId">
          <Select id="serviceTypeId" name="serviceTypeId" defaultValue={values?.serviceTypeId ?? ""} required>
            <option value="">Selecione…</option>
            {serviceTypes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Objeto da proposta" htmlFor="title">
        <Input id="title" name="title" defaultValue={values?.title} required maxLength={200} />
      </Field>
      <Field label="Descrição e escopo" htmlFor="description">
        <Textarea id="description" name="description" rows={5} defaultValue={values?.description ?? ""} maxLength={5000} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Valor (R$)" htmlFor="value" hint="Formato: 12.500,00">
          <Input id="value" name="value" inputMode="decimal" defaultValue={moneyInput(values?.value)} placeholder={values && values.value === null ? "Sem permissão para ver valores" : undefined} required />
        </Field>
        <Field label="Válida até" htmlFor="validUntil">
          <Input id="validUntil" name="validUntil" type="date" defaultValue={values?.validUntil ?? ""} />
        </Field>
      </div>
    </>
  );
}
