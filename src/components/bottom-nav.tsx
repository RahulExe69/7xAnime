"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, CalendarDays, House, LayoutGrid, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/constants/routes";

const items = [
  { label: "Home", icon: House, href: ROUTES.HOME, active: (path: string) => path === ROUTES.HOME },
  { label: "Browse", icon: LayoutGrid, href: ROUTES.SEARCH, active: (path: string) => path.startsWith(ROUTES.SEARCH) },
  { label: "Top", icon: Trophy, href: "/#trending", active: () => false },
  { label: "Schedule", icon: CalendarDays, href: "/#schedule", active: (path: string) => path.startsWith("/schedule") },
  { label: "My List", icon: Bookmark, href: "/library", active: (path: string) => path.startsWith("/library") },
];

export default function BottomNav() {
  const pathname = usePathname() || ROUTES.HOME;
  if (pathname.replace(/\/$/, "") === ROUTES.WATCH) return null;

  return (
    <nav aria-label="Primary mobile navigation" className="fixed inset-x-0 bottom-0 z-[120] border-t border-[#dedbea] bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-3px_16px_rgba(48,36,90,0.035)] backdrop-blur-xl dark:border-[#2a2738] dark:bg-[#12111a]/95 lg:hidden">
      <div className="mx-auto grid min-h-[66px] max-w-[620px] grid-cols-5">
        {items.map(({ label, icon: Icon, href, active }) => {
          const selected = active(pathname);
          return (
            <Link key={label} href={href} aria-current={selected ? "page" : undefined} className={cn("flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-semibold leading-tight transition-colors sm:text-xs", selected ? "text-[#604bd3] dark:text-[#b5a8ff]" : "text-[#68637e] hover:text-[#604bd3] dark:text-[#aaa5c0] dark:hover:text-[#c7bdff]")}>
              <Icon className={cn("h-[21px] w-[21px] sm:h-6 sm:w-6", selected && "stroke-[2.5]")} aria-hidden="true" />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
