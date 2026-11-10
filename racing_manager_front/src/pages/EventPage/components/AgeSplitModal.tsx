import { CloseOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Checkbox,
  Modal,
  Space,
  Switch,
  Tabs,
  Typography,
} from 'antd';
import { useEffect, useRef, useState } from 'react';
import {
  AGE_CATEGORY_GROUPS,
  categorySubtitle,
  categoryTitle,
  groupLabel,
  groupRange,
} from '../../../features/events/ageCategories';
import type {
  AgeGroupId,
  AgeSplitRef,
  GenderCode,
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

    setEnabled(value?.enabled ?? false);
    setDraft(next);
    setActiveKey(next[0]?.key ?? '');
  }, [categoryKey, open, value]);

  const gender: GenderCode = category?.gender ?? 'M';
  const activeDraft = draft.find((item) => item.key === activeKey) ?? draft[0];

  const assigned = new Set<AgeGroupId>();
  for (const item of draft) {
    for (const groupId of item.groupIds) assigned.add(groupId);
  }

  const allGroupsAssigned = assigned.size >= AGE_CATEGORY_GROUPS.length;
  const addDisabled =
    saving || draft.length >= AGE_CATEGORY_GROUPS.length || allGroupsAssigned;

  const keptCategories = draft
    .map((item) => ({ groupIds: orderedGroupIds(item.groupIds) }))
    .filter((item) => item.groupIds.length > 0);
  const groupsMissing = enabled && keptCategories.length === 0;
  const saveDisabled = saving || !category || groupsMissing;

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
    if (checked) setEnabled(true);
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
          {AGE_CATEGORY_GROUPS.map((group) => {
            const ownerIndex = draft.findIndex((candidate) =>
              candidate.groupIds.includes(group.id),
            );
            const ownedByOther = ownerIndex >= 0 && ownerIndex !== index;
            return (
              <Space key={group.id} size="small" wrap>
                <Checkbox
                  checked={ownerIndex >= 0}
                  disabled={saving || ownedByOther}
                  onChange={(event) =>
                    toggleGroup(group.id, event.target.checked)
                  }
                >
                  {`${groupLabel(group.id, gender)} (${groupRange(group.id)})`}
                </Checkbox>
                {ownedByOther ? (
                  <Typography.Text type="secondary">
                    {`входит в ${categoryTitle(ownerIndex + 1)}`}
                  </Typography.Text>
                ) : null}
              </Space>
            );
          })}
        </div>
      ),
    };
  });

  const handleSave = async () => {
    if (!category || saveDisabled) return;
    const payload: SetAgeCategoriesRequest = enabled
      ? {
          gender: category.gender,
          startId: category.startId,
          formatId: category.formatId,
          enabled: true,
          categories: keptCategories,
        }
      : {
          gender: category.gender,
          startId: category.startId,
          formatId: category.formatId,
          enabled: false,
          categories: [],
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
          message="Категории сохранены, но не применяются"
          description="Пока для категории существует многоэтапная гонка, протокол выводится без возрастных категорий."
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

        <Tabs
          size="small"
          activeKey={activeDraft?.key}
          onChange={setActiveKey}
          items={tabItems}
        />

        <Button
          type="dashed"
          size="small"
          disabled={addDisabled}
          onClick={addCategory}
        >
          Добавить категорию
        </Button>

        {groupsMissing ? (
          <Typography.Text type="danger">
            Выберите хотя бы одну группу
          </Typography.Text>
        ) : null}
      </Space>
    </Modal>
  );
}
