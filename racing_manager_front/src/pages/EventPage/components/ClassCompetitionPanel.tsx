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
import { Button, Collapse, Select, Space, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useRef, useState } from 'react';
import { classCompetitionsService } from '../../../features/class-competitions/classCompetitionsService';
import type {
  AddableStageKind,
  ClassCompetitionStage,
  ClassCompetitionView,
  ClassHeatSlot,
  HeatResultStatus,
} from '../../../features/class-competitions/types';
import { formatFinishTime } from '../../../shared/formatFinishTime';
import type { EventLap } from '../../../shared/types/event';
import type { RegistrationStatusCode } from '../../../shared/registrationStatus';
import { registrationStatusMeta } from '../../../shared/registrationStatus';
import { FinishTimeCell } from './FinishTimeCell';
import { RegistrationStatusSelect } from './RegistrationStatusSelect';

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
  { kind: 'SEMIFINAL', id: 'sf', title: '1/2 финала' },
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
  eventLaps: EventLap[];
  canManage: boolean;
  registrationClosed: boolean;
  onChanged: () => Promise<void> | void;
};

export function ClassCompetitionPanel({
  eventId,
  competition,
  formatId,
  gender,
  eventLaps,
  canManage,
  registrationClosed,
  onChanged,
}: ClassCompetitionPanelProps) {
  const [pending, setPending] = useState<string | null>(null);
  const [openStageIds, setOpenStageIds] = useState(() => seededStageIds(competition));
  const seenSeededRef = useRef(new Set(seededStageIds(competition)));
  const seededKey = seededStageIds(competition).join('|');

  useEffect(() => {
    if (!seededKey) return;
    const newcomers = seededKey.split('|').filter((id) => !seenSeededRef.current.has(id));
    if (newcomers.length === 0) return;
    for (const id of newcomers) seenSeededRef.current.add(id);
    setOpenStageIds((current) => [...current, ...newcomers]);
  }, [seededKey]);

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
          eventLaps={eventLaps}
          open={openStageIds.includes(stage.stageId)}
          onOpenChange={(open) =>
            setOpenStageIds((current) =>
              open
                ? current.includes(stage.stageId)
                  ? current
                  : [...current, stage.stageId]
                : current.filter((id) => id !== stage.stageId),
            )
          }
          editable={editable}
          previousCompleted={
            stage.sourceStageId != null &&
            competition.stages.find((item) => item.stageId === stage.sourceStageId)?.status ===
              'COMPLETED'
          }
          qualifierStatus={stage.qualifierStatus}
          onChangeRegistrationStatus={(registrationId, status) =>
            run(
              `qualification-${stage.stageId}-${registrationId}`,
              () =>
                classCompetitionsService
                  .setStageQualification(eventId, competition.id, stage.stageId, {
                    registrationId,
                    status,
                  })
                  .then(() => undefined),
              'Статус заявки на этапе обновлён',
            )
          }
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
          onSaveTime={(slot, timeMilliseconds, lapNumber) =>
            run(
              lapNumber != null
                ? `time-${slot.registrationId}-${lapNumber}`
                : `time-${slot.registrationId}`,
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
                        ...(lapNumber != null ? { lapNumber } : {}),
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
              'Этап зафиксирован. Проверьте статусы перед сеткой следующего этапа',
            )
          }
        />
      ))}
    </Space>
  );
}

function seededStageIds(competition: ClassCompetitionView | null): string[] {
  return (competition?.stages ?? [])
    .filter((stage) => stage.status === 'SEEDED')
    .map((stage) => stage.stageId);
}

function canRemoveStage(competition: ClassCompetitionView, stage: ClassCompetitionStage): boolean {
  if (!['prologue', 'eighth', 'qf', 'sf', 'final_b'].includes(stage.stageId)) return false;
  if (stage.status !== 'PENDING') return false;
  if (competition.status === 'DRAFT') return true;
  return stage.entries.length === 0;
}

function canAddSemifinal(competition: ClassCompetitionView): boolean {
  const final = competition.stages.find(
    (stage) => stage.stageId === 'final' || stage.stageId === 'final_a',
  );
  if (!final || final.status !== 'PENDING') return false;
  if (!final.sourceStageId) return true;
  const source = competition.stages.find((stage) => stage.stageId === final.sourceStageId);
  return source != null && source.status !== 'COMPLETED';
}

