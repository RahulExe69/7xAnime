import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Compass,
  Heart,
  History,
  PlayCircle,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import Container from "@/components/container";

const PROFILE_IMAGE = "https://avatars.githubusercontent.com/u/203097752?v=4";

const FEATURES = [
  {
    icon: Search,
    title: "Discover anime",
    description: "Explore titles, browse collections, and search by name to find your next series.",
  },
  {
    icon: PlayCircle,
    title: "Watch your way",
    description: "Use the available sources and choose whether the player should try dub or sub first.",
  },
  {
    icon: History,
    title: "Pick up where you left off",
    description: "Continue Watching helps you return to recent episodes and saved watch progress.",
  },
];

export default function AboutPage() {
  return (
    <Container className="min-h-[75vh] space-y-5 pb-12 pt-24 text-white sm:space-y-6 sm:pt-28">
      <Link
        href="/settings"
        className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm font-bold text-[#f8dce6] transition-colors hover:border-[#ff3b72]/35 hover:bg-[#ff3b72]/10"
      >
        <ArrowLeft className="h-4 w-4" />
        Settings
      </Link>

      <header className="relative isolate overflow-hidden rounded-[28px] border border-[#ff3b72]/25 bg-gradient-to-br from-[#4a0b20]/90 via-[#210811] to-[#100e18] p-6 sm:p-9">
        <div className="pointer-events-none absolute -right-10 -top-16 -z-10 h-48 w-48 rounded-full bg-[#ff3b72]/15 blur-3xl" />
        <div className="flex flex-col items-center text-center">
          <div className="grid h-28 w-28 place-items-center rounded-[26px] border border-white/[0.09] bg-black/25 p-3 shadow-xl shadow-[#ff3b72]/10">
            <Image
              src="/brand/7xanime-icon.png"
              alt="7xAnime app icon"
              width={1254}
              height={1254}
              priority
              className="h-full w-full object-contain"
            />
          </div>
          <p className="mt-5 inline-flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#ff9fbe]">
            <Sparkles className="h-3.5 w-3.5" />
            A project in the 7x ecosystem
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">7xAnime</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[#e0c2cd] sm:text-base">
            Anime discovery with a smoother way to find a series, choose how you watch,
            and get back to where you left off.
          </p>
        </div>
      </header>

      <section className="rounded-[24px] border border-white/[0.08] bg-[#16070d]/90 p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <Compass className="h-5 w-5 text-[#ff9fbe]" />
          <h2 className="text-lg font-extrabold">Made for anime fans</h2>
        </div>
        <p className="mt-3 text-sm leading-7 text-[#c7aab5]">
          7xAnime brings catalogue discovery, supported streaming sources, and watch
          preferences together in one Sakura Chrome experience. The goal is simple:
          spend less time navigating between titles and more time enjoying the stories
          you came for.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <article key={title} className="rounded-2xl border border-white/[0.07] bg-black/15 p-4">
              <div className="grid h-10 w-10 place-items-center rounded-xl border border-[#ff9fbe]/15 bg-[#ff3b72]/10 text-[#ff9fbe]">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-3 text-sm font-extrabold text-[#ffeaf0]">{title}</h3>
              <p className="mt-2 text-xs leading-6 text-[#b49aa4]">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="rounded-[24px] border border-white/[0.08] bg-[#16070d]/90 p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-[#ff9fbe]" />
            <h2 className="text-base font-extrabold">Make it yours</h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-[#c7aab5]">
            Set Dub First or Sub First, choose whether intros and recaps should be skipped,
            and reduce decorative motion from Settings. Your preferences are saved on this device.
          </p>
          <Link href="/settings" className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#ff3b72]/30 bg-[#ff3b72]/10 px-3.5 py-2.5 text-xs font-bold text-[#ffc1d4] transition hover:bg-[#ff3b72]/15">
            Open Settings <ArrowLeft className="h-3.5 w-3.5 rotate-180" />
          </Link>
        </div>

        <div className="rounded-[24px] border border-white/[0.08] bg-[#16070d]/90 p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-[#ff9fbe]" />
            <h2 className="text-base font-extrabold">A little about the creator</h2>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <Image
              src={PROFILE_IMAGE}
              alt="Rahul, creator of 7x"
              width={88}
              height={88}
              unoptimized
              className="h-20 w-20 shrink-0 rounded-full border border-[#ff9fbe]/30 object-cover shadow-lg shadow-[#ff3b72]/10"
            />
            <div className="min-w-0">
              <h3 className="text-xl font-black tracking-tight">Rahul</h3>
              <p className="mt-1 text-sm font-semibold text-[#ff9fbe]">Creator of 7x</p>
              <p className="mt-2 text-xs leading-5 text-[#b49aa4]">
                Building useful, thoughtfully designed projects across the 7x ecosystem.
              </p>
              <a
                href="https://github.com/RahulExe69"
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex text-xs font-bold text-[#ff9fbe] hover:text-white"
              >
                GitHub profile ↗
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-white/[0.08] bg-[#16070d]/90 p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-[#ff9fbe]" />
          <h2 className="text-base font-extrabold">A note on availability</h2>
        </div>
        <p className="mt-3 text-sm leading-7 text-[#c7aab5]">
          Search results describe catalogue entries; they do not guarantee that every episode,
          language, or stream will work. Sources and playback availability can change independently
          of 7xAnime.
        </p>
      </section>

      <section aria-labelledby="about-disclaimer" className="rounded-[22px] border border-[#ff9fbe]/15 bg-black/15 p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 shrink-0 text-[#ff9fbe]" />
          <h2 id="about-disclaimer" className="text-sm font-extrabold text-[#ffd9e4]">Disclaimer</h2>
        </div>
        <p className="mt-3 text-xs leading-6 text-[#a98c97]">
          7xAnime is an anime discovery and playback interface that may link to third-party media
          services. The app does not host streaming files. Availability, playback, subtitles, and
          audio options depend on external services and may change without notice. Please use each
          service in accordance with its terms and the laws applicable in your region.
        </p>
      </section>
    </Container>
  );
}
