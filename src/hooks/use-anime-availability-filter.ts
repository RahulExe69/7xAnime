"use client";

import { useEffect, useRef, useState } from "react";
import { filterAnimeByAvailability, type AnimeAudioAvailability } from "@/lib/anime-availability";

type IdentifiableAnime = { id: string | number };
type AvailabilityState = {
  key: string;
  availableIds: string[];
  isChecking: boolean;
  checkedCount: number;
  unavailableCount: number;
  unknownCount: number;
};

const EMPTY_ITEMS: never[] = [];

export default function useAnimeAvailabilityFilter<T extends IdentifiableAnime>(
  items: T[] | undefined,
  enabled: boolean,
  audio: AnimeAudioAvailability = "any",
) {
  const safeItems = items ?? EMPTY_ITEMS;
  const itemsKey = JSON.stringify(safeItems.map((item) => String(item.id)));
  const itemsRef = useRef(safeItems);
  itemsRef.current = safeItems;

  const [state, setState] = useState<AvailabilityState>({
    key: "",
    availableIds: [],
    isChecking: false,
    checkedCount: 0,
    unavailableCount: 0,
    unknownCount: 0,
  });

  useEffect(() => {
    const requestItems = itemsRef.current;
    if (!enabled) {
      setState({
        key: itemsKey,
        availableIds: [],
        isChecking: false,
        checkedCount: 0,
        unavailableCount: 0,
        unknownCount: 0,
      });
      return;
    }

    let active = true;
    setState({
      key: itemsKey,
      availableIds: [],
      isChecking: requestItems.length > 0,
      checkedCount: 0,
      unavailableCount: 0,
      unknownCount: 0,
    });

    if (requestItems.length === 0) return () => { active = false; };

    void filterAnimeByAvailability(requestItems, audio, () => active, 3)
      .then((result) => {
        if (!active) return;
        setState({
          key: itemsKey,
          availableIds: result.availableIds,
          isChecking: false,
          checkedCount: result.checkedCount,
          unavailableCount: result.unavailableCount,
          unknownCount: result.unknownCount,
        });
      })
      .catch(() => {
        if (!active) return;
        setState({
          key: itemsKey,
          availableIds: [],
          isChecking: false,
          checkedCount: 0,
          unavailableCount: 0,
          unknownCount: requestItems.length,
        });
      });

    return () => {
      active = false;
    };
  }, [itemsKey, enabled, audio]);

  const stateMatchesItems = state.key === itemsKey;
  const filteredItems = !enabled
    ? safeItems
    : stateMatchesItems
      ? safeItems.filter((item) => state.availableIds.includes(String(item.id)))
      : [];

  return {
    filteredItems,
    isChecking: enabled && (!stateMatchesItems || state.isChecking),
    checkedCount: stateMatchesItems ? state.checkedCount : 0,
    unavailableCount: stateMatchesItems ? state.unavailableCount : 0,
    unknownCount: stateMatchesItems ? state.unknownCount : 0,
  };
}