function canAddStage(competition: ClassCompetitionView, kind: AddableStageKind): boolean {
  if (kind === 'PROLOGUE') return competition.status === 'DRAFT';
  if (kind === 'SEMIFINAL') return canAddSemifinal(competition);
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

function slotFilled(slot: ClassHeatSlot, eventLaps: EventLap[]): boolean {
  if (slot.resultStatus === 'DNS' || slot.resultStatus === 'DNF' || slot.resultStatus === 'DSQ') {
    return true;
  }
  if (eventLaps.length > 1) {
    return eventLaps.every((lap) =>
      (slot.laps ?? []).some((item) => item.lapNumber === lap.lapNumber),
    );
  }
  return slot.resultStatus === 'OK' && slot.timeMilliseconds != null;
}

function StageBoard({
  stage,
  eventLaps,
  open,
  onOpenChange,
  editable,
  previousCompleted,
  qualifierStatus,
  pending,
  onChangeRegistrationStatus,
  onRemove,
  onSeed,
  onReassign,
  onSaveTime,
  onSaveStatus,
  onCommit,
}: {
  stage: ClassCompetitionStage;
  eventLaps: EventLap[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editable: boolean;
  previousCompleted: boolean;
  qualifierStatus: 'QQ' | 'NQ' | null;
  pending: string | null;
  onChangeRegistrationStatus: (registrationId: string, status: RegistrationStatusCode) => void;
  onRemove: (() => void) | null;
  onSeed: () => void;
  onReassign: (heats: Array<{ heatNumber: number; registrationIds: string[] }>) => void;
  onSaveTime: (slot: ClassHeatSlot, timeMilliseconds: number, lapNumber?: number) => void;
  onSaveStatus: (slot: ClassHeatSlot, status: HeatResultStatus) => void;
  onCommit: () => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const canArrange = editable && stage.status === 'SEEDED' && stage.heats.length > 0;
  const canDrag = canArrange && stage.heats.length > 1;
  const canTime = editable && stage.status === 'SEEDED';
  const readyToCommit =
    canTime &&
    stage.heats.length > 0 &&
    stage.heats.every((heat) => heat.slots.length > 0 && heat.slots.every((slot) => slotFilled(slot, eventLaps)));
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
    onReassign(numberHeats(groups));
  };

  const addHeat = () => {
    onReassign(
      numberHeats([
        ...stage.heats.map((heat) => ({
          registrationIds: heat.slots.map((slot) => slot.registrationId),
        })),
        { registrationIds: [] },
      ]),
    );
  };

  const deleteHeat = (heatNumber: number) => {
    onReassign(
      numberHeats(
        stage.heats
          .filter((heat) => heat.heatNumber !== heatNumber)
          .map((heat) => ({
            registrationIds: heat.slots.map((slot) => slot.registrationId),
          })),
      ),
    );
  };

  const canSeed =
    editable &&
    stage.status === 'PENDING' &&
    stage.heats.length === 0 &&
    (stage.entries.length > 0 || previousCompleted);
  const stageActions = (
    <Space wrap onClick={(event) => event.stopPropagation()}>
      {onRemove ? (
        <Button size="small" danger loading={pending === `remove-${stage.stageId}`} onClick={onRemove}>
          Убрать этап
        </Button>
      ) : null}
      {canSeed ? (
        <Button size="small" type="primary" loading={pending === `seed-${stage.stageId}`} onClick={onSeed}>
          {isTerminalStage(stage.kind) ? 'Сформировать заезд' : 'Сформировать заезды'}
        </Button>
      ) : null}
      {canArrange && !isTerminalStage(stage.kind) ? (
        <Button size="small" loading={pending === `move-${stage.stageId}`} onClick={addHeat}>
          Добавить заезд
        </Button>
      ) : null}
      {readyToCommit ? (
        <Button size="small" type="primary" loading={pending === `commit-${stage.stageId}`} onClick={onCommit}>
          Зафиксировать этап
        </Button>
      ) : null}
    </Space>
  );

  return (
    <Collapse
      activeKey={open ? [stage.stageId] : []}
      onChange={(keys) => {
        const list = Array.isArray(keys) ? keys : [keys];
        onOpenChange(list.includes(stage.stageId));
      }}
      items={[
        {
          key: stage.stageId,
          label: (
            <Space size={8}>
              <Typography.Text strong>{title}</Typography.Text>
              <Tag>{stageStatusLabel(stage.status)}</Tag>
            </Space>
          ),
          extra:
            onRemove || canSeed || (canArrange && !isTerminalStage(stage.kind)) || readyToCommit
              ? stageActions
              : undefined,
          children:
            stage.status === 'COMPLETED' && stage.heats.length > 0 ? (
              <CompletedStageResults
                stage={stage}
                eventLaps={eventLaps}
                canEditStatus={editable}
                pending={pending}
                onChangeRegistrationStatus={onChangeRegistrationStatus}
              />
            ) : stage.heats.length === 0 ? (
              <Typography.Text type="secondary">
                {previousCompleted
                  ? qualifierStatus === 'NQ'
                    ? 'Финал B собирается из участников со статусом NQ. Сформируйте заезд, когда состав готов'
                    : isTerminalStage(stage.kind)
                      ? 'Отметьте квалифицированных и сформируйте заезд'
                      : 'Отметьте квалифицированных и сформируйте заезды'
                  : stage.entries.length > 0
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
                      eventLaps={eventLaps}
                      canDrag={canDrag}
                      canTime={canTime}
                      canDelete={canArrange && heat.slots.length === 0 && stage.heats.length > 1}
                      pending={pending}
                      onDelete={() => deleteHeat(heat.heatNumber)}
                      onSaveTime={onSaveTime}
                      onSaveStatus={onSaveStatus}
                    />
                  ))}
                </div>
              </DndContext>
            ),
        },
      ]}
    />
  );
}

