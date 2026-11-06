'use client';
import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

export type ActionResult = { error?: string; ok?: string } | undefined | void;
type Fn = (prev: unknown, fd: FormData) => Promise<ActionResult>;

const Pending = createContext(false);

export function Submit({ children, className, confirm }: { children: ReactNode; className?: string; confirm?: string }) {
  const status = useFormStatus();
  const busy = useContext(Pending);
  const pending = status.pending || busy;
  return (
    <button type="submit" className={className} disabled={pending}
      onClick={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}>
      {pending ? 'En cours…' : children}
    </button>
  );
}

/** Formulaire relié à une action serveur : affiche réellement l'erreur renvoyée par la base. */
export function ActionForm({ action, children, className = 'grid', resetOnOk }: { action: Fn; children: ReactNode; className?: string; resetOnOk?: boolean }) {
  const [state, run, busy] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state || !(state as { ok?: string }).ok || !ref.current) return;
    if (resetOnOk) ref.current.reset();
    // Évite de renvoyer deux fois les mêmes photos
    ref.current.querySelectorAll<HTMLInputElement>('input[type=file]').forEach((i) => { i.value = ''; });
  }, [state, resetOnOk]);
  // Soumission manuelle : React viderait sinon le formulaire, y compris lorsque le serveur refuse la saisie.
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => run(fd));
  };
  const s = state as { error?: string; ok?: string } | undefined;
  return (
    <Pending.Provider value={busy}>
      <form onSubmit={onSubmit} className={className} ref={ref}>
        {children}
        {s?.error && <p className="notice error span-all" role="alert">{s.error}</p>}
        {s?.ok && <p className="notice ok span-all" role="status">{s.ok}</p>}
      </form>
    </Pending.Provider>
  );
}

export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={`field${wide ? ' span-all' : ''}`}>{label}{children}</label>;
}

/** Bouton d'action seul, avec message de retour. */
export function ActionButton({ action, label, className, confirm, hidden }: { action: Fn; label: string; className?: string; confirm?: string; hidden?: Record<string, string> }) {
  return (
    <ActionForm action={action} className="row">
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Submit className={className} confirm={confirm}>{label}</Submit>
    </ActionForm>
  );
}
