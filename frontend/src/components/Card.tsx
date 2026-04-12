import { ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}

export default function Card({ children, className = "", hover = false }: Props) {
  return (
    <div
      className={`bg-bg-card border border-border p-5 ${
        hover ? "hover:border-border-bright hover:bg-bg-card-hover transition-colors cursor-pointer" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}
