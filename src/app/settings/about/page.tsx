import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Container from "@/components/container";

const MASTER_ICON =
  "https://raw.githubusercontent.com/RahulExe69/7x/main/brand/assets/icon.png";
const PROFILE_IMAGE = "https://avatars.githubusercontent.com/u/203097752?v=4";

export default function AboutPage() {
  return (
    <Container className="min-h-[75vh] space-y-5 pb-20 pt-24 text-white sm:space-y-6 sm:pt-28">
      <Link
        href="/settings"
        className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm font-bold text-[#f8dce6] transition-colors hover:border-[#ff3b72]/35 hover:bg-[#ff3b72]/10"
      >
        <ArrowLeft className="h-4 w-4" />
        Settings
      </Link>

      <header className="relative overflow-hidden rounded-[28px] border border-[#ff3b72]/25 bg-gradient-to-br from-[#4a0b20]/90 via-[#210811] to-[#100e18] p-6 sm:p-9">
        <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-[#ff3b72]/15 blur-3xl" />
        <div className="relative flex flex-col items-center text-center">
          <div className="grid min-h-32 w-44 place-items-center rounded-3xl border border-white/[0.07] bg-black/20 p-3">
            <img
              src={MASTER_ICON}
              alt="7x"
              width={160}
              height={120}
              className="max-h-28 w-full object-contain"
            />
          </div>
          <h1 className="mt-6 text-3xl font-black tracking-tight sm:text-4xl">7xAnime</h1>
          <p className="mt-2 text-sm text-[#d0b4bf]">One identity. Different worlds.</p>
        </div>
      </header>

      <section className="rounded-[28px] border border-white/[0.08] bg-[#16070d]/90 p-7 text-center sm:p-9">
        <img
          src={PROFILE_IMAGE}
          alt="Rahul"
          width={96}
          height={96}
          className="mx-auto h-24 w-24 rounded-full border border-[#ff9fbe]/30 object-cover shadow-lg shadow-[#ff3b72]/10"
        />
        <h2 className="mt-4 text-2xl font-black tracking-tight">Rahul</h2>
        <p className="mt-1 text-sm font-semibold text-[#ff9fbe]">Creator of 7x</p>
      </section>
    </Container>
  );
}
