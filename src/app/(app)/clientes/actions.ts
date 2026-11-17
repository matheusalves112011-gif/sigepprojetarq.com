"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { act, fields } from "@/lib/action";
import type { FormState } from "@/lib/form";
import { createClient, deleteClient, restoreClient, updateClient } from "@/modules/clients/service";

const KEYS = ["type", "name", "document", "email", "phone", "contactName", "address", "city", "state", "notes"] as const;

export async function createClientAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act((a, m) => createClient(a, fields(fd, KEYS), m));
  if (!r.ok) return r.state;
  revalidatePath("/clientes");
  redirect(`/clientes/${r.value.id}?aviso=criado`);
}

export async function updateClientAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act((a, m) => updateClient(a, id, fields(fd, KEYS), m));
  if (!r.ok) return r.state;
  revalidatePath("/clientes");
  return { success: "Cliente atualizado." };
}

export async function deleteClientAction(id: string, _prev: FormState): Promise<FormState> {
  const r = await act((a, m) => deleteClient(a, id, m));
  if (!r.ok) return r.state;
  revalidatePath("/clientes");
  redirect("/clientes?aviso=excluido");
}

export async function restoreClientAction(id: string, _prev: FormState): Promise<FormState> {
  const r = await act((a, m) => restoreClient(a, id, m));
  if (!r.ok) return r.state;
  revalidatePath("/clientes");
  redirect(`/clientes/${id}?aviso=restaurado`);
}
