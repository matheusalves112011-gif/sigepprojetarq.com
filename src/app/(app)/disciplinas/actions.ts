"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/lib/action";
import { type FormState, str } from "@/lib/form";
import { createDiscipline, deleteDiscipline, setDisciplineActive } from "@/modules/disciplines/service";

export async function createDisciplineAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act((a, m) => createDiscipline(a, str(fd, "name"), m));
  if (!r.ok) return r.state;
  revalidatePath("/disciplinas");
  return { success: `Disciplina "${r.value.name}" criada.` };
}

export async function disciplineActiveAction(id: string, active: boolean, _prev: FormState): Promise<FormState> {
  const r = await act((a, m) => setDisciplineActive(a, id, active, m));
  if (!r.ok) return r.state;
  revalidatePath("/disciplinas");
  return {};
}

export async function deleteDisciplineAction(id: string, _prev: FormState): Promise<FormState> {
  const r = await act((a, m) => deleteDiscipline(a, id, m));
  if (!r.ok) return r.state;
  revalidatePath("/disciplinas");
  return {};
}
