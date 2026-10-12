"use client";

import Link from "next/link";
import Image from "next/image";
import React, { useEffect, useState } from "react";
import { Bookmark, Compass, Home, Search, Settings } from "lucide-react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";

import Container from "./container";
import { ROUTES } from "@/constants/routes";
import { isLocalBackendEnabled } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import LoginPopoverButton from "./login-popover-button";
import NavbarAvatar from "./navbar-avatar";
import { pb } from "@/lib/pocketbase";
import SearchOverlay from "./search-overlay";

const menuItems = [
  { title: "Home", href: ROUTES.HOME, icon: Home },
  { title: "Explore", href: ROUTES.SEARCH, icon: Compass },
  { title: "My List", href: "/library", icon: Bookmark },
  { title: "Settings", href: "/settings", icon: Settings },
];

export default function NavBar() {
  const pathname = usePathname() || ROUTES.HOME;
  const auth = useAuthStore();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const refreshAuth = async () => {
      if (isLocalBackendEnabled()) {
        auth.clearAuth();
        pb.authStore.clear();
        localStorage.removeItem("pocketbase_auth");
        return;
      }
      let authToken: any = null;
      try { authToken = JSON.parse(localStorage.getItem("pocketbase_auth") || "null"); }
      catch { localStorage.removeItem("pocketbase_auth"); }
      if (!authToken) return;
      try {
        const user = await pb.collection("users").authRefresh();
        if (!user) return;
        auth.setAuth({
          id: user.record.id, email: user.record.email, username: user.record.username,
          avatar: user.record.avatar, collectionId: user.record.collectionId,
          collectionName: user.record.collectionName, autoSkip: user.record.autoSkip,
          created: user.record.created,
        });
      } catch (error) {
        console.warn("Auth refresh error:", error);
        localStorage.removeItem("pocketbase_auth");
        auth.clearAuth();
        toast.error("Login session expired.");
      }
    };
    void refreshAuth();
  }, []);


  if (pathname === ROUTES.WATCH || pathname === `${ROUTES.WATCH}/`) return null;

  const isActive = (href: string) =>
    href === ROUTES.HOME
      ? pathname === ROUTES.HOME
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-[100] border-b border-white/[0.07] bg-[#100309]/95 text-[#ffeaf0] shadow-[0_6px_24px_rgba(0,0,0,0.18)] backdrop-blur-xl">
        <Container className="flex flex-col gap-1 px-3 py-1.5 sm:px-5 lg:h-[72px] lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:py-0">
          <div className="flex h-[43px] min-w-0 items-center justify-between gap-2 lg:contents">
            <Link href={ROUTES.HOME} aria-label="7xAnime home" className="flex min-w-0 shrink-0 items-center">
              <Image src="/brand/7xanime-wordmark.png" alt="7xAnime" width={2107} height={746} className="h-10 w-[122px] object-contain object-left sm:h-11 sm:w-[134px] lg:h-12 lg:w-[146px]" />
            </Link>
            <nav aria-label="Primary navigation" className="hidden items-center gap-5 text-sm font-semibold lg:flex">
              {menuItems.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link key={item.title} href={item.href} aria-current={active ? "page" : undefined}
                    className={`rounded-lg px-1 py-2 transition-colors hover:text-[#ff9fbe] ${active ? "text-[#ff9fbe]" : "text-[#ffeaf0]"}`}>
                    {item.title}
                  </Link>
                );
              })}
            </nav>
            <div className="ml-auto flex shrink-0 items-center justify-end gap-1.5 sm:gap-2 lg:ml-0 lg:gap-2.5">
              <button type="button" onClick={() => setSearchOpen(true)} aria-label="Search anime" title="Search anime" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[#d7a6b7] transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff3b72]"><Search className="h-[22px] w-[22px]" /></button>
              {auth.auth ? <NavbarAvatar auth={auth} /> : <LoginPopoverButton />}
            </div>
          </div>
          <nav aria-label="Mobile navigation" className="flex h-8 w-full items-stretch justify-between gap-1 lg:hidden">
            {menuItems.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link key={item.title} href={item.href} aria-current={active ? "page" : undefined}
                  className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff3b72] ${active ? "bg-[#ff3b72]/10 text-[#ffbad0]" : "text-[#c6aeb8] hover:bg-white/[0.05] hover:text-white"}`}>
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.title}</span>
                </Link>
              );
            })}
          </nav>
        </Container>
      </header>
      {searchOpen && <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />}
    </>
  );
}
