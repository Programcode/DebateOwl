import { BUILT_IN_FORMAT_IDS, FORMATS, questioningSegments, type BuiltInFormatId } from '@debatelab/core/free-tools/formats';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { MainActionButton } from '@/components/buttons';
import { DocumentScreen, DocumentTitle } from '@/components/document';
import { DocumentHeader } from '@/components/document-header';
import { Field } from '@/components/field';
import { FormGroup, SelectRow, SwitchRow } from '@/components/form-rows';
import { backLabel } from '@/lib/back-label';
import { showNotice } from '@/lib/confirm';
import { sharePdf } from '@/lib/export';
import { flowSheetExportHtml } from '@/lib/export-html';
import { useLayoutClass } from '@/lib/layout';

/** The website's flow sheet controls, with the result sent to the PDF share sheet. */
export default function FlowSheetScreen() {
  const { t } = useTranslation();
  const tools = (key: string) => t(key, { ns: 'tools' });
  const { from } = useLocalSearchParams<{ from?: string }>();
  const tablet = useLayoutClass() !== 'phone';
  const [formatId, setFormatId] = useState<BuiltInFormatId>('pf');
  const [paper, setPaper] = useState<'letter' | 'a4'>('letter');
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [strip, setStrip] = useState(true);
  const [header, setHeader] = useState({ motion: '', round: '', judge: '' });
  const [exporting, setExporting] = useState(false);
  const format = FORMATS[formatId];

  const exportPdf = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const [short, long] = paper === 'a4' ? [595.28, 841.89] : [612, 792];
      await sharePdf(
        flowSheetExportHtml({ format, paper, orientation, strip, ...header }, tools),
        `DebateFlowSheet_${formatId}.pdf`,
        tools('flow.region'),
        orientation === 'landscape' ? { width: long, height: short } : { width: short, height: long },
      );
    } catch {
      showNotice(t('mobile.flowSheet.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <DocumentScreen
      testID="flow-sheet"
      header={<DocumentHeader backLabel={backLabel(t, from, 'practice')} actions={[]} />}
      actions={<MainActionButton label={tools('flow.print')} busy={exporting} onPress={() => void exportPdf()} />}>
      <DocumentTitle title={tools('flow.region')} meta={t('mobile.practice.flowSheetDesc')} />
      <FormGroup>
        <SelectRow<BuiltInFormatId> first label={tools('flow.format')} value={formatId} onChange={setFormatId}
          options={BUILT_IN_FORMAT_IDS.map((value) => ({ value, label: FORMATS[value].name }))} />
        <SelectRow<'letter' | 'a4'> label={tools('flow.paper')} value={paper} onChange={setPaper}
          options={[{ value: 'letter', label: tools('flow.letter') }, { value: 'a4', label: tools('flow.a4') }]} />
        <SelectRow<'landscape' | 'portrait'> label={tools('flow.orientation')} value={orientation} onChange={setOrientation}
          options={[{ value: 'landscape', label: tools('flow.landscape') }, { value: 'portrait', label: tools('flow.portrait') }]} />
        <SwitchRow label={tools(questioningSegments(format).length > 0 ? 'flow.questionStrip' : 'flow.notesStrip')} value={strip} onChange={setStrip} />
      </FormGroup>
      <Field label={tools('flow.motion')} value={header.motion} maxLength={200} onChangeText={(motion) => setHeader((current) => ({ ...current, motion }))} />
      <View style={[styles.fields, tablet && styles.tabletFields]}>
        {(['round', 'judge'] as const).map((key) => (
          <View key={key} style={tablet ? styles.field : undefined}>
            <Field label={tools(`flow.${key}`)} value={header[key]} maxLength={60} onChangeText={(value) => setHeader((current) => ({ ...current, [key]: value }))} />
          </View>
        ))}
      </View>
    </DocumentScreen>
  );
}

const styles = StyleSheet.create({
  fields: { gap: 16 },
  tabletFields: { flexDirection: 'row' },
  field: { flex: 1 },
});
