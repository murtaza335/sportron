import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';

import { BarButton } from '@/components/live/parts';
import { SheetScrollView } from '@/components/motion/Sheet';
import { toast } from '@/components/motion/Toast';
import { BottomSheet } from '@/components/tournaments/BottomSheet';
import { SectionLabel } from '@/components/tournaments/form';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useFlag } from '@/contexts/RemoteConfigContext';
import { useTheme } from '@/hooks/use-theme';
import { useTournamentFields } from '@/hooks/useTournamentFields';
import { alert } from '@/lib/alert';
import { gridFor, resolveLiveDisplay, type LiveDisplaySettings } from '@/lib/live';
import { share } from '@/lib/share';
import { friendlyTournamentError } from '@/lib/tournamentErrors';
import { fetchLiveSettings, isLiveUnavailable, setLiveCode, setLiveDisplay, setLivePublic } from '@/services/tournamentsLive';
import type { LiveSettings } from '@/types';

const HOLD_OPTIONS = [
  { value: 30, label: '30 s' },
  { value: 60, label: '1 min' },
  { value: 120, label: '2 min' },
  { value: 300, label: '5 min' },
];

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.chip, { borderColor: selected ? theme.accent : theme.border, backgroundColor: selected ? theme.accent : theme.backgroundElement }]}
    >
      <ThemedText style={{ color: selected ? '#fff' : theme.text, fontWeight: '700' }}>{label}</ThemedText>
    </Pressable>
  );
}

function SwitchRow({ label, hint, value, onChange, disabled }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.switchRow}>
      <View style={{ flex: 1 }}>
        <ThemedText style={{ fontWeight: '600' }}>{label}</ThemedText>
        {hint ? (
          <ThemedText variant="caption" muted>
            {hint}
          </ThemedText>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: theme.accent }} accessibilityLabel={label} />
    </View>
  );
}

/** A 16:9 miniature of the projector, drawn with the same layout rule the hall uses. */
function Preview({ d, title }: { d: LiveDisplaySettings; title: string }) {
  const theme = useTheme();
  const courts = d.courts.length ? d.courts : ['Court 1', 'Court 2', 'Court 3'];
  const g = gridFor(Math.min(courts.length, d.max_per_page), d.layout, 16 / 9);
  const tiles = courts.slice(0, d.max_per_page);
  return (
    <View style={[styles.preview, { backgroundColor: '#0B0D12', borderColor: theme.border }]}>
      <ThemedText numberOfLines={1} style={styles.pvTitle}>
        {d.title || title}
      </ThemedText>
      <View style={styles.pvGrid}>
        {Array.from({ length: g.rows }).map((_, r) => (
          <View key={r} style={styles.pvRow}>
            {Array.from({ length: g.cols }).map((__, c) => {
              const name = tiles[r * g.cols + c];
              return (
                <View key={c} style={[styles.pvTile, { opacity: name ? 1 : 0 }]}>
                  <ThemedText style={styles.pvCourt}>{d.show_court ? name : ''}</ThemedText>
                  <ThemedText style={styles.pvName}>Ali Khan{d.show_school ? ' · School' : ''}</ThemedText>
                  <ThemedText style={styles.pvScore}>21 · 14   17</ThemedText>
                  <ThemedText style={styles.pvName}>Usman Tariq</ThemedText>
                  <ThemedText style={styles.pvScore}>18 · 21   15</ThemedText>
                </View>
              );
            })}
          </View>
        ))}
      </View>
      <ThemedText numberOfLines={1} style={styles.pvFoot}>
        {[d.show_up_next ? 'Up next · 4:30 Hamza vs Faraz' : null, d.show_app_promo ? 'Follow live in the Sportron app' : null].filter(Boolean).join('   ·   ')}
      </ThemedText>
    </View>
  );
}

/**
 * Tournament admins: the projector link (on by default), its address, what the screen shows and how courts are laid out.
 * Every switch saves on change (optimistic, reverts with a toast on error).
 */
