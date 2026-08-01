import type { HTMLAttributes, PropsWithChildren } from "react";

export function Panel({ children, className = "", ...props }: PropsWithChildren<HTMLAttributes<HTMLElement>>) {
  return (
    <section className={`rn-panel ${className}`.trim()} {...props}>
      {children}
    </section>
  );
}
