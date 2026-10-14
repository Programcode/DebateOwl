import type { CardFields, FlowNodeType, FlowStrength } from '@debatelab/core/flowchart';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { PrimaryButton } from './buttons';
import { Field } from './field';
import { FormGroup, SelectRow } from './form-rows';

/** The types the website's add and edit dialog offers; the thesis is never chosen. */
const CHOOSABLE: FlowNodeType[] = ['contention', 'attack', 'rebuttal', 'dropped'];

/**
 * The website's add and edit node dialog: type, label, description and, for an
 * argument, its strength. A thesis keeps its type, as on the website.
 */
export function CardForm({ initial, submitLabel, onSubmit }: { initial: CardFields; submitLabel: string; onSubmit: (fields: CardFields) => void }) {
  const { t } = useTranslation();
  const [fields, setFields] = useState(initial);
  const set = (patch: Partial<CardFields>) => setFields((previous) => ({ ...previous, ...patch }));
  const thesis = initial.type === 'thesis';
  return (
    <>
      {thesis ? null : (
        <FormGroup>
          <SelectRow<FlowNodeType>
            first
            label={t('flowchart.typeField')}
            value={fields.type}
            onChange={(type) => set({ type })}
            options={CHOOSABLE.map((type) => ({ value: type, label: t(TYPE_OPTION[type]) }))}
            testID="card-type"
          />
          {fields.type === 'contention' ? (
            <SelectRow<FlowStrength>
              label={t('flowchart.strengthField')}
              value={fields.strength}
              onChange={(strength) => set({ strength })}
              options={[
                { value: 'strong', label: t('flowchart.strengthStrong') },
                { value: 'moderate', label: t('flowchart.strengthModerate') },
                { value: 'weak', label: t('flowchart.strengthWeak') },
              ]}
              testID="card-strength"
            />
          ) : null}
        </FormGroup>
      )}
      <Field
        label={t('flowchart.labelField')}
        placeholder={t('flowchart.labelPlaceholder')}
        value={fields.label}
        onChangeText={(label) => set({ label })}
        testID="card-label"
      />
      <Field
        label={t('flowchart.descriptionField')}
        placeholder={t('flowchart.descPlaceholder')}
        value={fields.description}
        onChangeText={(description) => set({ description })}
        multiline
        style={styles.description}
        testID="card-description"
      />
      <PrimaryButton
        label={submitLabel}
        disabled={!fields.label.trim()}
        onPress={() => onSubmit({ ...fields, label: fields.label.trim() })}
        testID="card-submit"
      />
    </>
  );
}

const TYPE_OPTION: Record<FlowNodeType, string> = {
  thesis: 'flowchart.legendThesis',
  contention: 'flowchart.typeArgument',
  attack: 'flowchart.typeAttack',
  rebuttal: 'flowchart.typeRebuttal',
  dropped: 'flowchart.typeDropped',
};

const styles = StyleSheet.create({
  description: { minHeight: 110, paddingTop: 13, paddingBottom: 13, textAlignVertical: 'top' },
});
