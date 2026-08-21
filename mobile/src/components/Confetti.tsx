import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type DimensionValue } from 'react-native';

/**
 * Hạt giấy rơi (confetti) — dựng lại `lb2-confetti` của web bằng Animated.
 * Overlay nhẹ, không chặn chạm, lặp liên tục phía sau nội dung thẻ.
 */

const MAU = ['#ffffff', '#ffe08a', '#ffd0c0', '#c8f7d4', '#ffb38a', '#bcdcff'];

function Hat({
  delay,
  left,
  size,
  color,
}: {
  delay: number;
  left: DimensionValue;
  size: number;
  color: string;
}) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(t, {
        toValue: 1,
        duration: 3800,
        delay,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [t, delay]);

  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [-24, 240] });
  const rotate = t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '540deg'] });
  const opacity = t.interpolate({
    inputRange: [0, 0.12, 0.82, 1],
    outputRange: [0, 1, 1, 0],
  });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: 0,
        left,
        width: size,
        height: size * 0.62,
        borderRadius: 2,
        backgroundColor: color,
        transform: [{ translateY }, { rotate }],
        opacity,
      }}
    />
  );
}

export function Confetti({ count = 16 }: { count?: number }) {
  const hat = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        key: i,
        delay: (i * 230) % 3800,
        left: `${(i * 61) % 98}%` as DimensionValue,
        size: 6 + (i % 3) * 3,
        color: MAU[i % MAU.length]!,
      })),
    [count],
  );
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {hat.map((h) => (
        <Hat key={h.key} delay={h.delay} left={h.left} size={h.size} color={h.color} />
      ))}
    </View>
  );
}
