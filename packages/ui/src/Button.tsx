import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes } from "react";
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

/** A link that looks like a Button (sign-up and "open app" links). Same sizes and colors; size "lg" is for page heroes; "light" and "outlineLight" are for dark panels. */
const onDark = {
  light: "bg-white border-white text-navy hover:bg-primary-soft",
  outlineLight: "bg-transparent border-white/40 text-white hover:bg-white/10",
} as const;

export function ButtonLink({ variant = "secondary", size = "md", className, ...rest }:
  AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Exclude<ButtonVariant, "danger"> | keyof typeof onDark; size?: "md" | "lg" }) {
  return (
    <a
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-control border font-semibold transition-[background-color,transform] active:scale-[0.98]",
        size === "lg" ? "min-h-13 rounded-card px-7 text-lg" : "min-h-(--control-h) px-4",
        variant in onDark ? onDark[variant as keyof typeof onDark] : variants[variant as ButtonVariant], className,
      )}
      {...rest}
    />
  );
}