function numberHeats(
  heats: Array<{ registrationIds: string[] }>,
): Array<{ heatNumber: number; registrationIds: string[] }> {
  return heats.map((heat, index) => ({
    heatNumber: index + 1,
    registrationIds: heat.registrationIds,
  }));
}

function HeatColumn({
  stageId,
  heatNumber,
  slots,
  eventLaps,
  canDrag,
  canTime,
  canDelete,
  pending,
  onDelete,
  onSaveTime,
  onSaveStatus,
}: {
  stageId: string;
  heatNumber: number;
  slots: ClassHeatSlot[];
  eventLaps: EventLap[];
  canDrag: boolean;
  canTime: boolean;
  canDelete: boolean;
  pending: string | null;
  onDelete: () => void;
  onSaveTime: (slot: ClassHeatSlot, timeMilliseconds: number, lapNumber?: number) => void;
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
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Text type="secondary">Заезд {heatNumber}</Typography.Text>
        {canDelete ? (
          <Button size="small" danger loading={pending === `move-${stageId}`} onClick={onDelete}>
            Удалить
          </Button>
        ) : null}
      </Space>
      <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 8 }}>
        {slots.length === 0 ? (
          <Typography.Text type="secondary">Перетащите сюда участников</Typography.Text>
        ) : null}
        {slots.map((slot) => (
          <StarterCard
            key={slot.registrationId}
            stageId={stageId}
            slot={slot}
            eventLaps={eventLaps}
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
  eventLaps,
  canDrag,
  canTime,
  pending,
  onSaveTime,
  onSaveStatus,
}: {
  stageId: string;
  slot: ClassHeatSlot;
  eventLaps: EventLap[];
  canDrag: boolean;
  canTime: boolean;
  pending: string | null;
  onSaveTime: (slot: ClassHeatSlot, timeMilliseconds: number, lapNumber?: number) => void;
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
              eventLaps.length > 1 ? (
                <Space direction="vertical" size={4}>
                  {eventLaps.map((lap) => (
                    <Space key={lap.lapNumber} size={6}>
                      <Typography.Text type="secondary" style={{ fontSize: 12, width: 52 }}>
                        Круг {lap.lapNumber}
                      </Typography.Text>
                      <FinishTimeCell
                        value={
                          (slot.laps ?? []).find((item) => item.lapNumber === lap.lapNumber)
                            ?.timeMilliseconds ?? null
                        }
                        canEdit={canTime}
                        saving={pending === `time-${slot.registrationId}-${lap.lapNumber}`}
                        onSave={(timeMilliseconds) => onSaveTime(slot, timeMilliseconds, lap.lapNumber)}
                        onInvalid={() =>
                          message.error(
                            'Введите время цифрами. Минуты и секунды — до 59, например 13215 → 01:32:15',
                          )
                        }
                      />
                    </Space>
                  ))}
                </Space>
              ) : (
                <FinishTimeCell
                  value={slot.timeMilliseconds}
                  canEdit={canTime}
                  saving={
                    pending ===
                    (eventLaps.length === 1
                      ? `time-${slot.registrationId}-${eventLaps[0].lapNumber}`
                      : `time-${slot.registrationId}`)
                  }
                  onSave={(timeMilliseconds) =>
                    onSaveTime(
                      slot,
                      timeMilliseconds,
                      eventLaps.length === 1 ? eventLaps[0].lapNumber : undefined,
                    )
                  }
                  onInvalid={() =>
                    message.error('Введите время цифрами. Минуты и секунды — до 59, например 13215 → 01:32:15')
                  }
                />
              )
            ) : null}
          </Space>
        </div>
      </Space>
    </div>
  );
}

type RankedSlot = ClassHeatSlot & { place: number | null; heatNumber: number };

