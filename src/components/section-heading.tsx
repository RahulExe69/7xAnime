import React from "react";
import { cn } from "@/lib/utils";

type Props = { eyebrow?: string; title: string; icon?: React.ReactNode; className?: string };

export default function SectionHeading({ eyebrow, title, icon, className }: Props) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      {eyebrow ? <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#d49aaf] dark:text-[#a39db9] sm:text-[11px]">{eyebrow}</span> : null}
      <h2 className="flex items-center gap-2 text-[21px] font-extrabold leading-tight tracking-[-0.025em] text-[#1a1830] dark:text-white sm:text-2xl">
        {icon ? <span className="shrink-0 text-[#ff3b72]">{icon}</span> : null}
        <span className="min-w-0">{title}</span>
      </h2>
      <span aria-hidden="true" className="mt-1 block h-[2px] w-10 rounded-full bg-gradient-to-r from-[#ff3b72] via-[#ff9fbe]/70 to-transparent" />
    </div>
  );
}