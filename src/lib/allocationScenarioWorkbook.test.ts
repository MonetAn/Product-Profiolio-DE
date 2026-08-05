import { describe, expect, it } from 'vitest';
import type { LocationAllocationScenarioTeam } from '@/hooks/useLocationAllocationScenario';
import {
  allocationScenarioUnitWorkbookFilename,
  buildAllocationScenarioUnitWorkbook,
} from '@/lib/allocationScenarioWorkbook';

const dataPlatform: LocationAllocationScenarioTeam = {
  id: 'data-platform',
  unit: 'Data Office',
  sourceUnit: 'Data Office',
  sourceTeam: 'Data Platform',
  name: 'Data Platform',
  description: 'Единая платформа данных и инструменты для продуктовых команд.',
  fot2025Rub: 57_000_000,
  fot2026Rub: 68_000_000,
  peopleCount2025: 8,
  peopleCount2026: 9.5,
  fotChangeRub: 11_000_000,
  fotGrowthPercent: 19.3,
  runPercent: 35,
  runDescription: 'Поддержка платформы, мониторинг и эксплуатация.',
  sortOrder: 0,
  isArchived: false,
  updatedByName: 'Martin Grinchevsky',
  updatedAt: '2026-08-05T06:31:38.14852+00:00',
  regions: [
    {
      id: 'domestic',
      teamId: 'data-platform',
      region: 'Domestic Region',
      percent: 10,
      description: 'Поддержка домашнего региона.',
      sortOrder: 0,
    },
    {
      id: 'international',
      teamId: 'data-platform',
      region: 'International Region',
      percent: 5,
      description: 'Поддержка международного региона.',
      sortOrder: 1,
    },
    {
      id: 'drinkit',
      teamId: 'data-platform',
      region: 'Drink It',
      percent: 10,
      description: 'Данные Drinkit.',
      sortOrder: 2,
    },
    {
      id: 'platform',
      teamId: 'data-platform',
      region: 'Platform',
      percent: 40,
      description: 'Общие платформенные инициативы.',
      sortOrder: 3,
    },
  ],
};

const analyticsPlatform: LocationAllocationScenarioTeam = {
  ...dataPlatform,
  id: 'analytics-platform',
  name: 'Analytics Platform',
  description: 'Инструменты и витрины для аналитиков.',
  fot2026Rub: 32_000_000,
  peopleCount2026: 5,
  runPercent: 30,
  sortOrder: 1,
  updatedByName: 'Anton Monetov',
  regions: dataPlatform.regions.map((region) => ({
    ...region,
    id: `analytics-${region.id}`,
    teamId: 'analytics-platform',
  })),
};

function storedZipEntries(bytes: Uint8Array): Map<string, string> {
  const entries = new Map<string, string>();
  const decoder = new TextDecoder();
  let offset = 0;

  while (offset + 30 <= bytes.length) {
    const view = new DataView(
      bytes.buffer,
      bytes.byteOffset + offset,
      bytes.byteLength - offset
    );
    if (view.getUint32(0, true) !== 0x04034b50) break;
    const compressedSize = view.getUint32(18, true);
    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    const data = decoder.decode(bytes.subarray(dataStart, dataStart + compressedSize));
    entries.set(name, data);
    offset = dataStart + compressedSize;
  }

  return entries;
}

describe('allocation scenario workbook', () => {
  it('builds a unit summary and one allocation tab per team', () => {
    const bytes = buildAllocationScenarioUnitWorkbook(
      'Data Office',
      [dataPlatform, analyticsPlatform],
      new Date('2026-08-05T09:00:00+03:00')
    );
    const entries = storedZipEntries(bytes);
    const workbook = entries.get('xl/workbook.xml') ?? '';
    const summary = entries.get('xl/worksheets/sheet1.xml') ?? '';
    const dataPlatformSheet = entries.get('xl/worksheets/sheet2.xml') ?? '';
    const analyticsSheet = entries.get('xl/worksheets/sheet3.xml') ?? '';

    expect(Array.from(bytes.slice(0, 2))).toEqual([0x50, 0x4b]);
    expect(workbook).toContain('name="Сводка"');
    expect(workbook).toContain('name="Data Platform"');
    expect(workbook).toContain('name="Analytics Platform"');
    expect(summary).toContain('Data Platform');
    expect(summary).toContain('Analytics Platform');
    expect(summary).toContain('Domestic (%)');
    expect(summary).toContain('RUN (₽)');
    expect(summary).toContain('<f>C10*E10</f>');
    expect(summary).toContain('Martin Grinchevsky');
    expect(summary).toContain('Anton Monetov');
    expect(dataPlatformSheet).toContain(
      'Data Platform — аллокация стоимости 2026'
    );
    expect(dataPlatformSheet).toContain('<f>&apos;Сводка&apos;!C10</f>');
    expect(dataPlatformSheet).toContain('Поддержка домашнего региона.');
    expect(analyticsSheet).toContain(
      'Analytics Platform — аллокация стоимости 2026'
    );
    expect(analyticsSheet).toContain('<f>&apos;Сводка&apos;!C11</f>');
  });

  it('does not expose the columns and annotations removed from the export', () => {
    const entries = storedZipEntries(
      buildAllocationScenarioUnitWorkbook(
        'Data Office',
        [dataPlatform, analyticsPlatform],
        new Date('2026-08-05T09:00:00+03:00')
      )
    );
    const allXml = [...entries.values()].join('\n');

    expect(allXml).not.toContain('Стоимость 2025');
    expect(allXml).not.toContain('Изменение стоимости');
    expect(allXml).not.toContain('Люди 2025');
    expect(allXml).not.toContain('Сумма аллокаций (%)');
    expect(allXml).not.toContain('Отклонение от 100%');
    expect(allXml).not.toContain('Распределение сходится');
    expect(allXml).not.toContain('Последнее обновление на странице');
  });

  it('uses a Google Sheets-friendly xlsx filename', () => {
    expect(
      allocationScenarioUnitWorkbookFilename(
        'Data Office',
        new Date('2026-08-05T09:00:00+03:00')
      )
    ).toBe('Data_Office_аллокации_2026-08-05.xlsx');
  });
});
