import {
  Alert,
  Button,
  Checkbox,
  Modal,
  Space,
  Switch,
  Typography,
} from 'antd';
import { useEffect, useRef, useState } from 'react';
import type {
  AgeGroupId,
  AgeSplitPresetId,
  AgeSplitRef,
  GenderCode,
  SetAgeSplitRequest,
  SetAgeSplitSectionRequest,
} from '../../../shared/types/event';

export type AgeSplitCategory = {
  startId: string;
  formatId: number;
  gender: 'M' | 'F';
  startLabel: string;
  formatName: string;
};

export type AgeSplitModalProps = {
  open: boolean;
  category: AgeSplitCategory | null;
  /** Stored configuration for that category. */
  value: AgeSplitRef | null;
  /** A class competition suppresses the stored split. */
  notApplied?: boolean;
  saving?: boolean;
  onClose: () => void;
  onSave: (payload: SetAgeSplitRequest) => void | Promise<void>;
};

export type AgeSplitGroupOption = {
  id: AgeGroupId;
  range: string;
  labels: Record<GenderCode, string>;
};

/** Combined presets that the dialog can store as one section. */
export type CombinedPresetId = Exclude<AgeSplitPresetId, 'PRESET_ALL_GROUPS'>;

export type AgeSplitPresetOption = {
  id: CombinedPresetId;
  title: string;
  groupIds: readonly AgeGroupId[];
};

export const AGE_SPLIT_GROUPS: readonly AgeSplitGroupOption[] = [
  {
    id: 'AGE_LE_14',
    range: '≤14',
    labels: {
      M: 'Юноши младшего возраста',
      F: 'Девушки младшего возраста',
    },
  },
  {
    id: 'AGE_15_16',
    range: '15–16',
    labels: {
      M: 'Юноши среднего возраста',
      F: 'Девушки среднего возраста',
    },
  },
  {
    id: 'AGE_17_18',
    range: '17–18',
    labels: {
      M: 'Юноши старшего возраста',
      F: 'Девушки старшего возраста',
    },
  },
  {
    id: 'AGE_19_20',
    range: '19–20',
    labels: { M: 'Юниоры', F: 'Юниорки' },
  },
  {
    id: 'AGE_21_23',
    range: '21–23',
    labels: { M: 'Юниоры', F: 'Юниорки' },
  },
  {
    id: 'AGE_24_40',
    range: '24–40',
    labels: { M: 'Мужчины', F: 'Женщины' },
  },
  {
    id: 'AGE_41_50',
    range: '41–50',
    labels: { M: 'Мастер 1', F: 'Мастер 1' },
  },
  {
    id: 'AGE_51_60',
    range: '51–60',
    labels: { M: 'Мастер 2', F: 'Мастер 2' },
  },
  {
    id: 'AGE_61_PLUS',
    range: '61+',
    labels: { M: 'Мастер 3', F: 'Мастер 3' },
  },
];

export const AGE_SPLIT_PRESETS: readonly AgeSplitPresetOption[] = [
  {
    id: 'PRESET_JUNIOR_UNDER_24',
    title: 'Юниоры и младше (<24)',
    groupIds: [
      'AGE_LE_14',
      'AGE_15_16',
      'AGE_17_18',
      'AGE_19_20',
      'AGE_21_23',
    ],
  },
  {
    id: 'PRESET_MASTERS_41_PLUS',
    title: 'Мастера 41+',
    groupIds: ['AGE_41_50', 'AGE_51_60', 'AGE_61_PLUS'],
  },
];

export const ALL_GROUPS_ACTION_TITLE = 'Все возрастные группы';

function isAgeGroupId(value: string): value is AgeGroupId {
  return AGE_SPLIT_GROUPS.some((group) => group.id === value);
}

function isCombinedPresetId(value: string): value is CombinedPresetId {
  return AGE_SPLIT_PRESETS.some((preset) => preset.id === value);
}

function presetCovering(
  groupId: AgeGroupId,
  presetIds: readonly CombinedPresetId[],
): AgeSplitPresetOption | undefined {
  return AGE_SPLIT_PRESETS.find(
    (preset) =>
      presetIds.includes(preset.id) && preset.groupIds.includes(groupId),
  );
}

function buildSections(
  groupIds: readonly AgeGroupId[],
  presetIds: readonly CombinedPresetId[],
): SetAgeSplitSectionRequest[] {
  const covered = new Set<AgeGroupId>();
  const sections: SetAgeSplitSectionRequest[] = [];
  for (const preset of AGE_SPLIT_PRESETS) {
    if (!presetIds.includes(preset.id)) continue;
    sections.push({ kind: 'PRESET', id: preset.id });
    for (const groupId of preset.groupIds) covered.add(groupId);
  }
  for (const group of AGE_SPLIT_GROUPS) {
    if (!groupIds.includes(group.id) || covered.has(group.id)) continue;
    sections.push({ kind: 'BASE_GROUP', id: group.id });
  }
  return sections;
}

