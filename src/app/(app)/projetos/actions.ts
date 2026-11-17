"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { act, fields } from "@/lib/action";
import { type FormState, str } from "@/lib/form";
import { addProjectDiscipline, removeProjectDiscipline, updateProjectDiscipline } from "@/modules/disciplines/service";
import { addMember, createProject, removeMember, setProjectStatus, updateProject } from "@/modules/projects/service";
import { advanceStage, returnStage, setCurrentStageStatus, setStageApplicable, updateStage } from "@/modules/workflow/service";

const COMMON = ["name", "contractId", "location", "description", "dueDate", "responsibleId"] as const;

const refresh = (id: string) => {
  revalidatePath(`/projetos/${id}`);
  revalidatePath("/projetos");
  revalidatePath("/tramitacao");
};

export async function createProjectAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act((a, m) => createProject(a, fields(fd, [...COMMON, "clientId", "serviceTypeId", "startDate"]), m));
  if (!r.ok) return r.state;
  revalidatePath("/projetos");
  redirect(`/projetos/${r.value.id}?aviso=criado`);
}

export async function updateProjectAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act((a, m) => updateProject(a, id, fields(fd, COMMON), m));
  if (!r.ok) return r.state;
  refresh(id);
  return { success: "Projeto atualizado." };
}

export async function projectStatusAction(id: string, to: string, _prev: FormState): Promise<FormState> {
  const r = await act((a, m) => setProjectStatus(a, id, to, m));
  if (!r.ok) return r.state;
  refresh(id);
  return { success: "Situação do projeto atualizada." };
}

export async function addMemberAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act((a, m) => addMember(a, id, str(fd, "userId"), m));
  if (!r.ok) return r.state;
  refresh(id);
  return { success: "Usuário autorizado no projeto." };
}

export async function removeMemberAction(id: string, userId: string, _prev: FormState): Promise<FormState> {
  const r = await act((a, m) => removeMember(a, id, userId, m));
  if (!r.ok) return r.state;
  refresh(id);
  return { success: "Autorização removida." };
}

// ───────────── Tramitação ─────────────

export async function advanceStageAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act((a, m) => advanceStage(a, id, str(fd, "note"), m));
  if (!r.ok) return r.state;
  refresh(id);
  return { success: r.value.completed ? "Última etapa concluída. Projeto concluído." : `Projeto tramitado para a etapa "${r.value.currentStageName}".` };
}

export async function returnStageAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act((a, m) => returnStage(a, id, str(fd, "note"), m));
  if (!r.ok) return r.state;
  refresh(id);
  return { success: `Projeto devolvido para a etapa "${r.value.currentStageName}".` };
}

export async function stageStatusAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act((a, m) => setCurrentStageStatus(a, id, str(fd, "status"), str(fd, "note"), m));
  if (!r.ok) return r.state;
  refresh(id);
  return { success: "Situação da etapa atualizada." };
}

export async function updateStageAction(projectId: string, stageId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act((a, m) => updateStage(a, stageId, fields(fd, ["responsibleId", "dueDate"]), m));
  if (!r.ok) return r.state;
  refresh(projectId);
  return { success: "Etapa atualizada." };
}

export async function stageApplicableAction(projectId: string, stageId: string, applicable: boolean, _prev: FormState): Promise<FormState> {
  const r = await act((a, m) => setStageApplicable(a, stageId, applicable, m));
  if (!r.ok) return r.state;
  refresh(projectId);
  return { success: applicable ? "Etapa reativada." : "Etapa marcada como não aplicável." };
}

// ───────────── Disciplinas do projeto ─────────────

export async function addDisciplineAction(projectId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act((a, m) => addProjectDiscipline(a, projectId, fields(fd, ["disciplineId", "responsibleId"]), m));
  if (!r.ok) return r.state;
  refresh(projectId);
  return { success: "Disciplina incluída no projeto." };
}

export async function updateDisciplineAction(projectId: string, id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act((a, m) => updateProjectDiscipline(a, id, fields(fd, ["responsibleId", "status", "artNumber"]), m));
  if (!r.ok) return r.state;
  refresh(projectId);
  return { success: "Disciplina atualizada." };
}

export async function removeDisciplineAction(projectId: string, id: string, _prev: FormState): Promise<FormState> {
  const r = await act((a, m) => removeProjectDiscipline(a, id, m));
  if (!r.ok) return r.state;
  refresh(projectId);
  return { success: "Disciplina removida do projeto." };
}
