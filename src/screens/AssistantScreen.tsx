import { useNavigation } from '@react-navigation/native';
import {
  Armchair,
  ChevronDown,
  Clock,
  Cpu,
  DoorOpen,
  PlaneLanding,
  Send,
  ShieldCheck,
  Smartphone,
  Ticket,
  Wind,
  type LucideIcon,
} from 'lucide-react-native';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { AppText } from '../components/AppText';
import { ChatBubble, FloAvatar } from '../components/ChatBubble';
import { Chip } from '../components/Controls';
import { Glass } from '../components/Glass';
import { GradientFill } from '../components/GradientFill';
import { pressFeedback } from '../components/press';
import { EmptyState, ProfileButton, Screen, ScreenHeader } from '../components/Layout';
import { SkyArt } from '../components/SkyArt';
import { useLanguage, useT, type TranslationKey } from '../i18n';
import { formatDuration, formatLocalTime, formatNumber, minutesBetween } from '../lib/time';
import { useNow } from '../lib/useNow';
import { assistant, clock, flightData } from '../services';
import { REPLACE } from '../services/live/DeviceAssistantService';
import { useLive } from '../store/live';
import { statsLine, useAnswerStats } from '../store/stats';
import { useFlightMode } from '../store/flightMode';
import { useSettings } from '../store/settings';
import { useActiveTicket } from '../store/tickets';
import { useLayout } from '../theme/responsive';
import { colors, radii, spacing, chatGradient } from '../theme/tokens';
import { useFlightStatusVersion } from '../store/flightStatus';
import { ROUTER_DEBUG } from '../llm/rollamaEngine';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  time: string;
}

const GROUND_SUGGESTIONS: { key: TranslationKey; icon: LucideIcon }[] = [
  { key: 'assistant.s.seat', icon: Armchair },
  { key: 'assistant.s.boarding', icon: Clock },
  { key: 'assistant.s.security', icon: ShieldCheck },
];
const AIR_SUGGESTIONS: { key: TranslationKey; icon: LucideIcon }[] = [
  { key: 'assistant.s.landing', icon: PlaneLanding },
  { key: 'assistant.s.turbulence', icon: Wind },
  { key: 'assistant.s.phone', icon: Smartphone },
];

