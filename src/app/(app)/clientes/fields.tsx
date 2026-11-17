import { Field, Input, Select, Textarea } from "@/components/ui";
import type { Client } from "@/db/schema";
import { formatDocument } from "@/lib/documents";

export function ClientFields({ client }: { client?: Client }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Tipo" htmlFor="type">
          <Select id="type" name="type" defaultValue={client?.type ?? "PJ"}>
            <option value="PJ">Pessoa jurídica</option>
            <option value="PF">Pessoa física</option>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Nome ou razão social" htmlFor="name">
            <Input id="name" name="name" defaultValue={client?.name} required maxLength={160} />
          </Field>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="CPF ou CNPJ" htmlFor="document" hint="Opcional. Os dígitos verificadores são conferidos.">
          <Input id="document" name="document" defaultValue={client?.document ? formatDocument(client.document) : ""} maxLength={20} />
        </Field>
        <Field label="Pessoa de contato" htmlFor="contactName">
          <Input id="contactName" name="contactName" defaultValue={client?.contactName ?? ""} maxLength={120} />
        </Field>
        <Field label="E-mail" htmlFor="email">
          <Input id="email" name="email" type="email" defaultValue={client?.email ?? ""} />
        </Field>
        <Field label="Telefone" htmlFor="phone">
          <Input id="phone" name="phone" defaultValue={client?.phone ?? ""} maxLength={30} />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
        <div className="sm:col-span-3">
          <Field label="Endereço" htmlFor="address">
            <Input id="address" name="address" defaultValue={client?.address ?? ""} maxLength={240} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Cidade" htmlFor="city">
            <Input id="city" name="city" defaultValue={client?.city ?? ""} maxLength={80} />
          </Field>
        </div>
        <Field label="UF" htmlFor="state">
          <Input id="state" name="state" defaultValue={client?.state ?? ""} maxLength={2} />
        </Field>
      </div>
      <Field label="Observações" htmlFor="notes">
        <Textarea id="notes" name="notes" defaultValue={client?.notes ?? ""} maxLength={2000} />
      </Field>
    </>
  );
}
