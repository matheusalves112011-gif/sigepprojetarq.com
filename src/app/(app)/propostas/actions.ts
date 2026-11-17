"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { act, fields } from "@/lib/action";
import type { FormState } from "@/lib/form";
import { createProposal, deleteProposal, setProposalStatus, updateProposal } from "@/modules/proposals/service";

const KEYS = ["clientId", "serviceTypeId", "title", "description", "value", "validUntil"] as const;

export async function createProposalAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act((a, m) => createProposal(a, fields(fd, KEYS), m));
  if (!r.ok) return r.state;
  revalidatePath("/propostas");
  redirect(`/propostas/${r.value.id}?aviso=criada`);
}

export async function updateProposalAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act((a, m) => updateProposal(a, id, fields(fd, KEYS), m));
  if (!r.ok) return r.state;
  revalidatePath("/propostas");
  return { success: "Proposta atualizada." };
}

export async function proposalStatusAction(id: string, to: string, _prev: FormState): Promise<FormState> {
  const r = await act((a, m) => setProposalStatus(a, id, to, m));
  if (!r.ok) return r.state;
  revalidatePath("/propostas");
  revalidatePath(`/propostas/${id}`);
  return { success: "Situação da proposta atualizada." };
}

export async function deleteProposalAction(id: string, _prev: FormState): Promise<FormState> {
  const r = await act((a, m) => deleteProposal(a, id, m));
  if (!r.ok) return r.state;
  revalidatePath("/propostas");
  redirect("/propostas?aviso=excluida");
}
