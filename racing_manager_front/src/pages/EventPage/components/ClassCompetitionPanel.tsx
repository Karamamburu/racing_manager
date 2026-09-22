import { HolderOutlined } from '@ant-design/icons';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Button, Select, Space, Tag, Typography, message } from 'antd';
import { useState } from 'react';
import { classCompetitionsService } from '../../../features/class-competitions/classCompetitionsService';
import type {
  AddableStageKind,
  ClassCompetitionStage,
  ClassCompetitionView,
  ClassHeatSlot,
  HeatResultStatus,
} from '../../../features/class-competitions/types';
import { FinishTimeCell } from './FinishTimeCell';

const STAGE_LABELS: Record<string, string> = {
  PROLOGUE: 'Пролог',
  EIGHTHFINAL: '1/8 финала',
  QUARTERFINAL: '1/4 финала',
  SEMIFINAL: '1/2 финала',
  FINAL: 'Финал',
  FINAL_A: 'Финал A',
  FINAL_B: 'Финал B',
};

const ADDABLE: Array<{ kind: AddableStageKind; id: string; title: string }> = [
  { kind: 'PROLOGUE', id: 'prologue', title: 'Пролог' },
  { kind: 'EIGHTHFINAL', id: 'eighth', title: '1/8 финала' },
  { kind: 'QUARTERFINAL', id: 'qf', title: '1/4 финала' },
];

const STATUS_OPTIONS: Array<{ value: HeatResultStatus; label: string }> = [
  { value: 'OK', label: 'Финиш' },
  { value: 'DNS', label: 'DNS' },
  { value: 'DNF', label: 'DNF' },
  { value: 'DSQ', label: 'DSQ' },
];

type ClassCompetitionPanelProps = {
  eventId: string;
  competition: ClassCompetitionView | null;
  formatId: number | null;
  gender: string;
  canManage: boolean;
  registrationClosed: boolean;
  onChanged: () => Promise<void> | void;
};

