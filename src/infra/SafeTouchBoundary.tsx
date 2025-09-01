import React from 'react';
import { View } from 'react-native';

let TEB: any = null;
try {
  // Optional depending on RNGH version; if not present we gracefully fallback
  TEB = require('react-native-gesture-handler').TouchEventBoundary;
} catch (e) {
  TEB = null;
}

export default function SafeTouchBoundary({ children }: { children: React.ReactNode }) {
  if (TEB) return <TEB>{children}</TEB>;
  // fallback: plain View
  return <View style={{ flex: 1 }}>{children}</View>;
}
