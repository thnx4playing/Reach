import React, { createContext, useContext, useMemo, useEffect } from "react";
import { useImage, SkImage as SkiaImage } from "@shopify/react-native-skia";
import { Image as RNImage } from "react-native";

type Ctx = { skImage: SkiaImage | null };
const Ctx = createContext<Ctx>({ skImage: null });

export function useMapSkImage() {
  return useContext(Ctx).skImage;
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
  // Resolve a URI **in addition** to the numeric asset
  const uri = useMemo(() => {
    if (typeof source === "number") {
      const res = RNImage.resolveAssetSource(source);
      return res?.uri ?? "";
    }
    return source || "";
  }, [source]);

  // Try **both** loading paths; prefer numeric if it resolves
  const imgFromNumber = useImage(typeof source === "number" ? (source as any) : "");
  const imgFromUri = useImage(uri);

  const skImage = imgFromNumber ?? imgFromUri ?? null;

  useEffect(() => {
    // One concise, high-signal log
    // eslint-disable-next-line no-console
    console.log(`[${tag}]`, {
      inputType: typeof source,
      uri,
      numReady: !!imgFromNumber,
      uriReady: !!imgFromUri,
      finalReady: !!skImage,
      size: skImage ? { w: skImage.width(), h: skImage.height() } : null,
    });
  }, [imgFromNumber, imgFromUri, skImage, source, uri, tag]);

  return <Ctx.Provider value={{ skImage }}>{children}</Ctx.Provider>;
}