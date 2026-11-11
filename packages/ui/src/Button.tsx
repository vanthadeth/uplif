import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary border-primary text-white hover:bg-primary-hover",
  secondary: "bg-surface border-line-strong text-ink hover:bg-ground",
  quiet: "bg-transparent border-transparent text-link hover:bg-primary-soft",
  danger: "bg-danger border-danger text-white hover:bg-danger-hover",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", loading, disabled, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex min-h-(--control-h) items-center justify-center gap-2 rounded-control border px-4 font-semibold transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-[uplif-spin_0.8s_linear_infinite]" aria-hidden="true" />}
      {children}
    </button>
  );
});
