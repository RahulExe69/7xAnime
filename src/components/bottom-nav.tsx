"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, House, Search, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";
import { ROUTES } from "@/constants/routes";
import { useAuthStore } from "@/store/auth-store";

export default function BottomNav() {
  const pathname = usePathname();
  const auth = useAuthStore();

  const items = [
    {
      label: "Home",
      icon: House,
      href: ROUTES.HOME,
      active: pathname === ROUTES.HOME,
    },
    {
      label: "Browse",
      icon: Search,
      href: ROUTES.SEARCH,
      active: pathname?.startsWith(ROUTES.SEARCH) ?? false,
    },
    {
      label: "Schedule",
      icon: CalendarDays,
      href: "/#schedule",
      active: false,
    },
  ];

  if (auth.auth?.username) {
    items.push({
      label: "Profile",
      icon: UserRound,
      href: ROUTES.profile(auth.auth.username),
      active: pathname?.startsWith(ROUTES.PROFILE) ?? false,
    });
  }

  return (
    <nav
      aria-label="Primary mobile navigation"
      className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-[120] flex justify-center px-4 lg:hidden"
    >
      <div className="flex max-w-full items-center gap-1 rounded-full border border-white/10 bg-[#101014]/90 px-2 py-2 shadow-2xl shadow-black/40 backdrop-blur-xl">
        {items.map(({ label, icon: Icon, href, active }) => (
          <Link
            key={label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-w-[4rem] flex-col items-center gap-1 rounded-full px-3 py-2 text-[10px] font-medium transition-colors duration-150 sm:min-w-[4.75rem]",
              active
                ? "bg-violet-500/10 text-violet-300"
                : "text-zinc-400 hover:bg-white/5 hover:text-white",
            )}
          >
            <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
            <span>{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