export function AgeSplitModal({
  open,
  category,
  value,
  notApplied = false,
  saving = false,
  onClose,
  onSave,
}: AgeSplitModalProps) {
  const [enabled, setEnabled] = useState(false);
  const [groupIds, setGroupIds] = useState<AgeGroupId[]>([]);
  const [presetIds, setPresetIds] = useState<CombinedPresetId[]>([]);
  const initializedFor = useRef<string | null>(null);

  const categoryKey = category
    ? `${category.startId}:${category.formatId}:${category.gender}`
    : '';

  useEffect(() => {
    if (!open) {
      initializedFor.current = null;
      return;
    }
    if (initializedFor.current === categoryKey) return;
    initializedFor.current = categoryKey;

    const nextGroupIds: AgeGroupId[] = [];
    const nextPresetIds: CombinedPresetId[] = [];
    for (const section of value?.sections ?? []) {
      if (section.kind === 'PRESET') {
        if (isCombinedPresetId(section.id) && !nextPresetIds.includes(section.id)) {
          nextPresetIds.push(section.id);
        }
        continue;
      }
      if (isAgeGroupId(section.id) && !nextGroupIds.includes(section.id)) {
        nextGroupIds.push(section.id);
      }
    }
    setEnabled(value?.enabled ?? false);
    setGroupIds(nextGroupIds);
    setPresetIds(nextPresetIds);
  }, [categoryKey, open, value]);

  const gender: GenderCode = category?.gender ?? 'M';
  const hasSelection = groupIds.length > 0 || presetIds.length > 0;
  const selectionMissing = enabled && !hasSelection;
  const saveDisabled = saving || !category || selectionMissing;

  const handleCancel = () => {
    if (saving) return;
    onClose();
  };

  const toggleGroup = (groupId: AgeGroupId, checked: boolean) => {
    if (checked) setEnabled(true);
    setGroupIds((previous) =>
      checked
        ? [...previous.filter((id) => id !== groupId), groupId]
        : previous.filter((id) => id !== groupId),
    );
  };

  const togglePreset = (preset: AgeSplitPresetOption, checked: boolean) => {
    if (checked) setEnabled(true);
    setPresetIds((previous) =>
      checked
        ? [...previous.filter((id) => id !== preset.id), preset.id]
        : previous.filter((id) => id !== preset.id),
    );
    if (checked) {
      setGroupIds((previous) =>
        previous.filter((id) => !preset.groupIds.includes(id)),
      );
    }
  };

  const selectAllGroups = () => {
    setEnabled(true);
    setGroupIds(AGE_SPLIT_GROUPS.map((group) => group.id));
    setPresetIds([]);
  };

  const handleSave = async () => {
    if (!category || saveDisabled) return;
    const payload: SetAgeSplitRequest = enabled
      ? {
          gender: category.gender,
          startId: category.startId,
          formatId: category.formatId,
          enabled: true,
          sections: buildSections(groupIds, presetIds),
        }
      : {
          gender: category.gender,
          startId: category.startId,
          formatId: category.formatId,
          enabled: false,
          sections: [],
        };
    try {
      await onSave(payload);
    } catch (error) {
      console.error('Не удалось сохранить возрастное деление', error);
    }
  };

  return (
    <Modal
      title={
        <div>
          <div>Возрастное деление</div>
          {category ? (
            <Typography.Text type="secondary">
              {`${category.startLabel} · ${category.formatName}`}
            </Typography.Text>
          ) : null}
        </div>
      }
      open={open}
      width={640}
      onCancel={handleCancel}
      onOk={handleSave}
      okText="Сохранить"
      cancelText="Отмена"
      confirmLoading={saving}
      okButtonProps={{ disabled: saveDisabled }}
      cancelButtonProps={{ disabled: saving }}
    >
      {notApplied ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Деление сохранено, но не применяется"
          description="Пока для категории существует многоэтапная гонка, протокол выводится без возрастных секций."
        />
      ) : null}

      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Space size="small">
          <Switch
            aria-label="Разбить по возрасту"
            checked={enabled}
            disabled={saving}
            onChange={setEnabled}
          />
          <Typography.Text>Разбить по возрасту</Typography.Text>
        </Space>

        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Typography.Text strong>Пресеты</Typography.Text>
          <Space size="middle" wrap>
            {AGE_SPLIT_PRESETS.map((preset) => (
              <Checkbox
                key={preset.id}
                checked={presetIds.includes(preset.id)}
                disabled={saving}
                onChange={(event) =>
                  togglePreset(preset, event.target.checked)
                }
              >
                {preset.title}
              </Checkbox>
            ))}
            <Button size="small" disabled={saving} onClick={selectAllGroups}>
              {ALL_GROUPS_ACTION_TITLE}
            </Button>
          </Space>
        </Space>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 8,
          }}
        >
          {AGE_SPLIT_GROUPS.map((group) => {
            const covering = presetCovering(group.id, presetIds);
            return (
              <Space key={group.id} size="small" wrap>
                <Checkbox
                  checked={covering ? true : groupIds.includes(group.id)}
                  disabled={saving || Boolean(covering)}
                  onChange={(event) =>
                    toggleGroup(group.id, event.target.checked)
                  }
                >
                  {`${group.labels[gender]} (${group.range})`}
                </Checkbox>
                {covering ? (
                  <Typography.Text type="secondary">
                    {`входит в «${covering.title}»`}
                  </Typography.Text>
                ) : null}
              </Space>
            );
          })}
        </div>

        {selectionMissing ? (
          <Typography.Text type="danger">
            Выберите хотя бы одну группу
          </Typography.Text>
        ) : null}
      </Space>
    </Modal>
  );
}
