-- Auditoria somente de inserção: nenhum usuário da aplicação altera ou apaga o histórico.
CREATE OR REPLACE FUNCTION audit_logs_bloquear_alteracao() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs aceita somente insercao (operacao % bloqueada)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_logs_sem_update_delete
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_bloquear_alteracao();
--> statement-breakpoint
CREATE TRIGGER audit_logs_sem_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_bloquear_alteracao();
