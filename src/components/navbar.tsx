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
            <Image src="/brand/7xanime-lockup.svg" alt="7xAnime" width={188} height={48} unoptimized className="h-9 w-[132px] object-contain sm:h-10 sm:w-[150px] lg:h-11 lg:w-[174px]" />
          </Link>
          <nav className="hidden items-center gap-5 text-sm font-semibold lg:flex">{menuItems.map((item) => <Link key={item.title} href={item.href} className="transition hover:text-[#ff2f9d] dark:hover:text-[#ff8bc8]">{item.title}</Link>)}</nav>
          <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2 lg:gap-2.5">

            <button type="button" onClick={openRandomAnime} disabled={randomLoading} aria-label="Surprise me with a random anime" title="Random anime" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl transition hover:bg-[#efedf7] hover:text-[#ff2f9d] disabled:opacity-50 dark:hover:bg-white/5 dark:hover:text-[#ff8bc8]"><Shuffle className={`h-[21px] w-[21px] ${randomLoading ? "animate-pulse" : ""}`} /></button>
            <button type="button" onClick={() => setSearchOpen(true)} aria-label="Search anime" title="Search anime" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl transition hover:bg-[#efedf7] hover:text-[#ff2f9d] dark:hover:bg-white/5 dark:hover:text-[#ff8bc8]"><Search className="h-[22px] w-[22px]" /></button>
            {auth.auth ? <NavbarAvatar auth={auth} /> : <div className="flex h-9 items-center justify-center rounded-full bg-[#7563d8]/15 px-1 text-sm font-bold text-[#5f4acb] dark:bg-[#7563d8]/20 dark:text-[#c2b7ff]"><LoginPopoverButton /></div>}
          </div>
        </Container>
      </header>
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
