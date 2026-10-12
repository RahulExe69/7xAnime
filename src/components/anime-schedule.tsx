import Container from "./container";
import React, { useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { useGetAnimeSchedule } from "@/query/get-anime-schedule";
import Button from "./common/custom-button";
import Link from "next/link";
import Image from "next/image";
import { ROUTES } from "@/constants/routes";
import { Badge } from "./ui/badge";
import { Clock, Play } from "lucide-react";
import SectionHeading from "./section-heading";

function AnimeSchedule() {
  const currentDate = new Date();
  const currentDay = currentDate
    .toLocaleString("en-US", { weekday: "long" })
    .toLowerCase();
  const currentDayIndex = currentDate.getDay();
  const daysOfWeek = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const [currentSelectedTab, setCurrentSelectedTab] =
    React.useState<string>(currentDay);

  const defaultTab = daysOfWeek.includes(currentDay) ? currentDay : "monday";

  const selectedDate = useMemo(() => {
    const date = getDateForWeekday(currentSelectedTab);
    date.setDate(date.getDate() + 1);
    return date.toLocaleDateString("en-US");
  }, [currentSelectedTab, getDateForWeekday]);

  const { isLoading, data } = useGetAnimeSchedule(selectedDate);

  function getDateForWeekday(targetDay: string) {
    const targetIndex = daysOfWeek.indexOf(targetDay);
    const date = new Date(currentDate);
    const diff = targetIndex - currentDayIndex;
    date.setDate(currentDate.getDate() + diff);
    return date;
  }

  return (
    <Container id="schedule" className="scroll-mt-24 flex flex-col items-start gap-5 py-7 sm:gap-6 sm:py-9">
      <div className="flex flex-col gap-2">
        <SectionHeading eyebrow="On the air" title="Estimated Schedule" />
        <p className="text-sm text-zinc-400">Track upcoming episode releases for this week.</p>
      </div>

      <Tabs
        orientation="vertical"
        defaultValue={defaultTab}
        onValueChange={(val) => setCurrentSelectedTab(val)}
        value={currentSelectedTab}
        className="w-full flex flex-col md:flex-row gap-6"
      >
        {/* Vertical Tabs List */}
        <TabsList className="flex h-auto w-full shrink-0 flex-row items-stretch justify-start gap-2 overflow-x-auto rounded-xl border border-[#4b1727] bg-white p-2 md:h-fit md:w-56 md:flex-col dark:border-[#302c40] dark:bg-[#19070d]">
          {daysOfWeek.map((day) => {
            const dateObj = getDateForWeekday(day);
            const isToday = day === currentDay;

            return (
              <TabsTrigger
                key={day}
                value={day}
                className="shrink-0 flex items-center justify-between px-4 py-3 rounded-lg text-left transition-all data-[state=active]:bg-[#ff3b72] data-[state=active]:text-white text-[#d1a3b3] hover:bg-[#f0eef9] dark:text-zinc-300 dark:hover:bg-white/5"
              >
                <div className="flex flex-col items-start">
                  <span className="font-bold text-sm uppercase tracking-wider">
                    {day}
                  </span>
                  <span className="text-[11px] opacity-75">
                    {dateObj.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
                {isToday && (
                  <Badge className="bg-[#e3f4e9] text-[#21985a] border border-[#c4e7d0] dark:bg-yellow-500/20 dark:text-yellow-300 dark:border-yellow-500/40 text-[10px] ml-2">
                    Today
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Schedule Cards Content */}
        <div className="flex-1 w-full min-h-[300px]">
          {isLoading ? (
            <LoadingSkeleton />
          ) : (
            daysOfWeek.map((day) => (
              <TabsContent key={day} value={day} className="mt-0">
                {day === currentSelectedTab && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
                    {data?.scheduledAnimes.map((anime, idx) => {
                      const timeFormatted = new Date(
                        anime.airingTimestamp,
                      ).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      });

                      return (
                        <div
                          key={`${anime.id}-${anime.episode}-${idx}`}
                          className="flex flex-row gap-3 p-3 bg-white border border-[#4b1727] hover:border-[#ff3b72]/60 rounded-xl hover:bg-[#fbfaff] shadow-sm transition group relative overflow-hidden dark:bg-[#19070d] dark:border-[#451321] dark:hover:border-[#ff3b72] dark:hover:bg-[#230a12]"
                        >
                          {/* Small Poster Thumbnail */}
                          {anime.poster ? (
                            <div className="h-24 w-16 shrink-0 overflow-hidden rounded-lg relative bg-slate-800">
                              <Image
                                src={anime.poster}
                                alt={anime.name}
                                fill
                                className="object-cover group-hover:scale-105 transition duration-300"
                                unoptimized
                              />
                            </div>
                          ) : (
                            <div className="h-24 w-16 shrink-0 bg-[#ebe9f4] dark:bg-[#3b1020] rounded-lg flex items-center justify-center">
                              <Clock className="h-6 w-6 text-gray-500" />
                            </div>
                          )}

                          {/* Info Column */}
                          <div className="flex flex-col justify-between flex-1 min-w-0 py-0.5">
                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-[#d49aaf] dark:text-[#aaa5c0] flex items-center gap-1 font-medium">
                                <Clock className="h-3 w-3 text-[#8b5cf6]" />
                                {timeFormatted}
                              </span>
                              <h3 className="text-sm font-bold text-[#28243f] dark:text-white line-clamp-2 leading-snug">
                                {anime.name}
                              </h3>
                            </div>

                            <div className="flex items-center justify-between gap-2 mt-2">
                              <Badge className="bg-[#8b5cf6]/20 text-[#8b5cf6] border border-[#8b5cf6]/40 text-[10px] px-2 py-0.5">
                                Ep {anime.episode}
                              </Badge>
                              <Link href={ROUTES.animeDetails(anime.id)}>
                                <Button
                                  size="sm"
                                  className="h-7 text-xs bg-[#ff3b72] hover:bg-[#5140c4] text-white px-2.5 rounded-lg flex items-center gap-1 transition"
                                >
                                  <Play className="h-3 w-3 fill-current" /> Details
                                </Button>
                              </Link>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            ))
          )}
        </div>
      </Tabs>
    </Container>
  );
}

const LoadingSkeleton = () => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
      {[1, 2, 3, 4, 5, 6].map((idx) => (
        <div
          key={idx}
          className="flex flex-row gap-3 p-3 bg-white border border-[#4b1727] dark:bg-[#19070d] dark:border-[#451321] rounded-xl animate-pulse"
        >
          {/* Poster Skeleton */}
          <div className="h-24 w-16 shrink-0 bg-[#e9e7f2] dark:bg-[#3b1020] rounded-lg"></div>

          {/* Lines Skeleton */}
          <div className="flex flex-col justify-between flex-1 min-w-0 py-0.5">
            <div className="flex flex-col gap-2">
              <div className="h-3 w-16 bg-[#e9e7f2] dark:bg-[#3b1020] rounded"></div>
              <div className="h-4 w-4/5 bg-[#e9e7f2] dark:bg-[#3b1020] rounded"></div>
            </div>

            <div className="flex items-center justify-between gap-2 mt-2">
              <div className="h-5 w-12 bg-[#e9e7f2] dark:bg-[#3b1020] rounded-full"></div>
              <div className="h-7 w-16 bg-[#e9e7f2] dark:bg-[#3b1020] rounded-lg"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default AnimeSchedule;
