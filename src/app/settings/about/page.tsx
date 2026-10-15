import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clapperboard,
  Compass,
  ExternalLink,
  Gamepad2,
  Heart,
  Image as ImageIcon,
  Music2,
  PlayCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import Container from "@/components/container";

const PROFILE_IMAGE = "https://avatars.githubusercontent.com/u/203097752?v=4";

const ECOSYSTEM_PRODUCTS = [
  { name: "7xAnime", description: "Anime discovery", accent: "#FF315E", icon: PlayCircle, current: true },
  { name: "7xTune", description: "Music & listening", accent: "#7657FF", icon: Music2 },
  { name: "7xCinema", description: "Films & cinema", accent: "#FFC247", icon: Clapperboard },
  { name: "7xRead", description: "Reading", accent: "#20DCA6", icon: BookOpen },
  { name: "7xGame", description: "Gaming", accent: "#168BFF", icon: Gamepad2 },
  { name: "7xWall", description: "Wallpapers & art", accent: "#F02AA9", icon: ImageIcon },
  { name: "7xTools", description: "Everyday utilities", accent: "#19C8E8", icon: Wrench },
  { name: "7xAI", description: "AI & discovery", accent: "#A16AFF", icon: Sparkles },
];

const FEATURES = [
  {
    icon: Search,
    title: "Discover anime",
    description: "Explore collections and search titles to find your next series.",
  },
  {
    icon: PlayCircle,
    title: "Watch your way",
    description: "Use the available streaming sources and choose Dub First or Sub First.",
  },
  {
    icon: CheckCircle2,
    title: "Pick up where you left off",
    description: "Continue Watching helps you return to recent episodes and saved progress.",
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

      <header
        className="relative isolate overflow-hidden rounded-[28px] border border-[#ff3b72]/30 bg-cover bg-center p-6 sm:p-9"
        style={{
          backgroundImage:
            "linear-gradient(135deg, rgba(10,3,9,.88), rgba(20,5,17,.76)), url('/brand/7xanime-ecosystem-background.svg')",
        }}
      >
        <div className="pointer-events-none absolute -right-10 -top-16 -z-10 h-48 w-48 rounded-full bg-[#ff3b72]/15 blur-3xl" />
        <div className="relative flex flex-col items-center text-center">
          <div className="grid h-24 w-24 place-items-center rounded-[24px] border border-white/[0.12] bg-black/25 p-3 shadow-xl shadow-[#ff3b72]/10 sm:h-28 sm:w-28">
            <Image
              src="/brand/7xanime-icon.png"
              alt="7xAnime app icon"
              width={1254}
              height={1254}
              priority
              className="h-full w-full object-contain"
            />
          </div>
          <Image
            src="/brand/7xanime-wordmark.png"
            alt="7xAnime — More Than Anime"
            width={2107}
            height={746}
            priority
            className="mt-5 h-auto w-[220px] object-contain sm:w-[275px]"
          />
          <p className="mt-3 text-sm font-semibold text-[#ffd5e3] sm:text-base">
            One identity. Different worlds.
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#e0c2cd]">
            7xAnime is the anime-focused corner of the 7x ecosystem — made for discovering
            series, finding available sources, and getting back to the stories you love.
          </p>
        </div>
      </header>

      <section className="rounded-[24px] border border-white/[0.08] bg-[#16070d]/90 p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <Compass className="h-5 w-5 text-[#ff9fbe]" />
          <h2 className="text-lg font-extrabold">Made for anime fans</h2>
        </div>
        <p className="mt-3 text-sm leading-7 text-[#c7aab5]">
          The aim is simple: make anime discovery feel clear and comfortable on mobile.
          Browse the catalogue, check available viewing options, set your preferred audio,
          and keep your recent progress close by.
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

      <section className="rounded-[24px] border border-white/[0.08] bg-[#16070d]/90 p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#ff9fbe]">One identity</p>
            <h2 className="mt-1 text-lg font-extrabold">The 7x family</h2>
          </div>
          <a
            href="https://github.com/RahulExe69/7x"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#ff9fbe]/20 px-3 py-2 text-xs font-bold text-[#ffbad0] transition hover:border-[#ff3b72]/45 hover:bg-[#ff3b72]/10"
          >
            7x Brand Studio <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#b49aa4]">
          Shared brand roots, different product worlds. Each project has its own purpose and
          accent colour while keeping the 7x identity connected.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {ECOSYSTEM_PRODUCTS.map(({ name, description, accent, icon: Icon, current }) => (
            <article
              key={name}
              aria-current={current ? "true" : undefined}
              className="min-w-0 rounded-2xl border p-3.5 transition-colors"
              style={{
                borderColor: current ? `${accent}75` : `${accent}35`,
                backgroundColor: current ? `${accent}18` : `${accent}0c`,
              }}
            >
              <div
                className="grid h-9 w-9 place-items-center rounded-xl border"
                style={{
                  color: accent,
                  borderColor: `${accent}45`,
                  backgroundColor: `${accent}18`,
                }}
              >
                <Icon className="h-[18px] w-[18px]" />
              </div>
              <h3 className="mt-3 truncate text-sm font-extrabold text-[#fff0f5]">{name}</h3>
              <p className="mt-1 text-[11px] leading-5 text-[#b49aa4]">{description}</p>
              {current && (
                <span className="mt-2 inline-flex rounded-full px-2 py-1 text-[9px] font-extrabold uppercase tracking-wide"
                  style={{ color: accent, backgroundColor: `${accent}20` }}>
                  You’re here
                </span>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="rounded-[24px] border border-white/[0.08] bg-[#16070d]/90 p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#ff9fbe]" />
            <h2 className="text-base font-extrabold">Make it yours</h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-[#c7aab5]">
            Set Dub First or Sub First, choose whether to skip intros and recaps, and reduce
            decorative motion in Settings. Your preferences are saved on this device.
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
          language, or stream will work. Availability and playback depend on external services and
          can change independently of 7xAnime.
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