export function ProjectorCard({ tournamentId, tournamentName }: { tournamentId: string; tournamentName: string }) {
  const theme = useTheme();
  const enabled = useFlag('live_scoring', false);
  const { fields } = useTournamentFields(tournamentId);
  const [settings, setSettings] = useState<LiveSettings | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [codeSheet, setCodeSheet] = useState(false);
  const [custom, setCustom] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [courtInput, setCourtInput] = useState('');

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetchLiveSettings(tournamentId)
      .then((r) => {
        if (alive) setSettings(r);
      })
      .catch((e) => {
        if (alive && isLiveUnavailable(e)) setUnavailable(true);
      });
    return () => {
      alive = false;
    };
  }, [enabled, tournamentId]);

  if (!enabled || unavailable || !settings) return null;

  const display = resolveLiveDisplay(settings.live_display);
  const url = `${settings.base_url.replace(/\/$/, '')}/${settings.live_code}`;
  const publicFields = fields.filter((f) => f.is_public && !f.is_core && !f.archived_at);

  const patch = async (p: Partial<LiveDisplaySettings>) => {
    const before = settings;
    setSettings({ ...settings, live_display: { ...settings.live_display, ...p } });
    try {
      const next = await setLiveDisplay(tournamentId, p);
      setSettings((s) => (s ? { ...s, live_display: next } : s));
    } catch (e) {
      setSettings(before);
      toast('Couldn’t save', friendlyTournamentError(e), 'error');
    }
  };

  const toggleLink = (on: boolean) => {
    const run = async () => {
      setBusy(true);
      try {
        const r = await setLivePublic(tournamentId, on);
        setSettings((s) => (s ? { ...s, live_public: r.live_public, live_code: r.live_code } : s));
      } catch (e) {
        toast('Couldn’t change the link', friendlyTournamentError(e), 'error');
      } finally {
        setBusy(false);
      }
    };
    if (on) void run();
    else
      alert('Turn off the projector link?', 'Screens showing it will stop updating. You can turn it back on any time — the link stays the same.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Turn off', style: 'destructive', onPress: () => void run() },
      ]);
  };

  const changeCode = async (code: string | null) => {
    setBusy(true);
    setCodeError(null);
    try {
      const next = await setLiveCode(tournamentId, code);
      setSettings((s) => (s ? { ...s, live_code: next } : s));
      setCodeSheet(false);
      setCustom('');
      toast('Link changed', 'The old link has stopped working.');
    } catch (e) {
      setCodeError(friendlyTournamentError(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmChange = (code: string | null) =>
    alert('Change the link?', 'The old link stops working. Screens using it will need the new one.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Change link', style: 'destructive', onPress: () => void changeCode(code) },
    ]);

  const customValid = /^[a-z0-9][a-z0-9-]{2,22}[a-z0-9]$/.test(custom);

  const moveCourt = (i: number, d: number) => {
    const list = display.courts.slice();
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    void patch({ courts: list });
  };
  const addCourt = (name: string) => {
    const n = name.trim();
    if (!n || display.courts.some((c) => c.toLowerCase() === n.toLowerCase()) || display.courts.length >= 12) return;
    void patch({ courts: [...display.courts, n] });
    setCourtInput('');
  };

  const input = [styles.input, { color: theme.text, borderColor: theme.inputBorder, backgroundColor: theme.inputBackground }];

  return (
    <View style={{ gap: Spacing.sm }}>
      <SectionLabel>Projector screen</SectionLabel>
      <View style={[styles.box, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
        <SwitchRow
          label="Projector link"
          hint="Show live scores on a big screen at the venue. No sign-in needed to view it."
          value={settings.live_public}
          onChange={(v) => !busy && toggleLink(v)}
        />

        {settings.live_public && (
          <>
            <View style={[styles.linkBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <ThemedText variant="caption" muted>
                Open this on the venue PC and press F11
              </ThemedText>
              <ThemedText selectable style={{ fontWeight: '800', fontSize: 16 }}>
                {url}
              </ThemedText>
              <ThemedText variant="caption" muted>
                Code
              </ThemedText>
              <ThemedText selectable style={{ fontWeight: '900', fontSize: 30, letterSpacing: 2 }}>
                {settings.live_code}
              </ThemedText>
              <ThemedText variant="caption" muted>
                One screen per court: add ?court=Court 1 to the link.
              </ThemedText>
            </View>
            <View style={styles.row}>
              <BarButton label="Share link" style={{ flex: 1 }} onPress={() => share({ message: `Live scores screen: ${url}`, url })} />
              <BarButton label="Change link" style={{ flex: 1 }} onPress={() => { setCodeError(null); setCodeSheet(true); }} />
            </View>
          </>
        )}
      </View>

      {settings.live_public && (
        <>
          <View style={[styles.box, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
            <ThemedText variant="label" muted>
              What the screen shows
            </ThemedText>
            <SwitchRow label="School" hint="Under each name" value={display.show_school} onChange={(v) => void patch({ show_school: v })} />
            {publicFields.map((f) => {
              const on = display.show_fields.includes(f.id);
              return (
                <SwitchRow
                  key={f.id}
                  label={f.label}
                  hint={!on && display.show_fields.length >= 2 ? 'Up to 2 extra fields' : undefined}
                  value={on}
                  onChange={(v) => {
                    if (v && display.show_fields.length >= 2) return;
                    void patch({ show_fields: v ? [...display.show_fields, f.id] : display.show_fields.filter((x) => x !== f.id) });
                  }}
                />
              );
            })}
            <SwitchRow label="Sport name" value={display.show_module} onChange={(v) => void patch({ show_module: v })} />
            <SwitchRow label="Court" value={display.show_court} onChange={(v) => void patch({ show_court: v })} />
            <SwitchRow label="Up next" value={display.show_up_next} onChange={(v) => void patch({ show_up_next: v })} />
            <SwitchRow label="Recent results" value={display.show_recent} onChange={(v) => void patch({ show_recent: v })} />
            <SwitchRow
              label="“Follow live in the app” footer"
              hint={settings.promo_locked ? 'Always on for this organization’s events' : undefined}
              value={settings.promo_locked || display.show_app_promo}
              disabled={settings.promo_locked}
              onChange={(v) => void patch({ show_app_promo: v })}
            />
            <ThemedText variant="caption" muted>
              Private details like phone, email and CMS ID are never shown.
            </ThemedText>
            <ThemedText variant="label" muted>
              Title
            </ThemedText>
            <TextInput
              defaultValue={display.title ?? ''}
              placeholder={tournamentName}
              placeholderTextColor={theme.placeholder}
              maxLength={60}
              onEndEditing={(e) => {
                const t = e.nativeEvent.text.trim();
                if (t !== (display.title ?? '')) void patch({ title: t || null });
              }}
              style={input}
            />
          </View>

          <View style={[styles.box, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
            <ThemedText variant="label" muted>
              Courts & layout
            </ThemedText>
            <ThemedText variant="caption" muted>
              Pinned courts always keep their place on the screen, in this order.
            </ThemedText>
            {display.courts.map((c, i) => (
              <View key={c} style={styles.courtRow}>
                <ThemedText style={{ flex: 1, fontWeight: '700' }}>{c}</ThemedText>
                <Pressable onPress={() => moveCourt(i, -1)} hitSlop={8} accessibilityLabel={`Move ${c} up`} style={styles.iconBtn}>
                  <ChevronUp size={20} color={theme.text} />
                </Pressable>
                <Pressable onPress={() => moveCourt(i, 1)} hitSlop={8} accessibilityLabel={`Move ${c} down`} style={styles.iconBtn}>
                  <ChevronDown size={20} color={theme.text} />
                </Pressable>
                <Pressable onPress={() => void patch({ courts: display.courts.filter((x) => x !== c) })} hitSlop={8} accessibilityLabel={`Remove ${c}`} style={styles.iconBtn}>
                  <X size={20} color={theme.error} />
                </Pressable>
              </View>
            ))}
            <View style={styles.row}>
              <TextInput
                value={courtInput}
                onChangeText={setCourtInput}
                onSubmitEditing={() => addCourt(courtInput)}
                placeholder="Add a court, e.g. Court 4"
                placeholderTextColor={theme.placeholder}
                maxLength={40}
                style={[...input, { flex: 1 }]}
              />
              <BarButton label="Add" icon={<Plus size={18} color={theme.text} />} onPress={() => addCourt(courtInput)} />
            </View>
            {display.courts.length === 0 && (
              <BarButton label="Add Court 1–3" onPress={() => void patch({ courts: ['Court 1', 'Court 2', 'Court 3'] })} />
            )}

            <ThemedText variant="label" muted>
              Layout
            </ThemedText>
            <View style={styles.wrap}>
              {(['auto', 'row', 'grid'] as const).map((l) => (
                <Chip key={l} label={l === 'auto' ? 'Auto' : l === 'row' ? 'Side by side' : 'Grid'} selected={display.layout === l} onPress={() => void patch({ layout: l })} />
              ))}
            </View>
            <ThemedText variant="label" muted>
              Courts per screen
            </ThemedText>
            <View style={styles.wrap}>
              {[2, 3, 4, 6, 8].map((n) => (
                <Chip key={n} label={String(n)} selected={display.max_per_page === n} onPress={() => void patch({ max_per_page: n })} />
              ))}
            </View>
            <ThemedText variant="label" muted>
              Keep FINAL on the court for
            </ThemedText>
            <View style={styles.wrap}>
              {HOLD_OPTIONS.map((o) => (
                <Chip key={o.value} label={o.label} selected={display.final_hold_seconds === o.value} onPress={() => void patch({ final_hold_seconds: o.value })} />
              ))}
            </View>
            <ThemedText variant="label" muted>
              Preview
            </ThemedText>
            <Preview d={display} title={tournamentName} />
          </View>
        </>
      )}

      <BottomSheet visible={codeSheet} onClose={() => setCodeSheet(false)}>
        <SheetScrollView contentContainerStyle={{ gap: Spacing.md, paddingBottom: Spacing.lg }} keyboardShouldPersistTaps="handled">
          <ThemedText variant="heading">Change the link</ThemedText>
          <ThemedText muted>The old link stops working straight away.</ThemedText>
          <BarButton label="New random link" disabled={busy} onPress={() => confirmChange(null)} />
          <ThemedText variant="label" muted>
            Or choose your own
          </ThemedText>
          <TextInput
            value={custom}
            onChangeText={(t) => {
              setCustom(t.toLowerCase().replace(/[^a-z0-9-]/g, ''));
              setCodeError(null);
            }}
            placeholder="e.g. seecs-open"
            placeholderTextColor={theme.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={24}
            style={input}
          />
          <ThemedText variant="caption" muted>
            4–24 letters, numbers or dashes. {settings.base_url.replace(/\/$/, '')}/{custom || 'your-link'}
          </ThemedText>
          {codeError ? <ThemedText style={{ color: theme.error, fontWeight: '600' }}>{codeError}</ThemedText> : null}
          <BarButton label="Use this link" tone="primary" disabled={busy || !customValid} onPress={() => confirmChange(custom)} />
        </SheetScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.sm },
  row: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: Radius.full, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 44 },
  linkBox: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, gap: 2 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, fontSize: 16 },
  courtRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  preview: { aspectRatio: 16 / 9, borderRadius: Radius.md, borderWidth: 1, padding: 8, gap: 4, overflow: 'hidden' },
  pvTitle: { color: '#fff', fontWeight: '800', fontSize: 11, textAlign: 'center' },
  pvGrid: { flex: 1, gap: 4 },
  pvRow: { flex: 1, flexDirection: 'row', gap: 4 },
  pvTile: { flex: 1, backgroundColor: '#161A22', borderRadius: 6, padding: 4, justifyContent: 'center' },
  pvCourt: { color: '#94A3B8', fontSize: 8, fontWeight: '800' },
  pvName: { color: '#E2E8F0', fontSize: 8, fontWeight: '700' },
  pvScore: { color: '#fff', fontSize: 10, fontWeight: '900' },
  pvFoot: { color: '#94A3B8', fontSize: 8, textAlign: 'center' },
});
