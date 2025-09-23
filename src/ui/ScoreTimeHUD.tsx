// src/ui/ScoreTimeHUD.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type Props = {
  score: number;
  heightPx: number;
  timeMs: number;
  anchor?: 'left' | 'right';
  top?: number;
  onBoxSize?: (w: number, h: number) => void; // width of ONE card
  onMeasured?: (h: number) => void;           // total height of the stack
};

function formatTime(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const cs = Math.floor((ms % 1000) / 10);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function Card({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.value}>{value}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </View>
  );
}

export default function ScoreTimeHUD({
  score,
  heightPx,
  timeMs,
  anchor = 'right',
  top = 50,
  onBoxSize,
  onMeasured,
}: Props) {
  return (
    <View
      pointerEvents="none"
      onLayout={(e) => onMeasured?.(e.nativeEvent.layout.height)}
      style={[
        styles.wrap,
        { top },
        anchor === 'right' ? { right: 12, alignItems: 'flex-end' } : { left: 12, alignItems: 'flex-start' },
      ]}
    >
      {/* measure 1st card so we can size the HP bar width nicely */}
      <View onLayout={(e) => onBoxSize?.(e.nativeEvent.layout.width, e.nativeEvent.layout.height)}>
        <Card title="SCORE" value={String(score)} sub={`Height ${heightPx}px`} />
      </View>
      <Card title="TIME" value={formatTime(timeMs)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', gap: 8, zIndex: 9998 },
  card: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    minWidth: 120,
  },
  title: { color: '#cde7ff', fontSize: 11, letterSpacing: 1 },
  value: { color: 'white', fontSize: 20, fontWeight: '700', lineHeight: 24 },
  sub: { color: '#b7f7c9', fontSize: 11, marginTop: 2 },
});