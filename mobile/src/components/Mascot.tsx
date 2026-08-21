import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { colors, radius, shadow } from '@/theme/tokens';

/**
 * Linh vật CamiO — dựng lại `blob-mascot` của web: ảnh PNG 6 biểu cảm + hoạt
 * ảnh lơ lửng (bob + nghiêng nhẹ) chạy liên tục, kèm bong bóng thoại khi `noi`.
 * Web dùng WAAPI; ở đây dùng Animated built-in (native driver).
 */

const CAMIO = {
  vuive: require('../../assets/images/mascot/camio-vuive.png'),
  haohung: require('../../assets/images/mascot/camio-haohung.png'),
  thichthu: require('../../assets/images/mascot/camio-thichthu.png'),
  ngacnhien: require('../../assets/images/mascot/camio-ngacnhien.png'),
  tutin: require('../../assets/images/mascot/camio-tutin.png'),
  baocao: require('../../assets/images/mascot/camio-baocao.png'),
} as const;

export type CamioMood = keyof typeof CAMIO;

export function Mascot({
  mood,
  size = 48,
  noi,
}: {
  mood: CamioMood;
  size?: number;
  noi?: string | null;
}) {
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: 2100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 2100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob]);

  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.09] });
  const rotate = bob.interpolate({ inputRange: [0, 1], outputRange: ['-2.2deg', '2.2deg'] });

  return (
    <View style={styles.wrap}>
      {noi ? (
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>{noi}</Text>
        </View>
      ) : null}
      <Animated.View style={{ transform: [{ translateY }, { rotate }] }}>
        <Image source={CAMIO[mood]} style={{ width: size, height: size }} contentFit="contain" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  bubble: {
    position: 'absolute',
    bottom: '100%',
    marginBottom: 6,
    maxWidth: 180,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadow.card,
  },
  bubbleText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
});
