import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  AGE_CATEGORY_GROUPS,
  categoryTitle,
  groupOptionLabel,
} from '../../../features/events/ageCategories';
import type {
  AgeGroupId,
  AgeSplitRef,
  SetAgeCategoriesRequest,
} from '../../../shared/types/event';
import { AgeSplitModal, type AgeSplitCategory } from './AgeSplitModal';

const category: AgeSplitCategory = {
  startId: 'start-a',
  formatId: 1,
  gender: 'M',
  startLabel: 'Кубковая гонка — 10 км',
  formatName: '10 км',
};

function categoryRef(index: number, groupIds: AgeGroupId[]) {
  return {
    id: `CATEGORY_${index}`,
    number: index,
    title: categoryTitle(index),
    subtitle: '',
    groupIds,
  };
}

function splitRef(
  categories: { groupIds: AgeGroupId[] }[],
  enabled = true,
): AgeSplitRef {
  return {
    startId: category.startId,
    formatId: category.formatId,
    gender: category.gender,
    enabled,
    categories: categories.map((item, index) =>
      categoryRef(index + 1, item.groupIds),
    ),
  };
}

/** Every base group populated, for the interaction tests. */
function allPopulated(count = 1): Partial<Record<AgeGroupId, number>> {
  const counts: Partial<Record<AgeGroupId, number>> = {};
  for (const group of AGE_CATEGORY_GROUPS) counts[group.id] = count;
  return counts;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `{count} - {name} ({range})`, count-agnostic. */
function optionName(groupId: AgeGroupId): RegExp {
  const group = AGE_CATEGORY_GROUPS.find((item) => item.id === groupId);
  if (!group) throw new Error(`Unknown age group: ${groupId}`);
  return new RegExp(
    `^\\d+ - ${escapeRegExp(group.name)} \\(${escapeRegExp(group.range)}\\)$`,
  );
}

function groupCheckbox(groupId: AgeGroupId): HTMLInputElement {
  return screen.getByRole('checkbox', {
    name: optionName(groupId),
  }) as HTMLInputElement;
}

function optionText(checkbox: HTMLInputElement): string | null {
  return checkbox.closest('label')?.textContent ?? null;
}

function renderModal(options?: {
  value?: AgeSplitRef | null;
  counts?: Partial<Record<AgeGroupId, number>>;
  notApplied?: boolean;
  saving?: boolean;
  onSave?: (payload: SetAgeCategoriesRequest) => void | Promise<void>;
}) {
  const onSave = vi.fn<
    (payload: SetAgeCategoriesRequest) => void | Promise<void>
  >(options?.onSave);
  const onClose = vi.fn();
  render(
    <AgeSplitModal
      open
      category={category}
      value={options?.value ?? null}
      groupCounts={options?.counts ?? allPopulated()}
      notApplied={options?.notApplied ?? false}
      saving={options?.saving ?? false}
      onClose={onClose}
      onSave={onSave}
    />,
  );
  return { onSave, onClose };
}

function saveButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement;
}

function addButton(): HTMLButtonElement {
  return screen.getByRole('button', {
    name: 'Добавить категорию',
  }) as HTMLButtonElement;
}

function resetButton(): HTMLButtonElement {
  return screen.getByRole('button', {
    name: 'Сброс категорий',
  }) as HTMLButtonElement;
}

function cancelButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Отмена' }) as HTMLButtonElement;
}

function tab(number: number): HTMLElement {
  return screen.getByRole('tab', {
    name: new RegExp(`^${number} Категория`),
  });
}

function tabs(): HTMLElement[] {
  return screen.getAllByRole('tab');
}

