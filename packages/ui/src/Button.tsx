import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import {FeedbackButton} from './FeedbackButton.js';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "gold" | "quiet" | "danger";
}

export function Button({ children, className = "", variant = "gold", onClick, ...props }: PropsWithChildren<ButtonProps>) {
  return (
    <FeedbackButton className={`rn-button rn-button--${variant} ${className}`.trim()} {...props} onClick={onClick}>
      {children}
    </FeedbackButton>
  );
}
