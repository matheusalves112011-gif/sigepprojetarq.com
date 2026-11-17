"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/lib/action";
import { type FormState, str } from "@/lib/form";
import { parseStageLines, updateTemplateStages } from "@/modules/workflow/service";

export async function saveTemplateAction(templateId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act(async (a, m) => {
    const stages = parseStageLines(str(fd, "stages"));
    await updateTemplateStages(a, templateId, stages, m);
    return stages.length;
  });
  if (!r.ok) return r.state;
  revalidatePath("/tramitacao/fluxos");
  return { success: `Fluxo salvo com ${r.value} etapa(s). Vale para os próximos projetos; os existentes não mudam.` };
}
