import React from "react";
import Avatar from "./common/avatar";
import { IAuthStore } from "@/store/auth-store";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import Link from "next/link";
import { Bookmark, LogOut, UserRound } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { ROUTES } from "@/constants/routes";

type Props = { auth: IAuthStore };

function NavbarAvatar({ auth }: Props) {
  const [open, setOpen] = React.useState(false);
  if (!auth.auth) return null;

  const logout = () => {
    pb.authStore.clear();
    auth.clearAuth();
    localStorage.removeItem("pocketbase_auth");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Open profile menu" title="Profile" aria-expanded={open}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] p-0 transition hover:border-[#ff2f9d]/50 hover:ring-2 hover:ring-[#ff2f9d]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff2f9d]">
          <Avatar username={auth.auth.username} url={auth.auth.avatar} id={auth.auth.id} collectionID={auth.auth.collectionId} className="h-8 w-8" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="bottom" className="mt-2 w-64 rounded-2xl border border-white/[0.08] bg-[#171421] p-3 text-white shadow-2xl shadow-black/45">
        <div className="flex items-center gap-3 px-1 py-1.5">
          <Avatar username={auth.auth.username} url={auth.auth.avatar} id={auth.auth.id} collectionID={auth.auth.collectionId} className="h-10 w-10 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{auth.auth.username}</p>
            <p className="truncate text-xs text-[#89819d]">Signed in</p>
          </div>
        </div>
        <div className="mt-2 flex flex-col gap-1 border-t border-white/[0.07] pt-2">
          <Link href={ROUTES.profile(auth.auth.username)} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[#d4cfea] transition-colors hover:bg-white/[0.06] hover:text-white">
            <UserRound className="h-4 w-4 text-[#b8a5ff]" /> Profile
          </Link>
          <Link href="/library" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[#d4cfea] transition-colors hover:bg-white/[0.06] hover:text-white">
            <Bookmark className="h-4 w-4 text-[#b8a5ff]" /> My List
          </Link>
          <button type="button" onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[#ff9bb9] transition-colors hover:bg-[#ff2f9d]/10">
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default NavbarAvatar;
