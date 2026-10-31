import type { LucideIcon } from 'lucide-react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTabBarInset } from '../app/tabBarInset';
import { useT } from '../i18n';
import { useLayout } from '../theme/responsive';
import { colors, layout, spacing } from '../theme/tokens';
import { AppText } from './AppText';
import { Button } from './Button';
import { IconTile } from './Controls';
import { Glass } from './Glass';
import { PressableScale } from './press';
import { GlassBackground } from './GlassBackground';
import { useHasSharedBackground, useSharedSky } from './SharedBackground';

// ───────── Screen: fundal + safe area + padding responsive ─────────
// Două variante explicite: Screen (conținut fix, de exemplu harta sau chat-ul) și ScrollScreen.

interface ScreenProps {
  children: ReactNode;
  background?: 'default' | 'sky';
  /** Spațiul de jos: bara de tab-uri (ecranele principale) sau doar safe area (onboarding) */
  bottomInset?: 'tabBar' | 'safeArea';
  contentStyle?: StyleProp<ViewStyle>;
  /** Lățimea maximă pe tablete: coloană îngustă (formulare, bilet) sau lată (zbor, chat) */
  column?: keyof typeof layout;
  /** Element fixat sus, care nu se derulează odată cu conținutul (de exemplu banda cu biletul) */
  top?: ReactNode;
}

// Fundalul ecranului: în tab-uri e cel partajat (doar anunță varianta cât e focalizat), altfel și-l desenează singur
function ScreenBackground({ variant }: { variant: 'default' | 'sky' }) {
  const shared = useHasSharedBackground();
  const setVariant = useSharedSky(state => state.setVariant);
  useFocusEffect(
    useCallback(() => {
      if (shared) setVariant(variant);
    }, [shared, setVariant, variant]),
  );
  return shared ? null : <GlassBackground variant={variant} />;
}

function useScreenFrame({ bottomInset = 'tabBar', column, top, contentStyle }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const tabInset = useTabBarInset();
  const { sizeClass } = useLayout();
  // Marginea laterală e de cel puțin 16 pt, și pe telefoanele mici
  const padH = sizeClass === 'compact' || sizeClass === 'regular' ? spacing.lg : spacing.xl;
  // Spațiu generos sub ultimul card, ca butoanele să nu stea lipite de bara de tab-uri
  const bottom = (bottomInset === 'tabBar' ? tabInset : insets.bottom) + spacing.xl;
  const width = column ? { maxWidth: layout[column], width: '100%' as const, alignSelf: 'center' as const } : null;
  const inner = [
    styles.content,
    { paddingTop: top ? spacing.md : insets.top + spacing.xs, paddingHorizontal: padH, paddingBottom: bottom },
    width,
    contentStyle,
  ];
  const topBar = top ? <View style={[{ paddingTop: insets.top + spacing.xs, paddingHorizontal: padH }, width]}>{top}</View> : null;
  return { inner, topBar };
}

export function Screen(props: ScreenProps) {
  const { inner, topBar } = useScreenFrame(props);
  return (
    <View style={styles.fill}>
      <ScreenBackground variant={props.background ?? 'default'} />
      {topBar}
      <View style={[styles.fill, inner]}>{props.children}</View>
    </View>
  );
}

// Cât trebuie derulat (pt) ca banda de sus să dispară complet
const TOP_FADE_DISTANCE = 72;

export function ScrollScreen(props: ScreenProps) {
  const { inner, topBar } = useScreenFrame(props);
  // Banda de sus plutește peste conținut și se estompează când derulezi în jos, ca să nu acopere pașii
  const [topHeight, setTopHeight] = useState(0);
  const [topHidden, setTopHidden] = useState(false);
  const insets = useSafeAreaInsets();
  const { width } = useLayout();
  const scrimHeight = insets.top + spacing.xl;
  // Jos, sub bara de tab-uri: conținutul derulat se topește lin în cer înainte să ajungă sub bară
  const tabInset = useTabBarInset();
  const bottomScrim = props.bottomInset === 'safeArea' ? 0 : tabInset + spacing.xxl + spacing.lg;
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler(e => {
    scrollY.value = e.contentOffset.y;
  });
  // Ascunsă, banda nu mai primește atingeri (altfel ai deschide biletul atingând un card de sub ea)
  useAnimatedReaction(
    () => scrollY.value > TOP_FADE_DISTANCE * 0.6,
    (hidden, prev) => {
      if (hidden !== prev) scheduleOnRN(setTopHidden, hidden);
    },
  );
  const topStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, TOP_FADE_DISTANCE], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, [0, TOP_FADE_DISTANCE], [0, -16], Extrapolation.CLAMP) }],
  }));
  return (
    <View style={styles.fill}>
      <ScreenBackground variant={props.background ?? 'default'} />
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={[inner, topBar ? { paddingTop: topHeight + spacing.md } : null]}
        showsVerticalScrollIndicator={false}
      >
        {props.children}
      </Animated.ScrollView>
      {/* Sub bara de stare, o fâșie de cer care se estompează: conținutul derulat nu trece pe sub ceas */}
      <View pointerEvents="none" style={[styles.statusScrim, { height: scrimHeight }]}>
        <Svg width={width} height={scrimHeight}>
          <Defs>
            <LinearGradient id="statusScrim" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.skyTop} stopOpacity={1} />
              <Stop offset="0.55" stopColor={colors.skyTop} stopOpacity={0.95} />
              <Stop offset="1" stopColor={colors.skyTop} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect width={width} height={scrimHeight} fill="url(#statusScrim)" />
        </Svg>
      </View>
      {bottomScrim > 0 && (
        <View pointerEvents="none" style={[styles.bottomScrim, { height: bottomScrim }]}>
          <Svg width={width} height={bottomScrim}>
            <Defs>
              <LinearGradient id="bottomScrim" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.cloudWhite} stopOpacity={0} />
                <Stop offset="0.25" stopColor={colors.cloudWhite} stopOpacity={0.35} />
                <Stop offset="0.5" stopColor={colors.cloudWhite} stopOpacity={0.75} />
                <Stop offset="0.75" stopColor={colors.cloudWhite} stopOpacity={0.95} />
                <Stop offset="1" stopColor={colors.cloudWhite} stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect width={width} height={bottomScrim} fill="url(#bottomScrim)" />
          </Svg>
        </View>
      )}
      {topBar ? (
        <Animated.View
          style={[styles.floatingTop, topStyle]}
          onLayout={e => setTopHeight(e.nativeEvent.layout.height)}
          pointerEvents={topHidden ? 'none' : 'box-none'}
        >
          {topBar}
        </Animated.View>
      ) : null}
    </View>
  );
}

