"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { act, fields } from "@/lib/action";
import type { FormState } from "@/lib/form";
import { createTask, deleteTask, setTaskStatus, updateTask } from "@/modules/tasks/service";

const KEYS = ["stageId", "title", "description", "assigneeId", "dueDate", "priority"] as const;

export async function createTaskAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act((a, m) => createTask(a, fields(fd, ["projectId", ...KEYS]), m));
  if (!r.ok) return r.state;
  revalidatePath("/tarefas");
  redirect(`/tarefas/${r.value.id}?aviso=criada`);
}

export async function updateTaskAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act((a, m) => updateTask(a, id, fields(fd, KEYS), m));
  if (!r.ok) return r.state;
  revalidatePath("/tarefas");
  return { success: "Tarefa atualizada." };
}

export async function taskStatusAction(id: string, to: string, _prev: FormState): Promise<FormState> {
  const r = await act((a, m) => setTaskStatus(a, id, to, m));
  if (!r.ok) return r.state;
  revalidatePath("/tarefas");
  revalidatePath(`/tarefas/${id}`);
  return { success: "Situação da tarefa atualizada." };
}

export async function deleteTaskAction(id: string, _prev: FormState): Promise<FormState> {
  const r = await act((a, m) => deleteTask(a, id, m));
  if (!r.ok) return r.state;
  revalidatePath("/tarefas");
  redirect("/tarefas?aviso=excluida");
}