export function ClassCompetitionPanel({
  eventId,
  competition,
  formatId,
  gender,
  canManage,
  registrationClosed,
  onChanged,
}: ClassCompetitionPanelProps) {
  const [pending, setPending] = useState<string | null>(null);

  const run = async (key: string, action: () => Promise<void>, success: string) => {
    setPending(key);
    try {
      await action();
      message.success(success);
      await onChanged();
    } catch (error) {
      message.error(classCompetitionsService.getErrorMessage(error));
    } finally {
      setPending(null);
    }
  };

  if (!competition) {
    const classGender = gender === 'M' || gender === 'F' ? gender : null;
    if (!canManage || !registrationClosed || !classGender) return null;
    return (
      <Button
        style={{ marginBottom: 12 }}
        loading={pending === 'create'}
        onClick={() =>
          run(
            'create',
            async () => {
              await classCompetitionsService.create(eventId, {
                formatId,
                gender: classGender,
              });
            },
            'Сетка гонки предложена',
          )
        }
      >
        Сформировать многоэтапную гонку
      </Button>
    );
  }

  const stageById = new Map(competition.stages.map((stage) => [stage.stageId, stage]));
  const editable = canManage && competition.status !== 'DONE';

  return (
    <Space direction="vertical" size={16} style={{ width: '100%', marginBottom: 16 }}>
      <Space wrap>
        <Tag>{competition.status === 'DONE' ? 'Сетка завершена' : competition.status === 'DRAFT' ? 'Черновик сетки' : 'Сетка в работе'}</Tag>
        {editable
          ? ADDABLE.filter((item) => !stageById.has(item.id) && canAddStage(competition, item.kind)).map(
              (item) => (
                <Button
                  key={item.kind}
                  size="small"
                  loading={pending === `add-${item.kind}`}
                  onClick={() =>
                    run(
                      `add-${item.kind}`,
                      () =>
                        classCompetitionsService
                          .updatePlan(eventId, competition.id, { addStage: item.kind })
                          .then(() => undefined),
                      `${item.title} добавлен`,
                    )
                  }
                >
                  Добавить {item.title.toLowerCase()}
                </Button>
              ),
            )
          : null}
      </Space>
      {competition.stages.map((stage) => (
        <StageBoard
          key={stage.stageId}
          stage={stage}
          editable={editable}
          pending={pending}
          onRemove={
            editable && canRemoveStage(competition, stage)
              ? () =>
                  run(
                    `remove-${stage.stageId}`,
                    () =>
                      classCompetitionsService
                        .updatePlan(eventId, competition.id, { removeStageIds: [stage.stageId] })
                        .then(() => undefined),
                    'Этап убран',
                  )
              : null
          }
          onSeed={() =>
            run(
              `seed-${stage.stageId}`,
              () =>
                classCompetitionsService
                  .seedStage(eventId, competition.id, stage.stageId)
                  .then(() => undefined),
              'Заезды сформированы',
            )
          }
          onReassign={(heats) =>
            run(
              `move-${stage.stageId}`,
              () =>
                classCompetitionsService
                  .reassignHeats(eventId, competition.id, stage.stageId, heats)
                  .then(() => undefined),
              'Состав заездов обновлён',
            )
          }
          onSaveTime={(slot, timeMilliseconds) =>
            run(
              `time-${slot.registrationId}`,
              () =>
                classCompetitionsService
                  .recordHeatTimes(eventId, competition.id, stage.stageId, {
                    commit: false,
                    entries: [
                      {
                        registrationId: slot.registrationId,
                        heatNumber: heatNumberOf(stage, slot.registrationId),
                        status: 'OK',
                        timeMilliseconds,
                      },
                    ],
                  })
                  .then(() => undefined),
              'Время заезда записано',
            )
          }
          onSaveStatus={(slot, status) =>
            run(
              `status-${slot.registrationId}`,
              () =>
                classCompetitionsService
                  .recordHeatTimes(eventId, competition.id, stage.stageId, {
                    commit: false,
                    entries: [
                      {
                        registrationId: slot.registrationId,
                        heatNumber: heatNumberOf(stage, slot.registrationId),
                        status,
                        ...(status === 'OK' && slot.timeMilliseconds != null
                          ? { timeMilliseconds: slot.timeMilliseconds }
                          : {}),
                      },
                    ],
                  })
                  .then(() => undefined),
              'Статус заезда записан',
            )
          }
          onCommit={() =>
            run(
              `commit-${stage.stageId}`,
              () =>
                classCompetitionsService
                  .recordHeatTimes(eventId, competition.id, stage.stageId, {
                    commit: true,
                    entries: [],
                  })
                  .then(() => undefined),
              'Этап зафиксирован',
            )
          }
        />
      ))}
    </Space>
  );
}

function canRemoveStage(competition: ClassCompetitionView, stage: ClassCompetitionStage): boolean {
  if (!['prologue', 'eighth', 'qf'].includes(stage.stageId)) return false;
  if (stage.status !== 'PENDING') return false;
  if (competition.status === 'DRAFT') return true;
  return stage.entries.length === 0;
}

function canAddStage(competition: ClassCompetitionView, kind: AddableStageKind): boolean {
  if (kind === 'PROLOGUE') return competition.status === 'DRAFT';
  const afterId = kind === 'EIGHTHFINAL'
    ? competition.stages.some((stage) => stage.stageId === 'prologue')
      ? 'prologue'
      : null
    : competition.stages.some((stage) => stage.stageId === 'eighth')
      ? 'eighth'
      : competition.stages.some((stage) => stage.stageId === 'prologue')
        ? 'prologue'
        : null;
  if (afterId == null) return competition.status === 'DRAFT';
  const after = competition.stages.find((stage) => stage.stageId === afterId);
  return after != null && after.status !== 'COMPLETED';
}

function heatNumberOf(stage: ClassCompetitionStage, registrationId: string): number {
  const heat = stage.heats.find((item) =>
    item.slots.some((slot) => slot.registrationId === registrationId),
  );
  return heat?.heatNumber ?? 1;
}

