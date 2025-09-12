import React, { createContext, useContext, useMemo, useEffect } from "react";
import { useImage, SkImage as SkiaImage } from "@shopify/react-native-skia";
import { Image as RNImage } from "react-native";

type Ctx = { skImage: SkiaImage | null; isLoading: boolean; error?: string };
const Ctx = createContext<Ctx>({ skImage: null, isLoading: true });

export function useMapSkImage() {
  return useContext(Ctx);
}

export function MapImageProvider({
  source,
  children,
  tag = "MapImageProvider",
}: {
  source: number | string;
  children: React.ReactNode;
  tag?: string;
}) {
  // Always try to load directly from the require() first
  const directImage = useImage(typeof source === "number" ? source : "");
  
  // Fallback to URI resolution
  const uri = useMemo(() => {
    if (typeof source === "number") {
      try {
        const res = RNImage.resolveAssetSource(source);
        return res?.uri ?? "";
      } catch (error) {
        console.warn(`[${tag}] Failed to resolve asset source:`, error);
        return "";
      }
    }
    return source || "";
  }, [source, tag]);

  const uriImage = useImage(uri);
  
  // Prefer direct loading
  const skImage = directImage || uriImage || null;
  const isLoading = !skImage;

  useEffect(() => {
    if (__DEV__) {
      if (skImage) {
        console.log(`[${tag}] Image loaded successfully:`, {
          source: typeof source === 'number' ? 'require()' : source,
          size: `${skImage.width()}x${skImage.height()}`,
          uri: uri?.substring(0, 50) + '...'
        });
      } else {
        console.warn(`[${tag}] Image failed to load:`, {
          source: typeof source === 'number' ? 'require()' : source,
          uri: uri?.substring(0, 50) + '...',
        });
      }
    }
  }, [skImage, source, uri, tag]);

  const value: Ctx = useMemo(() => ({ 
    skImage, 
    isLoading,
    error: !skImage && !isLoading ? 'Failed to load image' : undefined
  }), [skImage, isLoading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}