import { Field, Input, Select, Textarea } from "@/components/ui";
import { moneyInput } from "@/lib/money";

type Option = { id: string; name: string };
type ProposalOption = { id: string; number: string; title: string; clientName: string };
type Values = {
  clientId: string;
  proposalId: string | null;
  title: string;
  value: string | null;
  signedAt: string | null;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
};

export function ContractFields({ clients, proposals, values, hideValue }: { clients: Option[]; proposals: ProposalOption[]; values?: Partial<Values>; hideValue?: boolean }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Cliente" htmlFor="clientId">
          <Select id="clientId" name="clientId" defaultValue={values?.clientId ?? ""} required>
            <option value="">Selecione…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Proposta de origem" htmlFor="proposalId" hint="Opcional. Só propostas aceitas e ainda sem contrato.">
          <Select id="proposalId" name="proposalId" defaultValue={values?.proposalId ?? ""}>
            <option value="">Sem proposta</option>
            {proposals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.number} · {p.clientName} · {p.title}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Objeto do contrato" htmlFor="title">
        <Input id="title" name="title" defaultValue={values?.title} required maxLength={200} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Valor contratado (R$)" htmlFor="value">
          <Input id="value" name="value" inputMode="decimal" defaultValue={moneyInput(values?.value)} placeholder={hideValue ? "Sem permissão para ver valores" : "12.500,00"} required />
        </Field>
        <Field label="Assinatura" htmlFor="signedAt">
          <Input id="signedAt" name="signedAt" type="date" defaultValue={values?.signedAt ?? ""} />
        </Field>
        <Field label="Início da vigência" htmlFor="startDate">
          <Input id="startDate" name="startDate" type="date" defaultValue={values?.startDate ?? ""} />
        </Field>
        <Field label="Fim da vigência" htmlFor="endDate">
          <Input id="endDate" name="endDate" type="date" defaultValue={values?.endDate ?? ""} />
        </Field>
      </div>
      <Field label="Observações" htmlFor="notes">
        <Textarea id="notes" name="notes" defaultValue={values?.notes ?? ""} maxLength={5000} />
      </Field>
    </>
  );
}
