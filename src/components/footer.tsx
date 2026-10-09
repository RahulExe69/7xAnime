"use client";

import React from "react";
import { DiscordLogoIcon, GitHubLogoIcon } from "@radix-ui/react-icons";
import Image from "next/image";
import { usePathname } from "next/navigation";

const Footer = () => {
  const pathname = usePathname();
  if (pathname?.replace(/\\/+$/, "") === "/anime/watch") return null;

  return (
    <footer className="mt-10 flex w-full flex-col items-center space-y-5 border-t border-white/5 bg-[#09090f] p-6 text-center">
      <Image src="/brand/7xanime-mark.svg" alt="logo" width="100" height="100" suppressHydrationWarning />
      <div className="flex space-x-5 items-center">
        <a href="https://github.com/RahulExe69/7xAnime" target="_blank">
            <GitHubLogoIcon suppressHydrationWarning width="25" height="25" />
        </a>
        <a href="https://discord.gg/6yAJ3XDHTt" target="_blank">
            <DiscordLogoIcon suppressHydrationWarning width="25" height="25" />
        </a>
      </div>
      <p className="max-w-xl text-xs leading-relaxed text-zinc-500">
        7xAnime does not store any files on the server, we only link to the
        media which is hosted on 3rd party services.
      </p>
      <p className="text-xs text-zinc-500">&copy; 7xAnime</p>
    </footer>
  );
};

export default Footer;