function slotFilled(slot: ClassHeatSlot): boolean {
  if (slot.resultStatus === 'DNS' || slot.resultStatus === 'DNF' || slot.resultStatus === 'DSQ') {
    return true;
  }
  return slot.resultStatus === 'OK' && slot.timeMilliseconds != null;
}

function StageBoard({
  stage,
  editable,
  pending,
  onRemove,
  onSeed,
  onReassign,
  onSaveTime,
  onSaveStatus,
  onCommit,
}: {
  stage: ClassCompetitionStage;
  editable: boolean;
  pending: string | null;
  onRemove: (() => void) | null;
  onSeed: () => void;
  onReassign: (heats: Array<{ heatNumber: number; registrationIds: string[] }>) => void;
  onSaveTime: (slot: ClassHeatSlot, timeMilliseconds: number) => void;
  onSaveStatus: (slot: ClassHeatSlot, status: HeatResultStatus) => void;
  onCommit: () => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const canDrag = editable && stage.status === 'SEEDED' && stage.heats.length > 1;
  const canTime = editable && stage.status === 'SEEDED';
  const readyToCommit =
    canTime &&
    stage.heats.length > 0 &&
    stage.heats.every((heat) => heat.slots.every(slotFilled));
  const title = STAGE_LABELS[stage.kind] ?? stage.label ?? stage.stageId;

  const onDragEnd = (event: DragEndEvent) => {
    if (!canDrag || !event.over) return;
    const registrationId = String(event.active.id).replace(`${stage.stageId}:`, '');
    const overId = String(event.over.id);
    const targetHeat = overId.startsWith('heat:')
      ? Number(overId.slice('heat:'.length))
      : heatNumberOf(stage, overId.replace(`${stage.stageId}:`, ''));
    const sourceHeat = heatNumberOf(stage, registrationId);
    if (!Number.isInteger(targetHeat) || targetHeat === sourceHeat) return;
    const groups = stage.heats.map((heat) => ({
      heatNumber: heat.heatNumber,
      registrationIds: heat.slots
        .map((slot) => slot.registrationId)
        .filter((id) => id !== registrationId),
    }));
    const target = groups.find((heat) => heat.heatNumber === targetHeat);
    if (!target) return;
    target.registrationIds.push(registrationId);
    onReassign(
      groups
        .filter((heat) => heat.registrationIds.length > 0)
        .map((heat, index) => ({ heatNumber: index + 1, registrationIds: heat.registrationIds })),
    );
  };

  return (
    <div>
      <Space wrap style={{ marginBottom: 8 }}>
        <Typography.Text strong>{title}</Typography.Text>
        <Tag>{stageStatusLabel(stage.status)}</Tag>
        {onRemove ? (
          <Button size="small" danger loading={pending === `remove-${stage.stageId}`} onClick={onRemove}>
            Убрать этап
          </Button>
        ) : null}
        {editable && stage.status === 'PENDING' && stage.entries.length > 0 && stage.heats.length === 0 ? (
          <Button size="small" type="primary" loading={pending === `seed-${stage.stageId}`} onClick={onSeed}>
            Сформировать заезды
          </Button>
        ) : null}
        {readyToCommit ? (
          <Button size="small" type="primary" loading={pending === `commit-${stage.stageId}`} onClick={onCommit}>
            Зафиксировать этап
          </Button>
        ) : null}
      </Space>
      {stage.heats.length === 0 ? (
        <Typography.Text type="secondary">
          {stage.entries.length > 0
            ? `${stage.entries.length} участников ждут распределения по заездам`
            : 'Участники появятся после предыдущего этапа'}
        </Typography.Text>
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
            {stage.heats.map((heat) => (
              <HeatColumn
                key={heat.heatNumber}
                stageId={stage.stageId}
                heatNumber={heat.heatNumber}
                slots={heat.slots}
                canDrag={canDrag}
                canTime={canTime}
                pending={pending}
                onSaveTime={onSaveTime}
                onSaveStatus={onSaveStatus}
              />
            ))}
          </div>
        </DndContext>
      )}
    </div>
  );
}

function HeatColumn({
  stageId,
  heatNumber,
  slots,
  canDrag,
  canTime,
  pending,
  onSaveTime,
  onSaveStatus,
}: {
  stageId: string;
  heatNumber: number;
  slots: ClassHeatSlot[];
  canDrag: boolean;
  canTime: boolean;
  pending: string | null;
  onSaveTime: (slot: ClassHeatSlot, timeMilliseconds: number) => void;
  onSaveStatus: (slot: ClassHeatSlot, status: HeatResultStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `heat:${heatNumber}`, disabled: !canDrag });
  return (
    <div
      ref={setNodeRef}
      style={{
        minWidth: 240,
        flex: '1 0 240px',
        border: '1px solid #f0f0f0',
        borderRadius: 8,
        padding: 8,
        background: isOver ? '#f6ffed' : '#fafafa',
      }}
    >
      <Typography.Text type="secondary">Заезд {heatNumber}</Typography.Text>
      <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 8 }}>
        {slots.map((slot) => (
          <StarterCard
            key={slot.registrationId}
            stageId={stageId}
            slot={slot}
            canDrag={canDrag}
            canTime={canTime}
            pending={pending}
            onSaveTime={onSaveTime}
            onSaveStatus={onSaveStatus}
          />
        ))}
      </Space>
    </div>
  );
}

