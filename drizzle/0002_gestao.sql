CREATE TYPE "public"."contract_status" AS ENUM('RASCUNHO', 'VIGENTE', 'ENCERRADO', 'CANCELADO');--> statement-breakpoint
CREATE TYPE "public"."discipline_status" AS ENUM('NAO_INICIADA', 'EM_ANDAMENTO', 'CONCLUIDA');--> statement-breakpoint
CREATE TYPE "public"."person_type" AS ENUM('PF', 'PJ');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('ATIVO', 'PAUSADO', 'CONCLUIDO', 'CANCELADO');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('RASCUNHO', 'ENVIADA', 'ACEITA', 'RECUSADA');--> statement-breakpoint
CREATE TYPE "public"."stage_status" AS ENUM('NAO_INICIADA', 'EM_ANDAMENTO', 'AGUARDANDO_CLIENTE', 'AGUARDANDO_ORGAO', 'CONCLUIDA', 'CANCELADA');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('BAIXA', 'MEDIA', 'ALTA', 'URGENTE');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA');--> statement-breakpoint
CREATE TYPE "public"."transition_kind" AS ENUM('INICIO', 'AVANCO', 'DEVOLUCAO', 'SITUACAO', 'CONCLUSAO');--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "person_type" NOT NULL,
	"name" text NOT NULL,
	"document" text,
	"email" text,
	"phone" text,
	"contact_name" text,
	"address" text,
	"city" text,
	"state" text,
	"notes" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"client_id" uuid NOT NULL,
	"proposal_id" uuid,
	"title" text NOT NULL,
	"value" numeric(14, 2) NOT NULL,
	"signed_at" date,
	"start_date" date,
	"end_date" date,
	"status" "contract_status" DEFAULT 'RASCUNHO' NOT NULL,
	"notes" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_number_unique" UNIQUE("number"),
	CONSTRAINT "contracts_proposal_id_unique" UNIQUE("proposal_id")
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"key" text PRIMARY KEY NOT NULL,
	"value" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disciplines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disciplines_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "project_disciplines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"discipline_id" uuid NOT NULL,
	"responsible_id" uuid,
	"status" "discipline_status" DEFAULT 'NAO_INICIADA' NOT NULL,
	"art_number" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"added_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_members_project_id_user_id_pk" PRIMARY KEY("project_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "project_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"folder_key" text,
	"responsible_id" uuid,
	"due_date" date,
	"status" "stage_status" DEFAULT 'NAO_INICIADA' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"client_id" uuid NOT NULL,
	"contract_id" uuid,
	"service_type_id" uuid NOT NULL,
	"location" text,
	"description" text,
	"status" "project_status" DEFAULT 'ATIVO' NOT NULL,
	"start_date" date NOT NULL,
	"due_date" date,
	"responsible_id" uuid NOT NULL,
	"current_stage_id" uuid,
	"completed_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"client_id" uuid NOT NULL,
	"service_type_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"value" numeric(14, 2) NOT NULL,
	"valid_until" date,
	"status" "proposal_status" DEFAULT 'RASCUNHO' NOT NULL,
	"sent_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposals_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "service_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"workflow_template_id" uuid NOT NULL,
	CONSTRAINT "service_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "stage_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "transition_kind" NOT NULL,
	"from_stage_id" uuid,
	"to_stage_id" uuid,
	"from_status" "stage_status",
	"to_status" "stage_status",
	"note" text,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"stage_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"assignee_id" uuid,
	"due_date" date,
	"priority" "task_priority" DEFAULT 'MEDIA' NOT NULL,
	"status" "task_status" DEFAULT 'PENDENTE' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_template_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"default_days" integer,
	"folder_key" text
);
--> statement-breakpoint
CREATE TABLE "workflow_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_templates_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_disciplines" ADD CONSTRAINT "project_disciplines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_disciplines" ADD CONSTRAINT "project_disciplines_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_disciplines" ADD CONSTRAINT "project_disciplines_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_added_by_id_users_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_stages" ADD CONSTRAINT "project_stages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_stages" ADD CONSTRAINT "project_stages_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_service_type_id_service_types_id_fk" FOREIGN KEY ("service_type_id") REFERENCES "public"."service_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_current_stage_id_project_stages_id_fk" FOREIGN KEY ("current_stage_id") REFERENCES "public"."project_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_service_type_id_service_types_id_fk" FOREIGN KEY ("service_type_id") REFERENCES "public"."service_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_types" ADD CONSTRAINT "service_types_workflow_template_id_workflow_templates_id_fk" FOREIGN KEY ("workflow_template_id") REFERENCES "public"."workflow_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_transitions" ADD CONSTRAINT "stage_transitions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_transitions" ADD CONSTRAINT "stage_transitions_from_stage_id_project_stages_id_fk" FOREIGN KEY ("from_stage_id") REFERENCES "public"."project_stages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_transitions" ADD CONSTRAINT "stage_transitions_to_stage_id_project_stages_id_fk" FOREIGN KEY ("to_stage_id") REFERENCES "public"."project_stages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_transitions" ADD CONSTRAINT "stage_transitions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_stage_id_project_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."project_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_template_stages" ADD CONSTRAINT "workflow_template_stages_template_id_workflow_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workflow_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clients_document_unique" ON "clients" USING btree ("document") WHERE "clients"."document" is not null;--> statement-breakpoint
CREATE INDEX "clients_name_idx" ON "clients" USING btree ("name");--> statement-breakpoint
CREATE INDEX "contracts_client_idx" ON "contracts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "contracts_status_idx" ON "contracts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "project_discipline_unique" ON "project_disciplines" USING btree ("project_id","discipline_id");--> statement-breakpoint
CREATE INDEX "project_members_user_idx" ON "project_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_stage_pos" ON "project_stages" USING btree ("project_id","position");--> statement-breakpoint
CREATE INDEX "project_stages_status_idx" ON "project_stages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "projects_client_idx" ON "projects" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "projects_responsible_idx" ON "projects" USING btree ("responsible_id");--> statement-breakpoint
CREATE INDEX "proposals_client_idx" ON "proposals" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "proposals_status_idx" ON "proposals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "stage_transitions_project_idx" ON "stage_transitions" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "tasks_project_idx" ON "tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "tasks_assignee_idx" ON "tasks" USING btree ("assignee_id","status");--> statement-breakpoint
CREATE INDEX "tasks_due_idx" ON "tasks" USING btree ("due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_template_stage_pos" ON "workflow_template_stages" USING btree ("template_id","position");