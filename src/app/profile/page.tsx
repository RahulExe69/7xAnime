"use client";

import React, { Suspense, useRef } from "react";
import Container from "@/components/container";
import Avatar from "@/components/common/avatar";
import { useAuthStore } from "@/store/auth-store";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { pb } from "@/lib/pocketbase";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import AnimeLists from "./components/anime-lists";
import ActivityProgression from "./components/activity-progression";
import Loading from "@/app/loading";
import AnilistImport from "./components/anilist-import";
import { useQuery } from "react-query";
import { Camera, UserX } from "lucide-react";

export type TargetProfileUser = {
  id: string;
  username: string;
  avatar: string;
  collectionId: string;
  collectionName: string;
  created: string;
};

function ProfilePageContent() {
  const searchParams = useSearchParams();
  const username = searchParams.get("username") || "";

  const { auth, setAuth } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch target user profile by username
  const {
    data: targetUser,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["PUBLIC_PROFILE_USER", username],
    queryFn: async (): Promise<TargetProfileUser> => {
      const record = await pb
        .collection("users")
        .getFirstListItem(`username = "${username}"`, {
          requestKey: null,
        });

      return {
        id: record.id,
        username: record.username,
        avatar: record.avatar,
        collectionId: record.collectionId,
        collectionName: record.collectionName,
        created: record.created,
      };
    },
    enabled: !!username,
    staleTime: 1000 * 60 * 5, // 5 mins cache
    refetchOnWindowFocus: false,
  });

  const isOwner = !!(auth?.id && targetUser?.id && auth.id === targetUser.id);

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (!isOwner || !auth) return;
    const file = event.target.files?.[0];
    if (file) {
      try {
        const res = await pb.collection("users").update(auth.id, {
          avatar: file,
        });

        if (res) {
          setAuth({ ...auth, avatar: res.avatar });
          toast.success("Avatar updated successfully", {
            style: { background: "green" },
          });
        }
      } catch (err: any) {
        toast.error(err?.message || "Failed to update avatar", {
          style: { background: "red" },
        });
      }
    }
  };

  if (isLoading) {
    return <Loading />;
  }

  if (isError || !targetUser) {
    return (
      <Container className="min-h-[70vh] mt-24 flex flex-col items-center justify-center text-center">
        <UserX className="h-16 w-16 text-slate-600 mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">User Not Found</h2>
        <p className="text-sm text-gray-400 mb-6">
          The user profile &quot;@{username}&quot; does not exist or has been removed.
        </p>
      </Container>
    );
  }

  return (
    <>
      <Container className="min-h-[75vh] space-y-6 pb-16 pt-24 text-white sm:pt-28">
        <header className="relative overflow-hidden rounded-[28px] border border-[#ff3b72]/25 bg-gradient-to-br from-[#4a0b20]/90 via-[#210811] to-[#100e18] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)] sm:p-7">
          <div className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full bg-[#ff3b72]/15 blur-3xl" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="group relative shrink-0">
                <Avatar
                  className="h-[62px] w-[62px] cursor-pointer border-2 border-[#ff9fbe]/35 shadow-lg shadow-black/20 sm:h-[76px] sm:w-[76px]"
                  username={targetUser.username}
                  url={targetUser.avatar}
                  collectionID={targetUser.collectionId}
                  id={targetUser.id}
                  onClick={() => {
                    if (isOwner) fileInputRef.current?.click();
                  }}
                />
                {isOwner && (
                  <button
                    type="button"
                    aria-label="Change avatar"
                    title="Change avatar"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border-2 border-[#1b0710] bg-[#ff3b72] text-white shadow-lg transition-colors hover:bg-[#ff5a88] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd4e0]"
                  >
                    <Camera className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="min-w-0">
                <p className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#ff9fbe]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#ff3b72] shadow-[0_0_10px_rgba(255,59,114,0.8)]" />
                  7xAnime Profile
                </p>
                <h1 className="break-words text-2xl font-black tracking-tight text-[#fff3f7] sm:text-3xl">
                  {isOwner ? "Your Anime Profile" : `@${targetUser.username}`}
                </h1>
                <p className="mt-1 max-w-xl text-sm leading-6 text-[#d0b4bf]">
                  {isOwner
                    ? "Your anime lists, watch activity and progress, all in one place."
                    : "Explore this viewer’s anime lists and watch activity."}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-[#c29daa]">
                  <span>@{targetUser.username}</span>
                  <span aria-hidden="true" className="text-[#ff6d97]">·</span>
                  <span>Member since {new Date(targetUser.created).getFullYear()}</span>
                  {isOwner && (
                    <>
                      <span aria-hidden="true" className="text-[#ff6d97]">·</span>
                      <span className="rounded-full border border-[#ff9fbe]/20 bg-[#ff3b72]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#ffc1d4]">
                        Your profile
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
            {isOwner && (
              <div className="flex shrink-0 items-center gap-3 self-start rounded-xl border border-[#ff9fbe]/15 bg-black/15 px-3 py-2 sm:self-center">
                <div>
                  <p className="text-xs font-bold text-[#ffeaf0]">Import your lists</p>
                  <p className="mt-0.5 text-[10px] text-[#b49aa4]">Bring your AniList library</p>
                </div>
                <AnilistImport />
              </div>
            )}
          </div>
        </header>

        {isOwner && (
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
        )}

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-[#fff3f7]">Your anime shelf</h2>
            <p className="mt-1 text-xs leading-5 text-[#ad929d]">
              Browse series by their place in your watch journey.
            </p>
          </div>
          <Tabs defaultValue="watching" className="w-full">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1.5 rounded-2xl border border-white/[0.07] bg-[#16070d]/90 p-1.5 sm:grid-cols-5">
              <TabsTrigger className="rounded-xl px-2 py-2.5 text-xs font-bold sm:text-sm" value="watching">Watching</TabsTrigger>
              <TabsTrigger className="rounded-xl px-2 py-2.5 text-xs font-bold sm:text-sm" value="plan-to-watch">Plan to watch</TabsTrigger>
              <TabsTrigger className="rounded-xl px-2 py-2.5 text-xs font-bold sm:text-sm" value="on-hold">On hold</TabsTrigger>
              <TabsTrigger className="rounded-xl px-2 py-2.5 text-xs font-bold sm:text-sm" value="completed">Completed</TabsTrigger>
              <TabsTrigger className="rounded-xl px-2 py-2.5 text-xs font-bold sm:text-sm" value="dropped">Dropped</TabsTrigger>
            </TabsList>

            <TabsContent value="watching" className="mt-4">
              <AnimeLists status="watching" userId={targetUser.id} />
            </TabsContent>
            <TabsContent value="plan-to-watch" className="mt-4">
              <AnimeLists status="plan to watch" userId={targetUser.id} />
            </TabsContent>
            <TabsContent value="on-hold" className="mt-4">
              <AnimeLists status="on hold" userId={targetUser.id} />
            </TabsContent>
            <TabsContent value="completed" className="mt-4">
              <AnimeLists status="completed" userId={targetUser.id} />
            </TabsContent>
            <TabsContent value="dropped" className="mt-4">
              <AnimeLists status="dropped" userId={targetUser.id} />
            </TabsContent>
          </Tabs>
        </section>

        <section className="space-y-3 rounded-2xl border border-white/[0.07] bg-[#16070d]/65 p-4 sm:p-6">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-[#fff3f7]">Activity & progress</h2>
            <p className="mt-1 text-xs leading-5 text-[#ad929d]">A snapshot of this viewer’s anime journey.</p>
          </div>
          <ActivityProgression targetUser={targetUser} />
        </section>
      </Container>
    </>
  );
}

function ProfilePage() {
  return (
    <Suspense fallback={<Loading />}>
      <ProfilePageContent />
    </Suspense>
  );
}

export default ProfilePage;