function StarterCard({
  stageId,
  slot,
  canDrag,
  canTime,
  pending,
  onSaveTime,
  onSaveStatus,
}: {
  stageId: string;
  slot: ClassHeatSlot;
  canDrag: boolean;
  canTime: boolean;
  pending: string | null;
  onSaveTime: (slot: ClassHeatSlot, timeMilliseconds: number) => void;
  onSaveStatus: (slot: ClassHeatSlot, status: HeatResultStatus) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${stageId}:${slot.registrationId}`,
    disabled: !canDrag,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 1 }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        opacity: isDragging ? 0.7 : 1,
        background: '#fff',
        border: '1px solid #f0f0f0',
        borderRadius: 6,
        padding: 8,
      }}
    >
      <Space align="start">
        {canDrag ? (
          <span
            {...listeners}
            {...attributes}
            style={{ cursor: 'grab', color: 'rgba(0, 0, 0, 0.45)', lineHeight: 1 }}
            aria-label="Перетащить участника"
          >
            <HolderOutlined />
          </span>
        ) : null}
        <div>
          <div>
            {slot.startNumber != null ? `${slot.startNumber}. ` : ''}
            {slot.lastName} {slot.firstName}
          </div>
          <Space style={{ marginTop: 4 }} wrap>
            {canTime ? (
              <Select
                size="small"
                style={{ width: 96 }}
                value={slot.resultStatus ?? undefined}
                placeholder="Статус"
                options={STATUS_OPTIONS}
                loading={pending === `status-${slot.registrationId}`}
                onChange={(status: HeatResultStatus) => {
                  if (status === 'OK' && slot.timeMilliseconds == null) return;
                  onSaveStatus(slot, status);
                }}
              />
            ) : slot.resultStatus && slot.resultStatus !== 'OK' ? (
              <Tag>{slot.resultStatus}</Tag>
            ) : null}
            {canTime ||
            (slot.resultStatus !== 'DNS' &&
              slot.resultStatus !== 'DNF' &&
              slot.resultStatus !== 'DSQ') ? (
              <FinishTimeCell
                value={slot.timeMilliseconds}
                canEdit={canTime}
                saving={pending === `time-${slot.registrationId}`}
                onSave={(timeMilliseconds) => onSaveTime(slot, timeMilliseconds)}
                onInvalid={() =>
                  message.error('Введите время цифрами. Минуты и секунды — до 59, например 13215 → 01:32:15')
                }
              />
            ) : null}
          </Space>
        </div>
      </Space>
    </div>
  );
}

function stageStatusLabel(status: ClassCompetitionStage['status']): string {
  if (status === 'SEEDED') return 'Заезды готовы';
  if (status === 'COMPLETED') return 'Этап завершён';
  return 'Ожидает';
}
