"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const Footer = () => {
  const pathname = usePathname();
  if (pathname === "/anime/watch" || pathname === "/anime/watch/") return null;

  return (
    <footer className="mt-16 flex w-full flex-col items-center gap-4 border-t border-white/[0.07] bg-[#100309] px-5 py-8 text-center">
      <Link href="/" aria-label="7xAnime home" className="inline-flex">
        <Image src="/brand/7xanime-wordmark.png" alt="7xAnime" width={2107} height={746} className="h-auto w-[190px] object-contain" />
      </Link>
      <p className="max-w-xl text-xs leading-relaxed text-[#bd91a2]">7xAnime links to third-party media sources; streaming files are not hosted by this app.</p>
      <a href="https://github.com/RahulExe69/7xAnime" target="_blank" rel="noreferrer" className="text-xs font-semibold text-[#bdb2f3] transition hover:text-white">Source code</a>
      <p className="text-[11px] text-[#b47e91]">© 7xAnime</p>
    </footer>
  );
};

export default Footer;
