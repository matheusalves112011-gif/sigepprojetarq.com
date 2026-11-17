"use client";

import { type ReactNode, startTransition, useActionState, useEffect, useRef } from "react";
import type { FormState } from "@/lib/form";
import { Alert, type ButtonVariant, buttonClass, cn } from "./ui";

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children?: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  variant?: ButtonVariant;
  className?: string;
  /** Limpa os campos após sucesso (ex.: troca de senha). */
  resetOnSuccess?: boolean;
  /** Texto de confirmação exibido antes de enviar (ações sensíveis). */
  confirm?: string;
  fullWidthButton?: boolean;
};

/**
 * Formulário ligado a uma ação de servidor. Mostra erro ou sucesso devolvidos pela ação
 * e mantém os campos preenchidos quando a validação falha.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Aguarde…",
  variant = "primary",
  className,
  resetOnSuccess,
  confirm,
  fullWidthButton,
}: Props) {
  const [state, dispatch, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={ref}
      className={cn("space-y-4", className)}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const data = new FormData(e.currentTarget);
        startTransition(() => dispatch(data));
      }}
    >
      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      {state.success ? <Alert kind="success">{state.success}</Alert> : null}
      {children}
      <button type="submit" disabled={pending} className={buttonClass(variant, fullWidthButton ? "w-full" : undefined)}>
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