// ───────── Header ─────────

export function ScreenHeader({
  title,
  subtitle,
  right,
  onBack,
  titleSize = 'title',
  onTitleLongPress,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onBack?: () => void;
  titleSize?: 'title' | 'headline';
  onTitleLongPress?: () => void;
}) {
  const t = useT();
  return (
    <View style={styles.header}>
      {onBack && <RoundButton icon={ChevronLeft} label={t('common.back')} onPress={onBack} />}
      <PressableScale style={styles.headerText} onLongPress={onTitleLongPress} delayLongPress={600} disabled={!onTitleLongPress} accessibilityRole="header">
        <AppText variant={titleSize} weight={titleSize === 'headline' ? '700' : undefined} numberOfLines={2}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color={colors.text2} numberOfLines={2} style={styles.subtitle}>
            {subtitle}
          </AppText>
        ) : null}
      </PressableScale>
      {right}
    </View>
  );
}

export function RoundButton({ icon: Icon, label, onPress, active }: { icon: LucideIcon; label: string; onPress?: () => void; active?: boolean }) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}>
      {active ? (
        <View style={[styles.round, styles.roundActive]}>
          <Icon size={20} color={colors.onAccent} />
        </View>
      ) : (
        <Glass radius={24} style={styles.round}>
          <Icon size={20} color={colors.text} />
        </Glass>
      )}
    </PressableScale>
  );
}

// ───────── List row ─────────

export function ListRow({
  icon: Icon,
  iconTone = 'default',
  title,
  subtitle,
  right,
  onPress,
  last,
}: {
  icon?: LucideIcon;
  /** Pe liste iconița e simplă, fără pătrat colorat; „accent” marchează elementul activ */
  iconTone?: 'default' | 'accent';
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  const body = (
    <View style={[styles.row, !last && styles.rowBorder]}>
      {Icon ? (
        <View style={styles.rowIcon} importantForAccessibility="no" accessibilityElementsHidden>
          <Icon size={22} strokeWidth={2} color={iconTone === 'accent' ? colors.accentText : colors.text2} />
        </View>
      ) : null}
      <View style={styles.rowText}>
        <AppText variant="headline" weight="700">
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color={colors.text2} weight="400">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right}
    </View>
  );
  return onPress ? (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={title}>
      {body}
    </PressableScale>
  ) : (
    body
  );
}

// ───────── Empty / error state ─────────

export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
  tone = 'soft',
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'soft' | 'warning';
}) {
  return (
    <Glass style={styles.empty}>
      <IconTile icon={icon} size={60} tone={tone} />
      <AppText variant="headline" align="center">
        {title}
      </AppText>
      <AppText variant="body" color={colors.text2} align="center">
        {body}
      </AppText>
      {actionLabel ? <Button label={actionLabel} onPress={onAction} size="sm" /> : null}
    </Glass>
  );
}

const styles = StyleSheet.create({
  statusScrim: { position: 'absolute', top: 0, left: 0, right: 0 },
  bottomScrim: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  fill: { flex: 1 },
  floatingTop: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 },
  content: { gap: spacing.md, flexGrow: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52 },
  headerText: { flex: 1 },
  subtitle: { marginTop: 2 },
  round: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  roundActive: { borderRadius: 23, backgroundColor: colors.accent },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: spacing.sm },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  rowText: { flex: 1, gap: 1 },
  rowIcon: { width: 28, alignItems: 'center' },
  empty: { alignItems: 'center', gap: spacing.md, padding: spacing.xl },
});
