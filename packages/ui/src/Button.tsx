import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "gold" | "quiet" | "danger";
}

export function Button({ children, className = "", variant = "gold", ...props }: PropsWithChildren<ButtonProps>) {
  return (
    <button className={`rn-button rn-button--${variant} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}
