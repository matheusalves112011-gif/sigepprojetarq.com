-- Histórico de tramitação somente de inserção.
CREATE OR REPLACE FUNCTION historico_bloquear_alteracao() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% aceita somente insercao (operacao % bloqueada)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER stage_transitions_sem_update_delete
  BEFORE UPDATE OR DELETE ON stage_transitions
  FOR EACH ROW EXECUTE FUNCTION historico_bloquear_alteracao();
--> statement-breakpoint
CREATE TRIGGER stage_transitions_sem_truncate
  BEFORE TRUNCATE ON stage_transitions
  FOR EACH STATEMENT EXECUTE FUNCTION historico_bloquear_alteracao();
--> statement-breakpoint
-- Fluxos: o padrão de 14 etapas aprovado e um fluxo vazio por modalidade específica,
-- a ser preenchido pelo administrador em Tramitação > Fluxos.
INSERT INTO workflow_templates (name) VALUES
  ('Fluxo padrão de projetos'), ('Fluxo PPCIP'), ('Fluxo SPDA'), ('Fluxo Laudos'), ('Fluxo Subestações'),
  ('Fluxo Desmembramentos'), ('Fluxo Orçamentos'), ('Fluxo Execução de obras'), ('Fluxo Consultorias');
--> statement-breakpoint
INSERT INTO workflow_template_stages (template_id, position, name, folder_key)
SELECT t.id, s.position, s.name, s.folder_key
FROM workflow_templates t,
  (VALUES
    (1, 'Proposta comercial', '01 - PROPOSTA'),
    (2, 'Contrato', '02 - CONTRATO'),
    (3, 'Levantamento', '03 - LEVANTAMENTO'),
    (4, 'Estudo preliminar', '04 - ESTUDO PRELIMINAR'),
    (5, 'Anteprojeto', '05 - PROJETOS'),
    (6, 'Aprovação do cliente', '09 - APROVAÇÕES'),
    (7, 'Projeto executivo', '05 - PROJETOS'),
    (8, 'Compatibilização', '06 - COMPATIBILIZAÇÃO'),
    (9, 'Orçamento', '07 - ORÇAMENTO'),
    (10, 'ART/RRT', '08 - ART-RRT'),
    (11, 'Aprovação no órgão competente', '09 - APROVAÇÕES'),
    (12, 'Entrega final', '10 - ENTREGA FINAL'),
    (13, 'As Built', '11 - AS BUILT'),
    (14, 'Arquivamento', '12 - ARQUIVAMENTO')
  ) AS s(position, name, folder_key)
WHERE t.name = 'Fluxo padrão de projetos';
--> statement-breakpoint
INSERT INTO service_types (name, workflow_template_id)
SELECT v.name, t.id
FROM (VALUES
    ('Projeto de arquitetura e engenharia', 'Fluxo padrão de projetos'),
    ('PPCIP', 'Fluxo PPCIP'),
    ('SPDA', 'Fluxo SPDA'),
    ('Laudo', 'Fluxo Laudos'),
    ('Subestação', 'Fluxo Subestações'),
    ('Desmembramento', 'Fluxo Desmembramentos'),
    ('Orçamento', 'Fluxo Orçamentos'),
    ('Execução de obra', 'Fluxo Execução de obras'),
    ('Consultoria', 'Fluxo Consultorias')
  ) AS v(name, tpl)
JOIN workflow_templates t ON t.name = v.tpl;
--> statement-breakpoint
INSERT INTO disciplines (name) VALUES
  ('Arquitetura'), ('Estrutural'), ('Elétrica'), ('Hidrossanitário'), ('PPCIP'), ('SPDA');
