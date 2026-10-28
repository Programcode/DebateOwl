import { GENERAL_FOLDER } from '@debatelab/core/library';
import { useTranslation } from 'react-i18next';

import { FormGroup, SelectRow } from './form-rows';
import { folderLabel } from './source-display';

import { promptText } from '@/lib/confirm';

const NEW_FOLDER = '\u0000new';

/**
 * The folder a source goes in, as the website's Folder select, with New folder
 * at the end: the name typed is used at once and saved with the source.
 */
export function FolderSelect({
  folders,
  value,
  onChange,
  disabled,
}: {
  folders: string[];
  value: string;
  onChange: (folder: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  // General first, as the website lists it; a folder only this form knows is kept.
  const names = Array.from(new Set([GENERAL_FOLDER, ...folders, value])).filter(Boolean);
  const pick = async (choice: string) => {
    if (choice !== NEW_FOLDER) {
      onChange(choice);
      return;
    }
    const name = await promptText({
      title: t('libraryPage.newFolder'),
      message: '',
      defaultValue: '',
      confirm: t('libraryPage.createFolder'),
      cancel: t('common.cancel'),
    });
    if (name?.trim()) onChange(name.trim());
  };
  return (
    <FormGroup>
      <SelectRow
        first
        label={t('libraryPage.folder')}
        value={value}
        disabled={disabled}
        testID="folder-select"
        options={[
          ...names.map((name) => ({ value: name, label: folderLabel(t, name) })),
          { value: NEW_FOLDER, label: `${t('libraryPage.newFolder')}…` },
        ]}
        onChange={(choice) => void pick(choice)}
      />
    </FormGroup>
  );
}
