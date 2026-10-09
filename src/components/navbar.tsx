"use client";

import Link from "next/link";
import Image from "next/image";
import React, { useEffect, useState } from "react";
import { Search, Shuffle } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

import Container from "./container";
import { ROUTES } from "@/constants/routes";
import { api, isLocalBackendEnabled } from "@/lib/api";
import { MediaList, PaginatedResponse } from "@/types/miruro-api";
import { useAuthStore } from "@/store/auth-store";
import LoginPopoverButton from "./login-popover-button";
import NavbarAvatar from "./navbar-avatar";
import { pb } from "@/lib/pocketbase";
import SearchOverlay from "./search-overlay";

const menuItems = [
  { title: "Home", href: ROUTES.HOME },
  { title: "Trending", href: "/#trending" },
  { title: "Schedule", href: "/#schedule" },
  { title: "Browse", href: ROUTES.SEARCH },
];

export default function NavBar() {
  const pathname = usePathname() || ROUTES.HOME;
  const router = useRouter();
  const auth = useAuthStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const [randomLoading, setRandomLoading] = useState(false);

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

  const openRandomAnime = async () => {
    if (randomLoading) return;
    setRandomLoading(true);
    try {
      const response = await api.get<PaginatedResponse<MediaList>>("/trending", { params: { page: 1, per_page: 30 }, timeout: 12000 });
      const options = (response.data.results || []).filter((item) => !item.isAdult && item.id);
      if (!options.length) throw new Error("No anime available to randomize");
      const selected = options[Math.floor(Math.random() * options.length)];
      router.push(ROUTES.animeDetails(selected.id));
    } catch {
      toast.error("Could not load a random anime. Try again in a moment.");
    } finally { setRandomLoading(false); }
  };

  if (pathname === ROUTES.WATCH || pathname === `${ROUTES.WATCH}/`) return null;

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-[100] border-b border-[#e2deee] bg-white/90 text-[#5d5874] shadow-[0_2px_12px_rgba(40,28,80,0.025)] backdrop-blur-xl dark:border-[#2a2738] dark:bg-[#13111b]/90 dark:text-[#c0bad7]">
        <Container className="flex h-[62px] items-center justify-between gap-3 px-3 sm:px-5 lg:h-[72px] lg:gap-6">
          <Link href={ROUTES.HOME} aria-label="7xAnime home" className="flex shrink-0 items-center gap-2">
            <Image src="/brand/7xanime-mark.svg" alt="" width={38} height={38} unoptimized className="h-9 w-9 rounded-xl object-cover lg:hidden" />
            <Image src="/brand/7xanime-lockup.svg" alt="7xAnime" width={188} height={48} unoptimized className="hidden h-11 w-[174px] object-contain lg:block" />
          </Link>
          <nav className="hidden items-center gap-5 text-sm font-semibold lg:flex">{menuItems.map((item) => <Link key={item.title} href={item.href} className="transition hover:text-[#604bd3] dark:hover:text-[#b7aaff]">{item.title}</Link>)}</nav>
          <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2 lg:gap-2.5">
            {auth.auth ? <NavbarAvatar auth={auth} /> : <div className="flex h-9 items-center justify-center rounded-full bg-[#7563d8]/15 px-1 text-sm font-bold text-[#5f4acb] dark:bg-[#7563d8]/20 dark:text-[#c2b7ff]"><LoginPopoverButton /></div>}
            <a href="https://discord.gg/6yAJ3XDHTt" target="_blank" rel="noreferrer" aria-label="Join 7xAnime Discord" title="Discord" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#5865f2] text-white shadow-sm transition hover:bg-[#4752d8]">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true"><path d="M19.7 5.4a18.5 18.5 0 0 0-4.6-1.4l-.6 1.2a17 17 0 0 0-5 0L8.9 4a18.5 18.5 0 0 0-4.6 1.4C1.4 9.7.6 13.9 1 18a18.7 18.7 0 0 0 5.6 2.8l1.2-2a11.8 11.8 0 0 1-1.9-.9l.5-.4a13.3 13.3 0 0 0 11.2 0l.5.4a11.8 11.8 0 0 1-1.9.9l1.2 2A18.7 18.7 0 0 0 23 18c.5-4.8-.8-8.9-3.3-12.6ZM8.8 15.3c-1.1 0-2-1-2-2.2s.9-2.2 2-2.2 2 1 2 2.2-.9 2.2-2 2.2Zm6.4 0c-1.1 0-2-1-2-2.2s.9-2.2 2-2.2 2 1 2 2.2-.9 2.2-2 2.2Z"/></svg>
            </a>
            <button type="button" onClick={openRandomAnime} disabled={randomLoading} aria-label="Surprise me with a random anime" title="Random anime" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl transition hover:bg-[#efedf7] hover:text-[#604bd3] disabled:opacity-50 dark:hover:bg-white/5 dark:hover:text-[#b7aaff]"><Shuffle className={`h-[21px] w-[21px] ${randomLoading ? "animate-pulse" : ""}`} /></button>
            <button type="button" onClick={() => setSearchOpen(true)} aria-label="Search anime" title="Search anime" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl transition hover:bg-[#efedf7] hover:text-[#604bd3] dark:hover:bg-white/5 dark:hover:text-[#b7aaff]"><Search className="h-[22px] w-[22px]" /></button>
          </div>
        </Container>
      </header>
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