// Asistentul Flo (schița 06): antet cu avatar, card cu timpul până la îmbarcare și aripa avionului,
// conversația, întrebări rapide și bara de scris cu tentă violet.
export function AssistantScreen() {
  const t = useT();
  const language = useLanguage();
  const setLanguage = useSettings(s => s.setLanguage);
  const navigation = useNavigation();
  const ticket = useActiveTicket();
  const { phase, position } = useFlightMode();
  const now = useNow();
  const { type } = useLayout();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streamingId, setStreamingId] = useState<number | null>(null);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const nextId = useRef(1);
  const assistantSource = useLive(s => s.assistantSource);
  const lastStats = useAnswerStats(s => s.last);

  useFlightStatusVersion(); // re-render when the server changes the gate or a delay
  const flight = ticket ? flightData.getFlight(ticket.flightId) : null;
  const from = flight ? flightData.getAirport(flight.from) : null;
  const to = flight ? flightData.getAirport(flight.to) : null;

  // Loads the model and compiles its shaders before the first question (no-op for the mock assistant)
  useEffect(() => {
    if (ticket && flight) void assistant.warmUp?.({ flight, ticket, position: position ?? undefined, nowUtc: clock.now().toISOString(), language });
  }, [ticket?.id, flight?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ticket || !flight || !from || !to) {
    return (
      <Screen>
        <ScreenHeader title={t('assistant.title')} />
        <EmptyState icon={Ticket} title={t('journey.empty.title')} body={t('assistant.empty')} actionLabel={t('journey.empty.cta')} onAction={() => navigation.navigate('AddTicket')} />
      </Screen>
    );
  }

  const inAir = phase === 'inAir' && position;
  const flightCode = `${flight.carrier} ${flight.flightNumber}`;
  const localNow = () => formatLocalTime(clock.now().toISOString(), from.utcOffsetMin);

  // Cifra mare: la sol, timpul până la îmbarcare; în aer, timpul până la aterizare (din tracker)
  const toBoarding = Math.max(0, Math.round(minutesBetween(now, flight.boardingUtc)));
  const heroMinutes = inAir ? Math.round(position.timeRemainingMin) : toBoarding;
  const heroLabel = inAir ? t('assistant.untilLanding') : t('assistant.untilBoarding');
  const boardingTime = formatLocalTime(flight.boardingUtc, from.utcOffsetMin);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || streamingId !== null) return;
    const time = localNow();
    const userMsg: Message = { id: nextId.current++, role: 'user', text: q, time };
    const answerId = nextId.current++;
    setMessages(m => [...m, userMsg, { id: answerId, role: 'assistant', text: '', time }]);
    setInput('');
    setStreamingId(answerId);
    // Contextul zborului (bilet, oră, date din tracker) se trimite împreună cu întrebarea
    const stream = assistant.ask(q, { flight, ticket, position: position ?? undefined, nowUtc: clock.now().toISOString(), language });
    try {
      for await (const token of stream) {
        setMessages(m => m.map(msg => (msg.id === answerId ? { ...msg, text: token.startsWith(REPLACE) ? token.slice(REPLACE.length) : msg.text + token } : msg))); // REPLACE: the answer guard swapped the whole text
        scrollRef.current?.scrollToEnd({ animated: true });
      }
    } finally {
      setStreamingId(null);
    }
  };

  const suggestions = inAir ? AIR_SUGGESTIONS : GROUND_SUGGESTIONS;
  const busy = !input.trim() || streamingId !== null;

  return (
    <Screen background={inAir ? 'sky' : 'default'} contentStyle={styles.content} column="columnWide">
      {/* Antet: Flo cu punctul verde, rolul, insigna offline și limba */}
      <View style={styles.header}>
        <FloAvatar size={52} live />
        <View style={styles.flex}>
          <AppText variant="title">{t('assistant.name')}</AppText>
          <View style={styles.roleRow}>
            <AppText variant="caption" color={colors.textMuted}>
              {t('assistant.role')}
            </AppText>
            <View style={styles.offline}>
              <Cpu size={12} color={colors.successText} />
              <AppText variant="caption" color={colors.successText} weight="700">
                {t('assistant.offline')}
              </AppText>
            </View>
          </View>
        </View>
        <Pressable
          onPress={() => setLanguage(language === 'ro' ? 'en' : 'ro')}
          style={pressFeedback(styles.langPill)}
          accessibilityRole="button"
          accessibilityLabel={t('profile.language')}
        >
          <AppText variant="caption" weight="700" color={colors.accentText}>
            {language.toUpperCase()}
          </AppText>
          <ChevronDown size={14} color={colors.accentText} />
        </Pressable>
        <ProfileButton />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.messages}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          showsVerticalScrollIndicator={false}
        >
          {/* Cardul zborului, cu aripa în dreapta și cele trei cifre pe o sub-placă de sticlă */}
          <Glass tone="strong" radius={radii.hero} style={styles.hero}>
            <SkyArt />
            <View style={styles.heroTop}>
              <View style={styles.flex}>
                <AppText variant="headline">{flightCode}</AppText>
                <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
                  {from.city} ({from.code}) → {to.city} ({to.code})
                </AppText>
              </View>
            </View>
            <View>
              <AppText variant="countdown" tabular numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: type.countdown.fontSize, lineHeight: type.countdown.fontSize * 1.15 }}>
                {formatDuration(heroMinutes, language)}
              </AppText>
              <AppText variant="headline" color={colors.text2}>
                {heroLabel}
              </AppText>
            </View>
            <View style={styles.strip}>
              <Metric icon={Armchair} label={t('pass.seat')} value={ticket.pass.seat} />
              <View style={styles.vline} />
              <Metric icon={DoorOpen} label={t('pass.gate')} value={flight.gate} sub={t('common.floor', { floor: flight.gateFloor })} />
              <View style={styles.vline} />
              <Metric icon={Clock} label={t('pass.boarding')} value={boardingTime} />
            </View>
            {inAir && (
              <AppText variant="caption" color={colors.textMuted}>
                {t('assistant.contextAir', { flight: flightCode, seat: ticket.pass.seat, alt: formatNumber(position.altitudeM), left: formatNumber(position.distanceRemainingKm) })}
              </AppText>
            )}
          </Glass>

          <ChatBubble role="assistant" author={t('assistant.name')} text={t('assistant.welcome', { flight: flightCode })} />
          {messages.map(m => (
            <ChatBubble key={m.id} role={m.role} author={m.role === 'user' ? t('assistant.you') : t('assistant.name')} text={m.text} time={m.role === 'assistant' && m.id !== streamingId ? m.time : undefined} streaming={m.id === streamingId} />
          ))}
          {ROUTER_DEBUG && assistantSource !== 'mock' && lastStats ? (
            <AppText variant="caption" color={colors.textMuted}>
              {statsLine(lastStats)}
            </AppText>
          ) : null}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sugsScroll} contentContainerStyle={styles.sugs} keyboardShouldPersistTaps="handled">
          {suggestions.map(s => (
            <Chip key={s.key} label={t(s.key)} icon={s.icon} onPress={() => ask(t(s.key))} />
          ))}
        </ScrollView>

        {/* Bara de scris: o capsulă de sticlă cu tentă violet și butonul de trimitere în ea */}
        <Glass tone="strong" radius={radii.pill} style={styles.inputBar}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t('assistant.placeholder')}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            onSubmitEditing={() => ask(input)}
            returnKeyType="send"
            accessibilityLabel={t('assistant.placeholder')}
          />
          <Pressable
            onPress={() => ask(input)}
            disabled={busy}
            style={pressFeedback([styles.send, busy && styles.sendDisabled])}
            accessibilityRole="button"
            accessibilityLabel={t('assistant.send')}
          >
            <GradientFill colors={chatGradient} />
            <Send size={19} color={colors.onGradient} />
          </Pressable>
        </Glass>
        <AppText variant="caption" weight="400" color={colors.textMuted} align="center" style={styles.disclaimer}>
          {t('assistant.disclaimer')}
        </AppText>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Metric({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: string; sub?: string }) {
  return (
    <View style={styles.metric}>
      <Icon size={17} color={colors.accentText} />
      <View style={styles.metricText}>
        <AppText variant="caption" color={colors.textMuted} align="center" numberOfLines={2}>
          {label}
        </AppText>
        <AppText variant="headline" tabular numberOfLines={1} adjustsFontSizeToFit align="center">
          {value}
        </AppText>
        {sub ? (
          <AppText variant="caption" color={colors.textMuted} numberOfLines={1} adjustsFontSizeToFit align="center">
            {sub}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.xs },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    minHeight: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.glassEdgeLit,
  },
  hero: { padding: spacing.lg, gap: spacing.md, boxShadow: `0 16px 36px ${colors.shadowHero}` },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, minHeight: 24, borderRadius: radii.pill, backgroundColor: colors.successSoft },
  strip: {
    flexDirection: 'row',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.glassSubBorder,
    backgroundColor: colors.glassSub,
  },
  metric: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  metricText: { width: '100%', minWidth: 0 },
  vline: { width: 1, alignSelf: 'stretch', backgroundColor: colors.lineVertical },
  messages: { gap: spacing.md, paddingVertical: spacing.sm, flexGrow: 1 },
  sugsScroll: { flexGrow: 0, marginHorizontal: -spacing.lg },
  sugs: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 6 },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 54, paddingLeft: 20, paddingRight: 5, marginTop: spacing.xs, backgroundColor: colors.inputTint, borderColor: colors.accentLine },
  input: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: spacing.md },
  send: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 12px ${colors.shadowGlow}` },
  sendDisabled: { opacity: 0.5 },
  disclaimer: { marginTop: spacing.xs },
});
