"use client";

import React from "react";
import { usePathname } from "next/navigation";

const Footer = () => {
  const pathname = usePathname();
  if (pathname === "/anime/watch" || pathname === "/anime/watch/") return null;

  return (
    <footer className="mt-8 flex w-full justify-center border-t border-white/[0.06] bg-[#100309] px-4 py-3 text-center">
      <p className="text-[10px] text-[#7d5160]">© 7xAnime</p>
    </footer>
  );
};

export default Footer;
