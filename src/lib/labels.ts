import type { ContractStatus, ProjectStatus, ProposalStatus, StageStatus, TaskPriority, TaskStatus } from "@/db/schema";

type Kind = "neutral" | "brand" | "success" | "danger" | "warning";
type Def = { label: string; kind: Kind };

export const PROPOSAL_STATUS: Record<ProposalStatus, Def> = {
  RASCUNHO: { label: "Rascunho", kind: "neutral" },
  ENVIADA: { label: "Enviada", kind: "brand" },
  ACEITA: { label: "Aceita", kind: "success" },
  RECUSADA: { label: "Recusada", kind: "danger" },
};
export const CONTRACT_STATUS: Record<ContractStatus, Def> = {
  RASCUNHO: { label: "Rascunho", kind: "neutral" },
  VIGENTE: { label: "Vigente", kind: "success" },
  ENCERRADO: { label: "Encerrado", kind: "brand" },
  CANCELADO: { label: "Cancelado", kind: "danger" },
};
export const PROJECT_STATUS: Record<ProjectStatus, Def> = {
  ATIVO: { label: "Ativo", kind: "success" },
  PAUSADO: { label: "Pausado", kind: "warning" },
  CONCLUIDO: { label: "Concluído", kind: "brand" },
  CANCELADO: { label: "Cancelado", kind: "danger" },
};
export const STAGE_STATUS: Record<StageStatus, Def> = {
  NAO_INICIADA: { label: "Não iniciada", kind: "neutral" },
  EM_ANDAMENTO: { label: "Em andamento", kind: "brand" },
  AGUARDANDO_CLIENTE: { label: "Aguardando cliente", kind: "warning" },
  AGUARDANDO_ORGAO: { label: "Aguardando órgão público", kind: "warning" },
  CONCLUIDA: { label: "Concluída", kind: "success" },
  CANCELADA: { label: "Não se aplica", kind: "neutral" },
};
export const TASK_STATUS: Record<TaskStatus, Def> = {
  PENDENTE: { label: "Pendente", kind: "neutral" },
  EM_ANDAMENTO: { label: "Em andamento", kind: "brand" },
  CONCLUIDA: { label: "Concluída", kind: "success" },
  CANCELADA: { label: "Cancelada", kind: "danger" },
};
export const TASK_PRIORITY: Record<TaskPriority, Def> = {
  BAIXA: { label: "Baixa", kind: "neutral" },
  MEDIA: { label: "Média", kind: "neutral" },
  ALTA: { label: "Alta", kind: "warning" },
  URGENTE: { label: "Urgente", kind: "danger" },
};
export const DISCIPLINE_STATUS = {
  NAO_INICIADA: { label: "Não iniciada", kind: "neutral" },
  EM_ANDAMENTO: { label: "Em andamento", kind: "brand" },
  CONCLUIDA: { label: "Concluída", kind: "success" },
} as const satisfies Record<string, Def>;
export const TRANSITION_KIND = {
  INICIO: "Início do fluxo",
  AVANCO: "Avanço de etapa",
  DEVOLUCAO: "Devolução à etapa anterior",
  SITUACAO: "Mudança de situação",
  CONCLUSAO: "Conclusão do fluxo",
} as const;
