"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  AudioLines,
  Bookmark,
  Check,
  ChevronRight,
  CircleHelp,
  Eye,
  Info,
  PlayCircle,
  RotateCcw,
  Settings2,
  Sparkles,
  UserRound,
} from "lucide-react";
import Container from "@/components/container";
import { ROUTES } from "@/constants/routes";
import { useAuthStore } from "@/store/auth-store";

type AudioPreference = "sub" | "dub";

function PreferenceToggle({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="min-w-0">
        <p className="text-sm font-bold text-[#ffeaf0]">{title}</p>
        <p className="mt-1 text-xs leading-5 text-[#b49aa4]">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff3b72] focus-visible:ring-offset-2 focus-visible:ring-offset-[#100309] ${checked ? "border-[#ff3b72] bg-[#ff3b72]" : "border-white/15 bg-white/10"}`}
      >
        <span className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow-sm transition-[left] duration-200 ${checked ? "left-[24px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

function SettingsSection({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#16070d]/90 p-4 sm:p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-extrabold tracking-wide text-[#ffd9e4]">
        <Icon className="h-4 w-4 text-[#ff7da3]" />
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const { auth } = useAuthStore();
  const [autoSkip, setAutoSkip] = useState(true);
  const [preferredAudio, setPreferredAudio] = useState<AudioPreference>("dub");
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    try {
      const savedAutoSkip = localStorage.getItem("autoSkip");
      setAutoSkip(savedAutoSkip === null ? true : savedAutoSkip === "true");
      const savedAudio = localStorage.getItem("preferredAudio");
      setPreferredAudio(savedAudio === "sub" ? "sub" : "dub");
      const savedReducedMotion = localStorage.getItem("7xAnime:reduceMotion") === "true";
      setReducedMotion(savedReducedMotion);
      document.documentElement.dataset.reducedMotion = String(savedReducedMotion);
    } catch {
      // Keep the defaults if browser storage is unavailable.
    }
  }, []);

  const updateAutoSkip = (enabled: boolean) => {
    setAutoSkip(enabled);
    try {
      localStorage.setItem("autoSkip", String(enabled));
    } catch {
      // The preference still applies to this page session.
    }
  };

  const updateAudio = (audio: AudioPreference) => {
    setPreferredAudio(audio);
    try {
      localStorage.setItem("preferredAudio", audio);
    } catch {
      // The preference still applies until this page is reloaded.
    }
  };

  const updateReducedMotion = (enabled: boolean) => {
    setReducedMotion(enabled);
    document.documentElement.dataset.reducedMotion = String(enabled);
    try {
      localStorage.setItem("7xAnime:reduceMotion", String(enabled));
    } catch {
      // The visual preference still applies to the current document.
    }
  };

  const resetPreferences = () => {
    setAutoSkip(true);
    setPreferredAudio("dub");
    setReducedMotion(false);
    document.documentElement.dataset.reducedMotion = "false";
    try {
      localStorage.removeItem("autoSkip");
      localStorage.removeItem("preferredAudio");
      localStorage.removeItem("7xAnime:reduceMotion");
    } catch {
      // Reset the in-memory preferences even if storage is unavailable.
    }
  };

  return (
    <Container className="min-h-[75vh] space-y-5 pb-16 pt-24 text-white sm:space-y-6 sm:pt-28">
      <header className="relative overflow-hidden rounded-[28px] border border-[#ff3b72]/25 bg-gradient-to-br from-[#4a0b20]/90 via-[#210811] to-[#100e18] p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-[#ff3b72]/15 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-[#ff9fbe]/20 bg-[#ff3b72]/15 text-[#ff9fbe] sm:h-[68px] sm:w-[68px]">
            <Settings2 className="h-7 w-7 sm:h-8 sm:w-8" />
          </div>
          <div className="min-w-0">
            <p className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#ff9fbe]">
              <Sparkles className="h-3.5 w-3.5" /> Personalise your experience
            </p>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Settings</h1>
            <p className="mt-1 max-w-xl text-sm leading-6 text-[#d0b4bf]">
              Shape how 7xAnime plays and feels. Your preferences are saved on this device.
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <SettingsSection icon={PlayCircle} title="Playback">
          <PreferenceToggle
            title="Auto-skip intros and recaps"
            description="Enable the player’s existing intro/recap skipping behaviour."
            checked={autoSkip}
            onChange={updateAutoSkip}
          />
          <div className="border-t border-white/[0.07] pt-4">
            <div className="flex items-center gap-2">
              <AudioLines className="h-4 w-4 text-[#ff9fbe]" />
              <div>
                <p className="text-sm font-bold text-[#ffeaf0]">Preferred audio</p>
                <p className="mt-1 text-xs leading-5 text-[#b49aa4]">Choose which audio option the player tries first.</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-white/[0.06] bg-black/20 p-1">
              {(["dub", "sub"] as const).map((audio) => (
                <button
                  key={audio}
                  type="button"
                  aria-pressed={preferredAudio === audio}
                  onClick={() => updateAudio(audio)}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff3b72] ${preferredAudio === audio ? "bg-[#ff3b72]/15 text-[#ffc1d4] ring-1 ring-inset ring-[#ff3b72]/30" : "text-[#bda7b0] hover:bg-white/[0.04] hover:text-white"}`}
                >
                  {preferredAudio === audio && <Check className="h-3.5 w-3.5" />}
                  {audio === "dub" ? "Dub first" : "Sub first"}
                </button>
              ))}
            </div>
          </div>
        </SettingsSection>

        <SettingsSection icon={Eye} title="Appearance & accessibility">
          <PreferenceToggle
            title="Reduce motion"
            description="Reduce decorative animations and transitions throughout the app."
            checked={reducedMotion}
            onChange={updateReducedMotion}
          />
          <p className="border-t border-white/[0.07] pt-3 text-xs leading-5 text-[#967e88]">
            7xAnime keeps its Sakura Chrome dark theme so the experience stays consistent with the app’s identity.
          </p>
        </SettingsSection>
      </div>

      <SettingsSection icon={UserRound} title="Your space">
        {auth?.username ? (
          <Link href={ROUTES.profile(auth.username)} className="group flex items-center justify-between gap-3 border-b border-white/[0.07] py-4 transition-colors hover:text-[#ffbad0]">
            <div>
              <p className="text-sm font-bold">Profile</p>
              <p className="mt-1 text-xs text-[#b49aa4]">Your anime lists, watch activity and profile details.</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-[#a88995] transition-transform group-hover:translate-x-0.5" />
          </Link>
        ) : (
          <div className="border-b border-white/[0.07] py-4">
            <p className="text-sm font-bold">Profile</p>
            <p className="mt-1 text-xs leading-5 text-[#b49aa4]">Sign in from the top bar to open your profile and access synced account features.</p>
          </div>
        )}
        <Link href="/library" className="group flex items-center justify-between gap-3 py-4 transition-colors hover:text-[#ffbad0]">
          <div className="flex items-center gap-3">
            <Bookmark className="h-4 w-4 text-[#ff9fbe]" />
            <div>
              <p className="text-sm font-bold">My List</p>
              <p className="mt-1 text-xs text-[#b49aa4]">Go to your saved anime and recent watch progress.</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-[#a88995] transition-transform group-hover:translate-x-0.5" />
        </Link>
      </SettingsSection>

      <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-start gap-3">
          <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-[#ff9fbe]" />
          <div>
            <p className="text-sm font-bold">7xAnime · Sakura Chrome</p>
            <p className="mt-1 text-xs leading-5 text-[#967e88]">Reset playback and accessibility preferences to their defaults.</p>
          </div>
        </div>
        <button type="button" onClick={resetPreferences} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/[0.09] px-3.5 py-2.5 text-xs font-bold text-[#f1dce4] transition-colors hover:border-[#ff3b72]/35 hover:bg-[#ff3b72]/10">
          <RotateCcw className="h-3.5 w-3.5" /> Reset preferences
        </button>
      </div>

      <Link
        href="/settings/about"
        className="group flex items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-[#16070d]/90 p-4 transition-colors hover:border-[#ff3b72]/30 hover:bg-[#210811] sm:p-5"
      >
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#ff9fbe]/15 bg-[#ff3b72]/10 text-[#ff9fbe]">
            <Info className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-[#ffeaf0]">About 7xAnime</p>
            <p className="mt-1 text-xs leading-5 text-[#b49aa4]">A little about 7xAnime and its creator.</p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-[#a88995] transition-transform group-hover:translate-x-0.5" />
      </Link>
    </Container>
  );
}
