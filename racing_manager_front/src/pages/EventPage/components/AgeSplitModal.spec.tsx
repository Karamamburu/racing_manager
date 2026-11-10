import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type {
  AgeGroupId,
  AgeSectionRef,
  AgeSplitRef,
} from '../../../shared/types/event';
import {
  AGE_SPLIT_GROUPS,
  AGE_SPLIT_PRESETS,
  ALL_GROUPS_ACTION_TITLE,
  AgeSplitModal,
  type AgeSplitCategory,
} from './AgeSplitModal';

const category: AgeSplitCategory = {
  startId: 'start-a',
  formatId: 1,
  gender: 'M',
  startLabel: 'Кубковая гонка — 10 км',
  formatName: '10 км',
};

function baseSection(id: AgeGroupId, title: string): AgeSectionRef {
  return { id, kind: 'BASE_GROUP', title };
}

function splitRef(sections: AgeSectionRef[], enabled = true): AgeSplitRef {
  return {
    startId: category.startId,
    formatId: category.formatId,
    gender: category.gender,
    enabled,
    sections,
  };
}

function groupCheckbox(groupId: AgeGroupId): HTMLInputElement {
  const group = AGE_SPLIT_GROUPS.find((item) => item.id === groupId);
  if (!group) throw new Error(`Unknown age group: ${groupId}`);
  return screen.getByRole('checkbox', {
    name: `${group.labels.M} (${group.range})`,
  }) as HTMLInputElement;
}

function presetCheckbox(presetId: string): HTMLInputElement {
  const preset = AGE_SPLIT_PRESETS.find((item) => item.id === presetId);
  if (!preset) throw new Error(`Unknown preset: ${presetId}`);
  return screen.getByRole('checkbox', { name: preset.title }) as HTMLInputElement;
}

function renderModal(options?: {
  value?: AgeSplitRef | null;
  notApplied?: boolean;
  saving?: boolean;
}) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(
    <AgeSplitModal
      open
      category={category}
      value={options?.value ?? null}
      notApplied={options?.notApplied ?? false}
      saving={options?.saving ?? false}
      onClose={onClose}
      onSave={onSave}
    />,
  );
  return { onSave, onClose };
}

function switchControl(): HTMLElement {
  return screen.getByRole('switch', { name: 'Разбить по возрасту' });
}

function saveButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement;
}

function clickSave(): void {
  fireEvent.click(saveButton());
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(cleanup);

describe('AgeSplitModal', () => {
  it('opens in the off state with no stored configuration', () => {
    renderModal();

    expect(screen.getByText('Возрастное деление')).not.toBeNull();
    expect(
      screen.getByText('Кубковая гонка — 10 км · 10 км'),
    ).not.toBeNull();
    expect(switchControl().getAttribute('aria-checked')).toBe('false');
    for (const group of AGE_SPLIT_GROUPS) {
      expect(groupCheckbox(group.id).checked).toBe(false);
    }
    for (const preset of AGE_SPLIT_PRESETS) {
      expect(presetCheckbox(preset.id).checked).toBe(false);
    }
    expect(saveButton().disabled).toBe(false);
    expect(screen.queryByText('Выберите хотя бы одну группу')).toBeNull();
  });

  it('pre-checks a stored base group', () => {
    renderModal({
      value: splitRef([baseSection('AGE_15_16', 'Юноши среднего возраста (15–16)')]),
    });

    expect(switchControl().getAttribute('aria-checked')).toBe('true');
    expect(groupCheckbox('AGE_15_16').checked).toBe(true);
    expect(groupCheckbox('AGE_24_40').checked).toBe(false);
  });

  it('checks an applied combined preset and disables its member groups', () => {
    renderModal();

    fireEvent.click(presetCheckbox('PRESET_JUNIOR_UNDER_24'));

    const preset = AGE_SPLIT_PRESETS.find(
      (item) => item.id === 'PRESET_JUNIOR_UNDER_24',
    );
    expect(preset).toBeDefined();
    expect(presetCheckbox('PRESET_JUNIOR_UNDER_24').checked).toBe(true);
    for (const groupId of preset?.groupIds ?? []) {
      expect(groupCheckbox(groupId).checked).toBe(true);
      expect(groupCheckbox(groupId).disabled).toBe(true);
    }
    expect(groupCheckbox('AGE_24_40').disabled).toBe(false);
    expect(
      screen.getAllByText('входит в «Юниоры и младше (<24)»').length,
    ).toBe(preset?.groupIds.length);
  });

  it('saves two base groups as BASE_GROUP sections in canonical order', async () => {
    const { onSave } = renderModal();

    fireEvent.click(switchControl());
    fireEvent.click(groupCheckbox('AGE_24_40'));
    fireEvent.click(groupCheckbox('AGE_15_16'));
    clickSave();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({
      gender: 'M',
      startId: 'start-a',
      formatId: 1,
      enabled: true,
      sections: [
        { kind: 'BASE_GROUP', id: 'AGE_15_16' },
        { kind: 'BASE_GROUP', id: 'AGE_24_40' },
      ],
    });
  });

  it('selects all nine groups and clears a combined preset', async () => {
    const { onSave } = renderModal();

    fireEvent.click(switchControl());
    fireEvent.click(presetCheckbox('PRESET_JUNIOR_UNDER_24'));
    fireEvent.click(screen.getByRole('button', { name: ALL_GROUPS_ACTION_TITLE }));

    expect(presetCheckbox('PRESET_JUNIOR_UNDER_24').checked).toBe(false);
    expect(AGE_SPLIT_GROUPS).toHaveLength(9);
    for (const group of AGE_SPLIT_GROUPS) {
      expect(groupCheckbox(group.id).checked).toBe(true);
      expect(groupCheckbox(group.id).disabled).toBe(false);
    }

    clickSave();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({
      gender: 'M',
      startId: 'start-a',
      formatId: 1,
      enabled: true,
      sections: AGE_SPLIT_GROUPS.map((group) => ({
        kind: 'BASE_GROUP',
        id: group.id,
      })),
    });
  });

  it('switches the split off and emits an empty section set', async () => {
    const { onSave } = renderModal({
      value: splitRef([baseSection('AGE_15_16', 'Юноши среднего возраста (15–16)')]),
    });

    expect(switchControl().getAttribute('aria-checked')).toBe('true');
    fireEvent.click(switchControl());
    expect(switchControl().getAttribute('aria-checked')).toBe('false');
    clickSave();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({
      gender: 'M',
      startId: 'start-a',
      formatId: 1,
      enabled: false,
      sections: [],
    });
  });

  it('keeps saving disabled and shows the hint when the split is on without a selection', () => {
    renderModal();

    fireEvent.click(switchControl());

    expect(switchControl().getAttribute('aria-checked')).toBe('true');
    expect(saveButton().disabled).toBe(true);
    expect(screen.getByText('Выберите хотя бы одну группу')).not.toBeNull();
  });

  it('warns that the stored split is not applied while a bracket exists', () => {
    renderModal({ notApplied: true });

    expect(
      screen.getByText('Деление сохранено, но не применяется'),
    ).not.toBeNull();
    expect(
      screen.getByText(
        'Пока для категории существует многоэтапная гонка, протокол выводится без возрастных секций.',
      ),
    ).not.toBeNull();
  });

  it('renders no warning without a suppressing bracket', () => {
    renderModal();

    expect(
      screen.queryByText('Деление сохранено, но не применяется'),
    ).toBeNull();
  });
});
