import type { AskOutput } from '@debatelab/core/ai/schemas/ask';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { SuccessCheck } from './success-check';
import { Chip, CiteBadge } from './chip';
import { FadingScrollRow } from './edge-fade';
import { firstUrl, hostOf, openCitation, shorten, type CitationTarget } from './citation-target';
import { Icon } from './icon';
import { MarkdownView } from './markdown-view';
import { OwlAvatar } from './owl';
import { Text } from './text';

import { useTheme } from '@/theme/use-theme';

import type { Source } from '@/lib/sources';

/** Each citation as a chip: a Library source opens its detail, a web address opens the in-app browser. */
function citationTargets(output: AskOutput | undefined, library: Source[]): CitationTarget[] {
  return (output?.citations ?? []).map((citation, index) => {
    const n = index + 1;
    const source = citation.source?.trim() ?? '';
    const url = firstUrl(source);
    if (url) {
      const found = output?.searchInfo?.sources.find((item) => item.url === url);
      const named = source.replace(url, '').replace(/[\s,:;()–-]+$/u, '').replace(/^[\s,:;()–-]+/u, '');
      return { n, label: shorten(found?.title || named || hostOf(url)), url };
    }
    const needle = source.toLocaleLowerCase();
    const match = needle ? library.find((item) => item.title.trim() && needle.includes(item.title.trim().toLocaleLowerCase())) : undefined;
    if (match) return { n, label: shorten(match.title), sourceId: match.id };
    return { n, label: shorten(source || citation.claim) };
  });
}

/** One coach answer, as in mock 07, with the website's extra sections when the answer has them. */
export function AskAnswer({
  content,
  output,
  streaming,
  library,
  onSave,
}: {
  content: string;
  output?: AskOutput;
  streaming?: boolean;
  library: Source[];
  /** Saves the answer to the Library's Ask folder; resolves whether it was saved. */
  onSave?: () => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const targets = useMemo(() => citationTargets(output, library), [output, library]);
  const claims = useMemo(() => (output?.citations ?? []).map((citation) => citation.claim), [output]);
  const cited = new Set(targets.map((target) => target.url).filter(Boolean));
  const webSources = (output?.searchInfo?.webSearchUsed ? output.searchInfo.sources : []).filter((item) => !cited.has(item.url));

  const open = (target: CitationTarget | undefined) => openCitation(router, target);

  return (
    <View style={styles.answer} testID={streaming ? 'ask-streaming' : 'ask-answer'}>
      <OwlAvatar pose="coach" size={30} label={t('askChat.coachAvatarAlt')} />
      {content || streaming ? (
        <MarkdownView source={content} claims={claims} streaming={streaming} onCite={(n) => open(targets[n - 1])} />
      ) : null}

      {/* Ask's answers sit on the card colour, so the row fades into it. */}
      {targets.length > 0 || webSources.length > 0 ? (
        <FadingScrollRow color={colors.card} id={`ask-cites-fade-${streaming ? 'live' : 'saved'}`} style={styles.chipRow} contentContainerStyle={styles.chips}>
          {targets.map((target) => (
            <Chip key={target.n} label={target.label} leading={<CiteBadge n={target.n} />} onPress={() => open(target)} />
          ))}
          {webSources.map((item) => (
            <Chip key={item.url} icon="globe" label={shorten(item.title || hostOf(item.url))} onPress={() => void WebBrowser.openBrowserAsync(item.url)} />
          ))}
        </FadingScrollRow>
      ) : null}

      {output?.prosConsAnalysis ? (
        <View style={styles.section}>
          <Section title={t('askChat.pros')} items={output.prosConsAnalysis.pros} marker="✓" />
          <Section title={t('askChat.cons')} items={output.prosConsAnalysis.cons} marker="✗" />
        </View>
      ) : null}

      {output?.argumentMap ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" weight="semibold" tone="secondary" style={styles.sectionTitle}>
            {t('askChat.argumentMap')}
          </Text>
          <Section title={t('askChat.mainClaim')} items={[output.argumentMap.mainClaim]} />
          <Section title={t('askChat.supportingPoints')} items={output.argumentMap.supportingPoints} />
          <Section title={t('askChat.counterpoints')} items={output.argumentMap.counterpoints} />
          <Section title={t('askChat.assumptions')} items={output.argumentMap.assumptions} />
        </View>
      ) : null}

      {output?.followUpQuestions.length ? <Section title={t('askChat.followUp')} items={output.followUpQuestions} /> : null}
      {output?.uncertainties.length ? <Section title={t('askChat.uncertainties')} items={output.uncertainties} /> : null}
      {onSave && !streaming ? <SaveToLibrary onSave={onSave} /> : null}
    </View>
  );
}

/** The website's bookmark on an answer: saved, it turns into the mint check. */
function SaveToLibrary({ onSave }: { onSave: () => Promise<boolean> }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  if (state === 'saved') {
    return (
      <View style={styles.saved} accessibilityRole="text" testID="ask-saved">
        <SuccessCheck size={20} haptic={false} />
        <Text weight="semibold" style={[styles.saveText, { color: colors.success }]}>
          {t('ask.saved')}
        </Text>
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('askChat.saveMessage')}
      disabled={state === 'saving'}
      hitSlop={6}
      onPress={() => {
        setState('saving');
        void onSave().then((saved) => setState(saved ? 'saved' : 'idle'));
      }}
      style={({ pressed }) => [styles.save, pressed && styles.pressed]}
      testID="ask-save">
      {state === 'saving' ? <ActivityIndicator size="small" color={colors.primary} /> : <Icon name="bookmark" color={colors.primary} size={17} />}
      <Text weight="semibold" style={[styles.saveText, { color: colors.primary }]}>
        {t('askChat.saveToLibrary')}
      </Text>
    </Pressable>
  );
}

function Section({ title, items, marker = '•' }: { title: string; items: string[]; marker?: string }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.sectionBody}>
      <Text accessibilityRole="header" weight="semibold" tone="secondary" style={styles.sectionTitle}>
        {title}
      </Text>
      {items.map((item, index) => (
        <Text key={index} tone="secondary" style={styles.sectionItem}>
          {`${marker} ${item}`}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  answer: { gap: 12 },
  chipRow: { marginHorizontal: -20 },
  chips: { gap: 8, paddingHorizontal: 20 },
  section: { gap: 10 },
  sectionBody: { gap: 3 },
  sectionTitle: { fontSize: 14 },
  sectionItem: { fontSize: 15, lineHeight: 21 },
  save: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 32 },
  saved: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', minHeight: 32 },
  savedCheck: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 14.5 },
  pressed: { opacity: 0.6 },
});
