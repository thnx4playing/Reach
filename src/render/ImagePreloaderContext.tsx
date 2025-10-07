import React, { createContext, useContext, useEffect, useState } from "react";
import { useImage } from "@shopify/react-native-skia";
import { grassyPrefabImages } from "../assets/grassyPrefabs";
import { darkPrefabImages } from "../assets/darkPrefabs";
import { frozenPrefabImages } from "../assets/frozenPrefabs";
import type { MapName } from "../content/maps";

// MapName -> list of prefab names to warm
const PREFAB_LISTS: Record<MapName, string[]> = {
  grassy: Object.keys(grassyPrefabImages),
  dark: Object.keys(darkPrefabImages),
  frozen: Object.keys(frozenPrefabImages),
  bossroom: Object.keys(darkPrefabImages), // bossroom uses the dark tileset
  desert: [], dungeon: [], // fill later if you switch those maps too
};

type Preloaded = Map<string, any>; // key = `${map}:${name}`, value = SkImage
const Ctx = createContext<Preloaded>(new Map());
export const usePreloadedImage = (map: MapName, prefab: string) =>
  useContext(Ctx).get(`${map}:${prefab}`) ?? null;

function ImageLoader({ map, prefab, onReady }: { map: MapName; prefab: string; onReady: (k: string, img: any)=>void }) {
  // Treat bossroom as an alias of dark for assets
  const logical = (map === "bossroom" ? "dark" : map) as MapName;
  const src = logical === "grassy"
    ? grassyPrefabImages[prefab]
    : logical === "dark"
    ? darkPrefabImages[prefab]
    : logical === "frozen"
    ? frozenPrefabImages[prefab]
    : undefined;
  const img = useImage(src);
  useEffect(() => { if (img) onReady(`${map}:${prefab}`, img); }, [img, map, prefab, onReady]);
  return null;
}

export function ImagePreloaderProvider({ maps, children }: { maps: MapName[]; children: React.ReactNode }) {
  const [images, setImages] = useState<Preloaded>(new Map());
  const onReady = (k: string, img: any) => setImages(prev => (prev.has(k) ? prev : new Map(prev).set(k, img)));

  return (
    <Ctx.Provider value={images}>
      {maps.flatMap(m => (PREFAB_LISTS[m] ?? []).map(p => (
        <ImageLoader key={`${m}:${p}`} map={m} prefab={p} onReady={onReady} />
      )))}
      {children}
    </Ctx.Provider>
  );
}
