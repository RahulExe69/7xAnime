import React from "react";
import { cn } from "@/lib/utils";

type Props = {
  eyebrow?: string;
  title: string;
  icon?: React.ReactNode;
  className?: string;
};

export default function SectionHeading({ eyebrow, title, icon, className }: Props) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {eyebrow ? (
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-400 sm:text-[11px]">
          {eyebrow}
        </span>
      ) : null}
      <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight text-white sm:text-2xl">
        {icon}
        {title}
      </h2>
    </div>
  );
}
