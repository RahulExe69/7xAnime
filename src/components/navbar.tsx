"use client";

import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

import Container from "./container";
import { Separator } from "./ui/separator";

import { nightTokyo } from "@/utils/fonts";
import { ROUTES } from "@/constants/routes";
import React, { ReactNode, useEffect, useState } from "react";

import SearchBar from "./search-bar";
import { MenuIcon, X } from "lucide-react";
import useScrollPosition from "@/hooks/use-scroll-position";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "./ui/sheet";
import LoginPopoverButton from "./login-popover-button";
import { useAuthStore } from "@/store/auth-store";
import { pb } from "@/lib/pocketbase";
import NavbarAvatar from "./navbar-avatar";
import { toast } from "sonner";

const menuItems: Array<{ title: string; href?: string }> = [
  { title: "Home", href: ROUTES.HOME },
  { title: "Browse", href: ROUTES.SEARCH },

];

const NavBar = () => {
  const auth = useAuthStore();
  const { y } = useScrollPosition();
  const isHeaderFixed = true;
  const isHeaderSticky = y > 0;
  useEffect(() => {
    const refreshAuth = async () => {
      const auth_token = JSON.parse(
        localStorage.getItem("pocketbase_auth") as string,
      );
      if (auth_token) {
        try {
          const user = await pb.collection("users").authRefresh();
          if (user) {
            auth.setAuth({
              id: user.record.id,
              email: user.record.email,
              username: user.record.username,
              avatar: user.record.avatar,
              collectionId: user.record.collectionId,
              collectionName: user.record.collectionName,
              autoSkip: user.record.autoSkip,
              created: user.record.created,
            });
          }
        } catch (e) {
          console.error("Auth refresh error:", e);
          localStorage.removeItem("pocketbase_auth");
          auth.clearAuth();
          toast.error("Login session expired.", {
            style: { background: "red" },
          });
        }
      }
    };
    refreshAuth();
  }, []);

  return (
    <div
      className={cn([
        "h-fit w-full",
        "sticky top-0 z-[100] duration-300",
        isHeaderFixed ? "fixed border-b border-white/[0.06] bg-[#09090f]/90 backdrop-blur-xl" : "",
        isHeaderSticky
          ? "shadow-lg shadow-black/10"
          : "",
      ])}
    >
      <Container className="flex flex-col items-stretch gap-2 py-2 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
        <div className="flex w-full items-center justify-between lg:w-auto">
          <Link
            href={ROUTES.HOME}
            className="flex min-w-0 items-center gap-2 cursor-pointer"
          >
            <Image src="/icon.png" alt="7xAnime logo" width={44} height={44} className="h-11 w-11 rounded-xl object-cover" />
            <h1
              className={cn([
                nightTokyo.className,
                "text-xl sm:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white via-violet-200 to-violet-400 tracking-wide",
              ])}
            >7xAnime</h1>
          </Link>

          <div className="flex items-center gap-3 lg:hidden">
            <MobileMenuSheet trigger={<MenuIcon className="h-5 w-5" suppressHydrationWarning />} />
            {auth.auth ? <NavbarAvatar auth={auth} /> : <LoginPopoverButton />}
          </div>
        </div>
        <div className="hidden lg:flex items-center gap-8">
          {menuItems.map((menu, idx) => (
            <Link href={menu.href || "#"} key={idx}>
              {menu.title}
            </Link>
          ))}
        </div>
        <div className="hidden lg:flex w-full max-w-2xl items-center gap-4">
          <SearchBar />
          {auth.auth ? <NavbarAvatar auth={auth} /> : <LoginPopoverButton />}
        </div>
        <div className="px-0 pb-1 lg:hidden">
          <SearchBar className="w-full" />
        </div>
      </Container>
    </div>
  );
};

const MobileMenuSheet = ({ trigger }: { trigger: ReactNode }) => {
  const [open, setOpen] = useState<boolean>(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger>{trigger}</SheetTrigger>
      <SheetContent
        className="flex flex-col w-[80vw] z-[150]"
        hideCloseButton
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="w-full h-full relative">
          <SheetClose className="absolute top-0 right-0">
            <X />
          </SheetClose>
          <div className="flex flex-col gap-5 mt-10">
            {menuItems.map((menu, idx) => (
              <Link
                href={menu.href || "#"}
                key={idx}
                onClick={() => setOpen(false)}
              >
                {menu.title}
              </Link>
            ))}
            <Separator />
            <p className="text-xs text-muted-foreground">Find your next favourite anime.</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default NavBar;