function rankStageSlots(stage: ClassCompetitionStage): RankedSlot[] {
  const slots = stage.heats.flatMap((heat) =>
    heat.slots.map((slot) => ({ ...slot, heatNumber: heat.heatNumber })),
  );
  const finished = slots
    .filter((slot) => slot.resultStatus === 'OK' && slot.timeMilliseconds != null)
    .sort((a, b) => {
      const byTime = (a.timeMilliseconds ?? 0) - (b.timeMilliseconds ?? 0);
      if (byTime !== 0) return byTime;
      return (a.startNumber ?? Number.POSITIVE_INFINITY) - (b.startNumber ?? Number.POSITIVE_INFINITY);
    });
  const rest = slots
    .filter((slot) => slot.resultStatus !== 'OK' || slot.timeMilliseconds == null)
    .sort((a, b) => {
      const byStatus = statusOrder(a.resultStatus) - statusOrder(b.resultStatus);
      if (byStatus !== 0) return byStatus;
      return (a.startNumber ?? Number.POSITIVE_INFINITY) - (b.startNumber ?? Number.POSITIVE_INFINITY);
    });
  return [
    ...finished.map((slot, index) => ({ ...slot, place: index + 1 })),
    ...rest.map((slot) => ({ ...slot, place: null })),
  ];
}

function statusOrder(status: HeatResultStatus | null): number {
  if (status === 'DNF') return 0;
  if (status === 'DSQ') return 1;
  if (status === 'DNS') return 2;
  return 3;
}

function CompletedStageResults({
  stage,
  eventLaps,
  canEditStatus,
  pending,
  onChangeRegistrationStatus,
}: {
  stage: ClassCompetitionStage;
  eventLaps: EventLap[];
  canEditStatus: boolean;
  pending: string | null;
  onChangeRegistrationStatus: (registrationId: string, status: RegistrationStatusCode) => void;
}) {
  const rows = rankStageSlots(stage);
  const severalHeats = stage.heats.length > 1;
  const lapColumns: ColumnsType<RankedSlot> = eventLaps.map((lap) => ({
    title: (
      <span>
        Круг {lap.lapNumber}
        <div style={{ fontWeight: 400, fontSize: 12, color: 'rgba(0, 0, 0, 0.45)' }}>
          {lap.distanceKm} км
        </div>
      </span>
    ),
    key: `lap-${lap.lapNumber}`,
    width: 120,
    render: (_value: unknown, record) => {
      const saved = (record.laps ?? []).find((item) => item.lapNumber === lap.lapNumber);
      if (saved) return formatFinishTime(saved.timeMilliseconds);
      if (record.resultStatus === 'OK' && eventLaps.length === 1) {
        return formatFinishTime(record.timeMilliseconds);
      }
      return '—';
    },
  }));
  const columns: ColumnsType<RankedSlot> = [
    {
      title: 'Место',
      dataIndex: 'place',
      width: 80,
      render: (value: number | null) => value ?? '—',
    },
    {
      title: 'Ст. №',
      dataIndex: 'startNumber',
      width: 80,
      render: (value: number | null) => value ?? '—',
    },
    {
      title: 'Участник',
      key: 'name',
      render: (_value: unknown, record) => `${record.lastName} ${record.firstName}`.trim(),
    },
    ...(severalHeats
      ? [
          {
            title: 'Заезд',
            dataIndex: 'heatNumber',
            width: 80,
          } satisfies ColumnsType<RankedSlot>[number],
        ]
      : []),
    ...lapColumns,
    {
      title: 'Общее время',
      key: 'total',
      width: 140,
      render: (_value: unknown, record) =>
        record.resultStatus === 'OK' ? (
          formatFinishTime(record.timeMilliseconds)
        ) : (
          <Tag>{record.resultStatus ?? '—'}</Tag>
        ),
    },
    {
      title: 'Статус заявки',
      key: 'registrationStatus',
      width: 280,
      render: (_value: unknown, record) =>
        canEditStatus ? (
          <RegistrationStatusSelect
            value={record.registrationStatus}
            loading={pending === `qualification-${stage.stageId}-${record.registrationId}`}
            omit={isTerminalStage(stage.kind) ? ['QQ', 'NQ'] : undefined}
            onChange={(status) => onChangeRegistrationStatus(record.registrationId, status)}
          />
        ) : (
          <Tag color={registrationStatusMeta(record.registrationStatus).color}>
            {registrationStatusMeta(record.registrationStatus).text}
          </Tag>
        ),
    },
  ];

  return (
    <Table
      size="small"
      pagination={false}
      rowKey="registrationId"
      columns={columns}
      dataSource={rows}
      scroll={{ x: 'max-content' }}
    />
  );
}

function isTerminalStage(kind: string): boolean {
  return kind === 'FINAL' || kind === 'FINAL_A' || kind === 'FINAL_B';
}

function stageStatusLabel(status: ClassCompetitionStage['status']): string {
  if (status === 'SEEDED') return 'Заезды готовы';
  if (status === 'COMPLETED') return 'Этап завершён';
  return 'Ожидает';
}
