import { CloseOutlined } from '@ant-design/icons';
import { Alert, Button, Checkbox, Modal, Space, Tabs, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import {
  AGE_CATEGORY_GROUPS,
  categorySubtitle,
  categoryTitle,
  groupOptionLabel,
  isAddDisabled,
  visibleGroupIds,
} from '../../../features/events/ageCategories';
import type {
  AgeGroupId,
  AgeSplitRef,
  SetAgeCategoriesRequest,
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
  /** Participant count per base group; a missing group counts as 0. */
  groupCounts?: Partial<Record<AgeGroupId, number>>;
  /** A class competition suppresses the stored split. */
  notApplied?: boolean;
  saving?: boolean;
  onClose: () => void;
  onSave: (payload: SetAgeCategoriesRequest) => void | Promise<void>;
};

type DraftCategory = {
  key: string;
  groupIds: AgeGroupId[];
};

/** Catalog order keeps the submitted group list stable. */
function orderedGroupIds(groupIds: readonly AgeGroupId[]): AgeGroupId[] {
  return AGE_CATEGORY_GROUPS.filter((group) => groupIds.includes(group.id)).map(
    (group) => group.id,
  );
}

/** A partial count map reads as a zero-filled one. */
function resolvedCounts(
  groupCounts: Partial<Record<AgeGroupId, number>>,
): Record<AgeGroupId, number> {
  const counts = {} as Record<AgeGroupId, number>;
  for (const group of AGE_CATEGORY_GROUPS) {
    counts[group.id] = groupCounts[group.id] ?? 0;
  }
  return counts;
}

export function AgeSplitModal({
  open,
  category,
  value,
  groupCounts = {},
  notApplied = false,
  saving = false,
  onClose,
  onSave,
}: AgeSplitModalProps) {
  const [draft, setDraft] = useState<DraftCategory[]>([]);
  const [activeKey, setActiveKey] = useState('');
  const initializedFor = useRef<string | null>(null);
  const keySeq = useRef(0);

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

    const stored = value?.categories ?? [];
    const nextKey = () => {
      keySeq.current += 1;
      return `category-${keySeq.current}`;
    };
    const next: DraftCategory[] =
      stored.length > 0
        ? stored.map((item) => ({
            key: nextKey(),
            groupIds: [...item.groupIds],
          }))
        : [{ key: nextKey(), groupIds: [] }];

    setDraft(next);
    setActiveKey(next[0]?.key ?? '');
  }, [categoryKey, open, value]);

  const counts = resolvedCounts(groupCounts);
  const activeDraft = draft.find((item) => item.key === activeKey) ?? draft[0];

  const assigned = new Set<AgeGroupId>();
  for (const item of draft) {
    for (const groupId of item.groupIds) assigned.add(groupId);
  }
  const assignedIds = [...assigned];

  // U-12, U-18: only populated groups are offered, plus the ones already in the
  // draft; add is unavailable while no populated group is still free.
  const offeredGroupIds = visibleGroupIds(counts, assignedIds);
  const addDisabled = saving || isAddDisabled(counts, assignedIds);

  const keptCategories = draft
    .map((item) => ({ groupIds: orderedGroupIds(item.groupIds) }))
    .filter((item) => item.groupIds.length > 0);
  const saveDisabled = saving || !category;

  const handleCancel = () => {
    if (saving) return;
    onClose();
  };

  const toggleGroup = (groupId: AgeGroupId, checked: boolean) => {
    if (!activeDraft) return;
    const draftKey = activeDraft.key;
    setDraft((previous) =>
      previous.map((item) =>
        item.key === draftKey
          ? {
              ...item,
              groupIds: checked
                ? [...item.groupIds.filter((id) => id !== groupId), groupId]
                : item.groupIds.filter((id) => id !== groupId),
            }
          : item,
      ),
    );
  };

  const addCategory = () => {
    if (addDisabled) return;
    keySeq.current += 1;
    const next: DraftCategory = {
      key: `category-${keySeq.current}`,
      groupIds: [],
    };
    setDraft((previous) => [...previous, next]);
    setActiveKey(next.key);
  };

  const resetDraft = () => {
    if (saving) return;
    keySeq.current += 1;
    const next: DraftCategory = {
      key: `category-${keySeq.current}`,
      groupIds: [],
    };
    setDraft([next]);
    setActiveKey(next.key);
  };

  const removeCategory = (key: string) => {
    if (saving) return;
    const index = draft.findIndex((item) => item.key === key);
    if (index < 0) return;
    const remaining = draft.filter((item) => item.key !== key);
    setDraft(remaining);
    if (key === activeDraft?.key) {
      setActiveKey(
        remaining.length === 0
          ? ''
          : remaining[Math.min(index, remaining.length - 1)].key,
      );
    }
  };

  const tabItems = draft.map((item, index) => {
    const subtitle = categorySubtitle(item.groupIds);
    return {
      key: item.key,
      label: (
        <Space size={4}>
          <Space direction="vertical" size={0}>
            <span>{categoryTitle(index + 1)}</span>
            {subtitle ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {subtitle}
              </Typography.Text>
            ) : null}
          </Space>
          <Button
            type="text"
            size="small"
            aria-label={`Удалить ${categoryTitle(index + 1)}`}
            icon={<CloseOutlined />}
            disabled={saving}
            onClick={(event) => {
              event.stopPropagation();
              removeCategory(item.key);
            }}
          />
        </Space>
      ),
      children: (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 8,
          }}
        >
          {offeredGroupIds.map((groupId) => {
            const ownerIndex = draft.findIndex((candidate) =>
              candidate.groupIds.includes(groupId),
            );
            const ownedByOther = ownerIndex >= 0 && ownerIndex !== index;
            return (
              <Checkbox
                key={groupId}
                checked={ownerIndex >= 0}
                disabled={saving || ownedByOther}
                onChange={(event) =>
                  toggleGroup(groupId, event.target.checked)
                }
              >
                {groupOptionLabel(groupId, counts[groupId])}
              </Checkbox>
            );
          })}
        </div>
      ),
    };
  });

  const handleSave = async () => {
    if (!category || saveDisabled) return;
    const payload: SetAgeCategoriesRequest = {
      gender: category.gender,
      startId: category.startId,
      formatId: category.formatId,
      enabled: keptCategories.length > 0,
      categories: keptCategories.length > 0 ? keptCategories : [],
    };
    try {
      await onSave(payload);
    } catch (error) {
      console.error('Не удалось сохранить возрастные категории', error);
    }
  };

  return (
    <Modal
      title={
        <div>
          <div>Возрастные категории</div>
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
      footer={
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <Space>
            <Button disabled={saving} onClick={resetDraft}>
              Сброс категорий
            </Button>
            <Button disabled={addDisabled} onClick={addCategory}>
              Добавить категорию
            </Button>
          </Space>
          <Space>
            <Button disabled={saving} onClick={handleCancel}>
              Отмена
            </Button>
            <Button
              type="primary"
              loading={saving}
              disabled={saveDisabled}
              onClick={handleSave}
            >
              Сохранить
            </Button>
          </Space>
        </div>
      }
    >
      {notApplied ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Категории сохранены, но не применяются"
          description="Пока для категории существует многоэтапная гонка, протокол выводится без возрастных категорий."
        />
      ) : null}

      <Tabs
        size="small"
        activeKey={activeDraft?.key}
        onChange={setActiveKey}
        items={tabItems}
      />
    </Modal>
  );
}
