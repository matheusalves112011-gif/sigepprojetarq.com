"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { act, fields } from "@/lib/action";
import type { FormState } from "@/lib/form";
import { createContract, deleteContract, setContractStatus, updateContract } from "@/modules/contracts/service";

const KEYS = ["clientId", "proposalId", "title", "value", "signedAt", "startDate", "endDate", "notes"] as const;

export async function createContractAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act((a, m) => createContract(a, fields(fd, KEYS), m));
  if (!r.ok) return r.state;
  revalidatePath("/contratos");
  redirect(`/contratos/${r.value.id}?aviso=criado`);
}

export async function updateContractAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act((a, m) => updateContract(a, id, fields(fd, KEYS), m));
  if (!r.ok) return r.state;
  revalidatePath("/contratos");
  return { success: "Contrato atualizado." };
}

export async function contractStatusAction(id: string, to: string, _prev: FormState): Promise<FormState> {
  const r = await act((a, m) => setContractStatus(a, id, to, m));
  if (!r.ok) return r.state;
  revalidatePath("/contratos");
  revalidatePath(`/contratos/${id}`);
  return { success: "Situação do contrato atualizada." };
}

export async function deleteContractAction(id: string, _prev: FormState): Promise<FormState> {
  const r = await act((a, m) => deleteContract(a, id, m));
  if (!r.ok) return r.state;
  revalidatePath("/contratos");
  redirect("/contratos?aviso=excluido");
}
