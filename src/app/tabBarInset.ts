import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLayout } from '../theme/responsive';
import { spacing } from '../theme/tokens';

export const TAB_BAR_HEIGHT = 62;
/** Distanța de la marginile laterale ale ecranului */
export const TAB_BAR_MARGIN = 16;
/** Cât plutește capsula deasupra zonei sigure de jos */
export const TAB_BAR_LIFT = 14;

/** Spațiul de jos ocupat de bara de tab-uri plutitoare (0 pe tablete landscape, unde e meniu lateral). */
export function useTabBarInset(): number {
  const insets = useSafeAreaInsets();
  const { sideNav } = useLayout();
  if (sideNav) return insets.bottom;
  // Capsula, ridicarea ei și încă 8 pt de aer între ultimul card și bară
  return TAB_BAR_HEIGHT + TAB_BAR_LIFT + insets.bottom + spacing.sm;
}
