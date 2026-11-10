import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "./cn";

interface FieldShellProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  id: string;
  children: ReactNode;
}

function FieldShell({ label, hint, error, id, children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold text-ink-2">{label}</label>
      {children}
      {error ? (
        <span id={`${id}-msg`} className="text-xs text-danger-ink">{error}</span>
      ) : hint ? (
        <span id={`${id}-msg`} className="text-xs text-muted">{hint}</span>
      ) : null}
    </div>
  );
}

const control =
  "h-(--control-h) w-full rounded-control border bg-surface px-3 text-ink placeholder:text-muted disabled:bg-ground disabled:text-muted";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  hint?: ReactNode;
  error?: string;
  id?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, id, className, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell label={label} hint={hint} error={error} id={fid}>
      <input
        ref={ref}
        id={fid}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${fid}-msg` : undefined}
        className={cn(control, error ? "border-danger" : "border-line-strong", className)}
        {...rest}
      />
    </FieldShell>
  );
});

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  label: string;
  hint?: ReactNode;
  error?: string;
  id?: string;
}

/** Native select: best keyboard, screen reader and phone behaviour for a business tool. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, id, className, children, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell label={label} hint={hint} error={error} id={fid}>
      <div className="relative">
        <select
          ref={ref}
          id={fid}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${fid}-msg` : undefined}
          className={cn(control, "appearance-none pe-9", error ? "border-danger" : "border-line-strong", className)}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
      </div>
    </FieldShell>
  );
});
