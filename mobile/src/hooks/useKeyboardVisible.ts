import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * true khi bàn phím đang hiện. Dùng để BỎ padding safe-area đáy của thanh nhập
 * khi gõ: lúc bàn phím mở, Android resize cửa sổ lên trên bàn phím và thanh
 * điều hướng bị che, nên `insets.bottom` trở thành khoảng trống thừa giữa ô
 * nhập và bàn phím. Khi bàn phím đóng thì trả lại padding cho thanh nav.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvt, () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}
