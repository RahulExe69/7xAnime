"use client";

import Link from "next/link";
import Image from "next/image";
import React, { useEffect, useState } from "react";
import { Bookmark, Compass, Home, Menu, Search, X } from "lucide-react";
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
  { title: "Home", href: ROUTES.HOME },
  { title: "Explore", href: ROUTES.SEARCH },
  { title: "My List", href: "/library" },
];

export default function NavBar() {
  const pathname = usePathname() || ROUTES.HOME;
  const auth = useAuthStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  useEffect(() => { setMobileMenuOpen(false); }, [pathname]);

  if (pathname === ROUTES.WATCH || pathname === `${ROUTES.WATCH}/`) return null;

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-[100] border-b border-white/[0.07] bg-[#100e19]/95 text-[#d4cfea] shadow-[0_6px_24px_rgba(0,0,0,0.18)] backdrop-blur-xl">
        <Container className="flex h-[62px] items-center justify-between gap-3 px-3 sm:px-5 lg:h-[72px] lg:gap-6">
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            <div className="relative lg:hidden">
              <button type="button" aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={mobileMenuOpen} title="Navigation"
                onClick={() => setMobileMenuOpen((open) => !open)}
                className="grid h-9 w-9 place-items-center rounded-xl text-[#bdb5d6] transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff2f9d]">
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              {mobileMenuOpen && (
                <nav aria-label="Mobile navigation" className="absolute left-0 top-[calc(100%+0.65rem)] z-[120] w-56 rounded-2xl border border-white/[0.08] bg-[#171421] p-2 shadow-2xl shadow-black/40">
                  {menuItems.map((item) => (
                    <Link key={item.title} href={item.href} onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-colors hover:bg-white/[0.06] hover:text-white ${(item.href === ROUTES.HOME ? pathname === ROUTES.HOME : pathname.startsWith(item.href)) ? "bg-[#ff2f9d]/10 text-[#ff9acb]" : "text-[#c6bfd8]"}`}>
                      {item.title === "Home" ? <Home className="h-4 w-4" /> : item.title === "Explore" ? <Compass className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                      <span>{item.title}</span>
                    </Link>
                  ))}
                </nav>
              )}
            </div>
            <Link href={ROUTES.HOME} aria-label="7xAnime home" className="flex shrink-0 items-center gap-2">
              <Image src="/brand/7xanime-lockup.svg" alt="7xAnime" width={188} height={48} unoptimized className="h-9 w-[142px] object-contain object-left sm:w-[168px] lg:h-11 lg:w-[190px]" />
            </Link>
          </div>
          <nav className="hidden items-center gap-5 text-sm font-semibold lg:flex">{menuItems.map((item) => <Link key={item.title} href={item.href} className="transition hover:text-[#ff2f9d] dark:hover:text-[#ff8bc8]">{item.title}</Link>)}</nav>
          <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2 lg:gap-2.5">
            <button type="button" onClick={() => setSearchOpen(true)} aria-label="Search anime" title="Search anime" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[#bdb5d6] transition-colors hover:bg-white/[0.07] hover:text-white"><Search className="h-[22px] w-[22px]" /></button>
            {auth.auth ? <NavbarAvatar auth={auth} /> : <LoginPopoverButton />}
          </div>
        </Container>
      </header>
      {searchOpen && <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />}
    </>
  );
}
