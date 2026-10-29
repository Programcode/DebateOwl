import {
  canDeleteCard,
  canLink,
  cardLinks,
  deleteCard,
  editCard,
  findNode,
  flowNodes,
  linkCards,
  unlinkCards,
  type FlowEdgeKind,
  type FlowNodeType,
} from '@debatelab/core/flowchart';
import { useState, type ComponentType, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ActionMenu } from './action-menu';
import { TextButton } from './buttons';
import { Chip } from './chip';
import { CardForm } from './flowchart-card-form';
import { useFlowColors } from './flowchart-views';
import { Icon } from './icon';
import { SegmentedControl } from './segmented-control';
import { Text } from './text';

import { confirmDestructive } from '@/lib/confirm';
import { findDraft, updateDraft, useFlowchartDrafts } from '@/lib/flowchart-drafts';
import { cardKind, linkLine, linkSummary, typeLabel } from '@/lib/flowchart-text';
import { useHeaderCover } from '@/lib/layout';
import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

const TYPES: FlowNodeType[] = ['contention', 'attack', 'rebuttal', 'dropped'];

/** The kind a new link starts on: what this card's type usually does. */
function defaultKind(type: FlowNodeType): FlowEdgeKind {
  return type === 'attack' ? 'attack' : type === 'rebuttal' ? 'rebuttal' : 'support';
}

/** The scroll view the claim sits in: the form sheet's on a phone, the docked inspector's on iPad. */
export type ClaimContainer = ComponentType<{ children: ReactNode; testID?: string }>;

/**
 * A card's claim, as mock A: its type, text and links, and the website's
 * actions on a node: link it, edit it, change its type, or delete it. Every
 * change lands in the map on screen at once and stays unsaved until Save.
 * A phone shows it in a form sheet; iPad docks it beside the map (mock C),
 * where the inspector's own header closes it. Mount it with a key per card.
 */
