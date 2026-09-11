import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type DimensionValue } from 'react-native';

/**
 * "Rơi hoa" — cánh hoa (sakura) rơi lả tả, bay nghiêng qua lại và xoay nhẹ.
 * ĐỒNG BỘ với web (public/leaderboard-confetti.js). Overlay không chặn chạm,
 * lặp liên tục phía sau nội dung thẻ Bảng xếp hạng.
 */

const MAU = ['#ff9ec4', '#ffc2d8', '#ffffff', '#ffd3bf', '#ffe3a3'];

function CanhHoa({
  delay,
  left,
  size,
  color,
  sway,
  duration,
}: {
  delay: number;
  left: DimensionValue;
  size: number;
  color: string;
  sway: number;
  duration: number;
}) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(t, {
        toValue: 1,
        duration,
        delay,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [t, delay, duration]);

  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [-24, 260] });
  // Bay nghiêng qua lại (flutter) trong lúc rơi.
  const translateX = t.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, sway, 0, -sway, 0],
  });
  const rotate = t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '420deg'] });
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
        height: size * 1.5,
        backgroundColor: color,
        // Bo góc bất đối xứng → hình cánh hoa/lá.
        borderTopLeftRadius: size,
        borderBottomRightRadius: size,
        borderTopRightRadius: size * 0.35,
        borderBottomLeftRadius: size * 0.35,
        opacity,
        transform: [{ translateY }, { translateX }, { rotate }],
      }}
    />
  );
}

export function Confetti({ count = 16 }: { count?: number }) {
  const hoa = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        key: i,
        delay: (i * 260) % 4200,
        left: `${(i * 61) % 98}%` as DimensionValue,
        size: 7 + (i % 3) * 3,
        color: MAU[i % MAU.length]!,
        sway: 10 + (i % 4) * 5,
        duration: 4000 + (i % 5) * 500,
      })),
    [count],
  );
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {hoa.map((h) => (
        <CanhHoa
          key={h.key}
          delay={h.delay}
          left={h.left}
          size={h.size}
          color={h.color}
          sway={h.sway}
          duration={h.duration}
        />
      ))}
    </View>
  );
}