function removeTab(number: number): void {
  fireEvent.click(
    screen.getByRole('button', { name: `Удалить ${categoryTitle(number)}` }),
  );
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
  it('has no switch and opens with one empty «1 Категория - 0» tab', () => {
    renderModal();

    expect(screen.getByText('Возрастные категории')).not.toBeNull();
    expect(screen.getByText('Кубковая гонка — 10 км · 10 км')).not.toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByText('Разбить по возрасту')).toBeNull();
    expect(tabs()).toHaveLength(1);
    expect(tab(1)).not.toBeNull();
    expect(tab(1).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByText('Возрастное деление')).toBeNull();
    for (const group of AGE_CATEGORY_GROUPS) {
      expect(groupCheckbox(group.id).checked).toBe(false);
    }
    for (const retiredPreset of [
      'Юниоры и младше (<24)',
      'Мастера 41+',
      'Все возрастные группы',
    ]) {
      expect(screen.queryByText(retiredPreset)).toBeNull();
    }
    // U-36: the nine base groups are the only checkboxes; no preset control.
    expect(screen.getAllByRole('checkbox')).toHaveLength(
      AGE_CATEGORY_GROUPS.length,
    );
    expect(saveButton().disabled).toBe(false);
    expect(screen.queryByText('Выберите хотя бы одну группу')).toBeNull();
  });

  it('offers only populated groups with count-first labels in age order', () => {
    renderModal({ counts: { AGE_15_16: 7, AGE_24_40: 2 } });

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes.map(optionText)).toEqual([
      '7 - Юноши и девушки среднего возраста (15–16)',
      '2 - Мужчины и женщины (24–40)',
    ]);
    expect(
      screen.getByRole('checkbox', {
        name: '7 - Юноши и девушки среднего возраста (15–16)',
      }),
    ).not.toBeNull();
    expect(
      screen.getByRole('checkbox', {
        name: '2 - Мужчины и женщины (24–40)',
      }),
    ).not.toBeNull();
    expect(screen.queryByRole('checkbox', { name: optionName('AGE_LE_14') })).toBeNull();
    expect(
      screen.queryByRole('checkbox', { name: optionName('AGE_41_50') }),
    ).toBeNull();
  });

  it('keeps a stored zero-count group offered as `0 - …` and removable', () => {
    renderModal({
      counts: { AGE_15_16: 7, AGE_24_40: 2 },
      value: splitRef([{ groupIds: ['AGE_15_16'] }, { groupIds: ['AGE_41_50'] }]),
    });

    expect(tabs()).toHaveLength(2);
    fireEvent.click(tab(2));

    const zeroGroup = groupCheckbox('AGE_41_50');
    expect(zeroGroup.checked).toBe(true);
    expect(zeroGroup.disabled).toBe(false);
    expect(optionText(zeroGroup)).toBe(groupOptionLabel('AGE_41_50', 0));
    expect(optionText(zeroGroup)).toBe('0 - Мастер 1 (41–50)');

    fireEvent.click(zeroGroup);

    expect(
      screen.queryByRole('checkbox', { name: optionName('AGE_41_50') }),
    ).toBeNull();
  });

  it('preloads two tabs from a stored configuration and locks the other tab’s group', () => {
    renderModal({
      value: splitRef([
        { groupIds: ['AGE_15_16'] },
        { groupIds: ['AGE_41_50'] },
      ]),
    });

    expect(tabs()).toHaveLength(2);
    expect(within(tab(1)).getByText('15–16')).not.toBeNull();
    expect(within(tab(2)).getByText('41–50')).not.toBeNull();

    expect(groupCheckbox('AGE_15_16').checked).toBe(true);
    expect(groupCheckbox('AGE_15_16').disabled).toBe(false);
    expect(groupCheckbox('AGE_41_50').checked).toBe(true);
    expect(groupCheckbox('AGE_41_50').disabled).toBe(true);

    fireEvent.click(tab(2));

    expect(groupCheckbox('AGE_41_50').checked).toBe(true);
    expect(groupCheckbox('AGE_41_50').disabled).toBe(false);
    expect(groupCheckbox('AGE_15_16').checked).toBe(true);
    expect(groupCheckbox('AGE_15_16').disabled).toBe(true);
  });

  it('shows the participant count in bold in each tab heading', () => {
    renderModal({
      value: splitRef([
        { groupIds: ['AGE_15_16'] },
        { groupIds: ['AGE_41_50'] },
      ]),
      counts: { AGE_15_16: 7, AGE_41_50: 2 },
    });

    expect(tab(1).textContent).toContain('1 Категория - 7');
    expect(tab(1).querySelector('strong')).toBeNull();
    expect(tab(2).textContent).toContain('2 Категория - 2');
    expect(tab(2).querySelector('strong')).toBeNull();
  });

  it('renders a group held by another tab checked and disabled without any hint', () => {
    renderModal();

    fireEvent.click(groupCheckbox('AGE_15_16'));
    fireEvent.click(addButton());

    const locked = groupCheckbox('AGE_15_16');
    expect(locked.checked).toBe(true);
    expect(locked.disabled).toBe(true);
    expect(optionText(locked)).toBe(
      groupOptionLabel('AGE_15_16', 1),
    );
    expect(screen.queryByText(/входит в/)).toBeNull();

    const freeGroup = groupCheckbox('AGE_24_40');
    expect(freeGroup.disabled).toBe(false);
    fireEvent.click(freeGroup);

    expect(groupCheckbox('AGE_24_40').checked).toBe(true);
    expect(groupCheckbox('AGE_24_40').disabled).toBe(false);
  });

  it('removes tab 1, releases its groups and renumbers the remaining tab', () => {
    renderModal();

    fireEvent.click(groupCheckbox('AGE_15_16'));
    fireEvent.click(addButton());
    fireEvent.click(groupCheckbox('AGE_24_40'));
    removeTab(1);

    expect(tabs()).toHaveLength(1);
    expect(tab(1)).not.toBeNull();
    expect(screen.queryByRole('tab', { name: /2 Категория/ })).toBeNull();
    expect(groupCheckbox('AGE_24_40').checked).toBe(true);
    expect(groupCheckbox('AGE_24_40').disabled).toBe(false);
    expect(groupCheckbox('AGE_15_16').checked).toBe(false);
    expect(groupCheckbox('AGE_15_16').disabled).toBe(false);
  });

  it('removes the last tab, keeps adding and saving available', async () => {
    const { onSave } = renderModal();

    fireEvent.click(groupCheckbox('AGE_24_40'));
    removeTab(1);

    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(addButton().disabled).toBe(false);
    expect(saveButton().disabled).toBe(false);

    fireEvent.click(addButton());

    expect(tabs()).toHaveLength(1);
    expect(tab(1)).not.toBeNull();
    expect(groupCheckbox('AGE_15_16').checked).toBe(false);

    clickSave();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toEqual({
      gender: 'M',
      startId: 'start-a',
      formatId: 1,
      enabled: false,
      categories: [],
    });
  });

  it('resets the draft to one empty active «1 Категория - 0» tab and stores nothing', () => {
    const { onSave, onClose } = renderModal({
      value: splitRef([
        { groupIds: ['AGE_15_16'] },
        { groupIds: ['AGE_24_40'] },
      ]),
    });

    fireEvent.click(tab(2));
    fireEvent.click(groupCheckbox('AGE_41_50'));
    fireEvent.click(addButton());

    expect(tabs()).toHaveLength(3);

    fireEvent.click(resetButton());

    expect(tabs()).toHaveLength(1);
    expect(tab(1)).not.toBeNull();
    expect(tab(1).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByRole('tab', { name: /2 Категория/ })).toBeNull();
    expect(screen.queryByRole('tab', { name: /3 Категория/ })).toBeNull();
    for (const group of AGE_CATEGORY_GROUPS) {
      expect(groupCheckbox(group.id).checked).toBe(false);
      expect(groupCheckbox(group.id).disabled).toBe(false);
    }
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(cancelButton());

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('disables «Добавить категорию» once every populated group is assigned and enables it after a release', () => {
    renderModal({ counts: { AGE_15_16: 7, AGE_24_40: 2 } });

    fireEvent.click(groupCheckbox('AGE_15_16'));
    fireEvent.click(addButton());
    fireEvent.click(groupCheckbox('AGE_24_40'));

    expect(addButton().disabled).toBe(true);

    fireEvent.click(groupCheckbox('AGE_24_40'));

    expect(addButton().disabled).toBe(false);
  });

  it('disables «Добавить категорию» when no group is populated and still allows the save', () => {
    renderModal({ counts: {} });

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(addButton().disabled).toBe(true);
    expect(saveButton().disabled).toBe(false);
  });

  it('keeps «Добавить категорию» enabled with nine tabs while a group is free', () => {
    renderModal({
      value: splitRef([
        { groupIds: ['AGE_LE_14'] },
        { groupIds: ['AGE_15_16'] },
        { groupIds: ['AGE_17_18'] },
        { groupIds: ['AGE_19_20'] },
        { groupIds: ['AGE_21_23'] },
        { groupIds: ['AGE_24_40'] },
        { groupIds: ['AGE_41_50'] },
        { groupIds: ['AGE_51_60'] },
        { groupIds: [] },
      ]),
    });

    expect(tabs()).toHaveLength(9);
    expect(addButton().disabled).toBe(false);

    fireEvent.click(tab(9));
    expect(groupCheckbox('AGE_61_PLUS').checked).toBe(false);
    fireEvent.click(groupCheckbox('AGE_61_PLUS'));

    expect(addButton().disabled).toBe(true);
  });

  it('keeps «Добавить категорию» disabled with nine tabs once all groups are assigned', () => {
    renderModal({
      value: splitRef([
        { groupIds: ['AGE_LE_14'] },
        { groupIds: ['AGE_15_16'] },
        { groupIds: ['AGE_17_18'] },
        { groupIds: ['AGE_19_20'] },
        { groupIds: ['AGE_21_23', 'AGE_24_40'] },
        { groupIds: ['AGE_41_50'] },
        { groupIds: ['AGE_51_60'] },
        { groupIds: ['AGE_61_PLUS'] },
        { groupIds: [] },
      ]),
    });

    expect(tabs()).toHaveLength(9);
    expect(addButton().disabled).toBe(true);

    fireEvent.click(tab(1));
    fireEvent.click(groupCheckbox('AGE_LE_14'));

    expect(addButton().disabled).toBe(false);
  });

  it('saves the non-empty tabs in order with enabled true and drops the empty tab', async () => {
    const { onSave } = renderModal();

    fireEvent.click(groupCheckbox('AGE_24_40'));
    fireEvent.click(addButton());
    fireEvent.click(groupCheckbox('AGE_15_16'));
    fireEvent.click(addButton());

    expect(tabs()).toHaveLength(3);
    clickSave();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({
      gender: 'M',
      startId: 'start-a',
      formatId: 1,
      enabled: true,
      categories: [
        { groupIds: ['AGE_24_40'] },
        { groupIds: ['AGE_15_16'] },
      ],
    });
    expect(screen.getByText('Возрастные категории')).not.toBeNull();
    expect(screen.queryByText('Возрастное деление')).toBeNull();
  });

  it('saves an empty draft as disabled with no categories and keeps the save enabled', async () => {
    const { onSave } = renderModal({
      value: splitRef([
        { groupIds: ['AGE_15_16'] },
        { groupIds: ['AGE_41_50'] },
      ]),
    });

    fireEvent.click(resetButton());

    expect(saveButton().disabled).toBe(false);
    clickSave();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toEqual({
      gender: 'M',
      startId: 'start-a',
      formatId: 1,
      enabled: false,
      categories: [],
    });
  });

  it('keeps the draft and the dialog open when the save is rejected', async () => {
    const onSave = vi.fn<
      (payload: SetAgeCategoriesRequest) => Promise<void>
    >(() =>
      Promise.reject(new Error('Категория не найдена на этом мероприятии.')),
    );
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    renderModal({
      value: splitRef([
        { groupIds: ['AGE_15_16'] },
        { groupIds: ['AGE_24_40'] },
      ]),
      onSave,
    });

    fireEvent.click(tab(2));
    fireEvent.click(groupCheckbox('AGE_41_50'));
    fireEvent.click(addButton());
    fireEvent.click(groupCheckbox('AGE_51_60'));
    clickSave();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toEqual({
      gender: 'M',
      startId: 'start-a',
      formatId: 1,
      enabled: true,
      categories: [
        { groupIds: ['AGE_15_16'] },
        { groupIds: ['AGE_24_40', 'AGE_41_50'] },
        { groupIds: ['AGE_51_60'] },
      ],
    });

    expect(screen.getByText('Возрастные категории')).not.toBeNull();
    expect(tabs()).toHaveLength(3);
    expect(tab(3).getAttribute('aria-selected')).toBe('true');
    expect(groupCheckbox('AGE_51_60').checked).toBe(true);
    expect(groupCheckbox('AGE_41_50').checked).toBe(true);
    expect(groupCheckbox('AGE_41_50').disabled).toBe(true);
    expect(screen.queryByText(/входит в/)).toBeNull();
  });

  it('closes without saving and submits nothing', () => {
    const { onSave, onClose } = renderModal({
      value: splitRef([{ groupIds: ['AGE_15_16'] }]),
    });

    fireEvent.click(groupCheckbox('AGE_24_40'));
    fireEvent.click(cancelButton());

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('warns that the stored categories are not applied while a bracket exists', () => {
    renderModal({ notApplied: true });

    expect(
      screen.getByText('Категории сохранены, но не применяются'),
    ).not.toBeNull();
    expect(
      screen.getByText(
        'Пока для категории существует общая многоэтапная гонка, протокол выводится без возрастных категорий.',
      ),
    ).not.toBeNull();
  });

  it('renders no warning without a suppressing bracket', () => {
    renderModal();

    expect(
      screen.queryByText('Категории сохранены, но не применяются'),
    ).toBeNull();
  });

  it('disables every action and the picker while a save is in progress', () => {
    renderModal({
      saving: true,
      value: splitRef([
        { groupIds: ['AGE_15_16'] },
        { groupIds: ['AGE_24_40'] },
      ]),
    });

    expect(
      (
        screen.getByRole('button', { name: /Сохранить/ }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(addButton().disabled).toBe(true);
    expect(resetButton().disabled).toBe(true);
    expect(cancelButton().disabled).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: `Удалить ${categoryTitle(1)}`,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    for (const group of AGE_CATEGORY_GROUPS) {
      expect(groupCheckbox(group.id).disabled).toBe(true);
    }
  });
});