export function ClaimPanel({
  scope,
  map,
  nodeId,
  container: Container,
  onClose,
  docked = false,
}: {
  scope: string;
  map: string;
  nodeId: string;
  container: ClaimContainer;
  onClose: () => void;
  docked?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const flow = useFlowColors();
  useFlowchartDrafts();
  // `map` is the map's handle, so a save that changes its key while the sheet is open keeps it.
  const held = scope && map ? findDraft(scope, map) : null;
  const draft = held?.draft;
  const node = draft && nodeId ? findNode(draft.doc, nodeId) : undefined;
  const [mode, setMode] = useState<'view' | 'link' | 'edit'>('view');
  const [kind, setKind] = useState<FlowEdgeKind>(() => defaultKind(node?.data.type ?? 'contention'));
  const [typeMenu, setTypeMenu] = useState(false);

  if (!held || !draft || !node) {
    return (
      <Container testID="claim-sheet">
        <Text tone="secondary" style={styles.body}>
          {t('mobile.flowchart.cardGone')}
        </Text>
        <TextButton label={t('common.close')} onPress={onClose} />
      </Container>
    );
  }

  // Found again when it runs: a save while a confirm was open may have moved the map to a new key.
  const change = (edit: Parameters<typeof updateDraft>[2]) => {
    const now = findDraft(scope, map);
    if (now) updateDraft(scope, now.key, edit);
  };
  const { responds, answeredBy } = cardLinks(draft.doc, node.id);
  const links = [...responds.map((link) => ({ link, direction: 'responds' as const })), ...answeredBy.map((link) => ({ link, direction: 'answeredBy' as const }))];
  const deletable = canDeleteCard(node.id);
  const isThesis = node.data.type === 'thesis';

  const remove = async () => {
    const confirmed = await confirmDestructive({
      title: t('mobile.flowchart.deleteNodeTitle'),
      message: t('mobile.flowchart.deleteNodeDescription', { label: node.data.label }),
      confirm: t('mobile.flowchart.deleteNodeConfirm'),
      cancel: t('common.cancel'),
    });
    if (!confirmed) return;
    change((current) => ({ ...current, doc: deleteCard(current.doc, node.id), edited: true }));
    onClose();
  };

  const header = (
    <View style={styles.top}>
      <View style={styles.topText}>
        <Text weight="semibold" style={[styles.who, { color: flow.type[node.data.type] }]}>
          {cardKind(t, node)}
        </Text>
        <Text accessibilityRole="header" weight="display" style={styles.title} selectable>
          {node.data.label}
        </Text>
      </View>
      {docked ? null : <TextButton label={t('common.close')} onPress={onClose} />}
    </View>
  );

  if (mode === 'edit') {
    return (
      <Container testID="claim-sheet">
        {header}
        <Text accessibilityRole="header" weight="semibold" style={styles.section}>
          {t('flowchart.editNode')}
        </Text>
        <CardForm
          initial={{ label: node.data.label, description: node.data.description ?? '', type: node.data.type, strength: node.data.strength ?? 'moderate' }}
          submitLabel={t('flowchart.saveChanges')}
          onSubmit={(fields) => {
            change((current) => ({ ...current, doc: editCard(current.doc, node.id, fields), edited: true }));
            setMode('view');
          }}
        />
        <TextButton label={t('common.cancel')} onPress={() => setMode('view')} />
      </Container>
    );
  }

  if (mode === 'link') {
    const others = flowNodes(draft.doc).filter((other) => other.id !== node.id);
    return (
      <Container testID="claim-sheet">
        {header}
        <View style={styles.block}>
          <Text accessibilityRole="header" weight="semibold" style={styles.section}>
            {t('mobile.flowchart.linkTitle')}
          </Text>
          <Text tone="secondary" style={styles.body}>
            {t('mobile.flowchart.linkHint')}
          </Text>
        </View>
        <SegmentedControl
          options={[
            { value: 'support', label: t('flowchart.edgeSupport') },
            { value: 'attack', label: t('flowchart.edgeAttack') },
            { value: 'rebuttal', label: t('flowchart.edgeRebuttal') },
          ]}
          value={kind}
          onChange={setKind}
        />
        <View style={[styles.list, { backgroundColor: flow.cardFill, borderColor: colors.border }]} testID="link-targets">
          {others.map((other, index) => {
            const allowed = canLink(draft.doc, other.id, node.id);
            return (
              <Pressable
                key={index}
                accessibilityRole="button"
                accessibilityState={{ disabled: !allowed }}
                disabled={!allowed}
                onPress={() => {
                  change((current) => ({ ...current, doc: linkCards(current.doc, other.id, node.id, kind), edited: true }));
                  setMode('view');
                }}
                style={({ pressed }) => [styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }, pressed && styles.pressed, !allowed && styles.disabled]}
                testID="link-target">
                <View style={[styles.dot, { backgroundColor: flow.type[other.data.type] }]} />
                <View style={styles.rowText}>
                  <Text weight="medium" style={styles.rowLabel} numberOfLines={2}>
                    {other.data.label}
                  </Text>
                  <Text tone="faint" style={styles.rowMeta}>
                    {allowed ? typeLabel(t, other.data.type) : t('mobile.flowchart.alreadyLinked')}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <TextButton label={t('common.cancel')} onPress={() => setMode('view')} />
      </Container>
    );
  }

  return (
    <Container testID="claim-sheet">
      {header}
      {node.data.description ? (
        <Text tone="secondary" style={styles.body} selectable>
          {node.data.description}
        </Text>
      ) : null}
      <Text style={styles.body} testID="claim-summary">
        {linkSummary(t, draft.doc, node)}
      </Text>
      <View style={styles.chips}>
        <Chip icon="link" label={t('mobile.flowchart.linkClaim')} onPress={() => setMode('link')} testID="claim-link" />
        <Chip icon="note" label={t('flowchart.edit')} onPress={() => setMode('edit')} testID="claim-edit" />
        {isThesis ? null : <Chip icon="branch" label={t('mobile.flowchart.changeType')} onPress={() => setTypeMenu(true)} testID="claim-type" />}
      </View>
      {links.length > 0 ? (
        <View style={styles.block}>
          <Text accessibilityRole="header" weight="semibold" style={styles.section}>
            {t('mobile.flowchart.linksTitle')}
          </Text>
          <View style={[styles.list, { backgroundColor: flow.cardFill, borderColor: colors.border }]}>
            {links.map(({ link, direction }, index) => {
              const line = linkLine(t, link.kind, direction, link.other);
              return (
                <View key={index} style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
                  <View style={[styles.dot, { backgroundColor: flow.via[link.kind] }]} />
                  <Text style={[styles.rowLabel, styles.rowText]}>{line}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('mobile.flowchart.removeLink', { link: line })}
                    hitSlop={8}
                    onPress={() => change((current) => ({ ...current, doc: unlinkCards(current.doc, link.edgeId), edited: true }))}
                    style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
                    testID="remove-link">
                    <Icon name="x" color={colors.tabInactive} size={18} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
      {deletable ? <TextButton destructive label={t('flowchart.delete')} onPress={() => void remove()} /> : null}
      <ActionMenu
        visible={typeMenu}
        title={t('mobile.flowchart.changeType')}
        items={TYPES.filter((type) => type !== node.data.type).map((type) => ({ key: type, label: typeLabel(t, type) }))}
        cancelLabel={t('common.cancel')}
        onClose={() => setTypeMenu(false)}
        onSelect={(type) =>
          change((current) => ({
            ...current,
            doc: editCard(current.doc, node.id, {
              label: node.data.label,
              description: node.data.description ?? '',
              type: type as FlowNodeType,
              strength: node.data.strength ?? 'moderate',
            }),
            edited: true,
          }))
        }
      />
    </Container>
  );
}

/** The claim's scroll view in the docked inspector. */
function DockScrollView({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <ScrollView contentContainerStyle={styles.dockContent} automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" testID={testID}>
      {children}
    </ScrollView>
  );
}

/**
 * The claim docked beside the map on iPad (iPad mock C), in place of the form
 * sheet. It stays open while the student moves between cards; each card gets
 * a fresh panel, so a half-made link or edit never carries over.
 */
export function ClaimInspector({ claim, width, onClose }: { claim: { scope: string; map: string; node: string }; width: number; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const covered = useHeaderCover();
  return (
    <View style={[styles.inspector, { width, paddingTop: covered, borderLeftColor: colors.line, backgroundColor: colors.background }]} testID="claim-inspector">
      <View style={[styles.inspectorHead, { borderBottomColor: colors.line }]}>
        <Text accessibilityRole="header" weight="display" style={styles.inspectorTitle}>
          {t('export.claim')}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} hitSlop={8} onPress={onClose} style={styles.remove} testID="claim-close">
          <Icon name="x" color={colors.tabInactive} size={20} />
        </Pressable>
      </View>
      <ClaimPanel key={`${claim.scope}:${claim.map}:${claim.node}`} scope={claim.scope} map={claim.map} nodeId={claim.node} container={DockScrollView} onClose={onClose} docked />
    </View>
  );
}

const styles = StyleSheet.create({
  inspector: { flexGrow: 0, flexShrink: 0, borderLeftWidth: StyleSheet.hairlineWidth },
  inspectorHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 12, minHeight: 50, borderBottomWidth: StyleSheet.hairlineWidth },
  inspectorTitle: { fontSize: 17 },
  dockContent: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 32, gap: 18 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  topText: { flex: 1, gap: 4 },
  who: { fontSize: 14 },
  title: { fontSize: 21, lineHeight: 27, letterSpacing: -0.3 },
  body: { fontSize: 15.5, lineHeight: 22 },
  section: { fontSize: 16 },
  block: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  list: { borderWidth: 2, borderRadius: radius.field, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11, minHeight: 50 },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 15.5, lineHeight: 21 },
  rowMeta: { fontSize: 13, lineHeight: 17 },
  dot: { width: 10, height: 10, borderRadius: 3 },
  remove: { minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.45 },
});
