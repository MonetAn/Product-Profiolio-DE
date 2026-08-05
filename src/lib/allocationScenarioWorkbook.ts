import {
  ALLOCATION_SCENARIO_AREA_LABELS,
  ALLOCATION_SCENARIO_AREA_ORDER,
} from '@/lib/allocationScenarioAreas';
import type { LocationAllocationScenarioTeam } from '@/hooks/useLocationAllocationScenario';

type WorkbookCell = {
  ref: string;
  xml: string;
};

type AllocationWorkbookRow = {
  area: string;
  percent: number;
  amountRub: number;
  description: string;
};

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const textEncoder = new TextEncoder();

const AREA_FILL_STYLE: Record<string, number> = {
  Domestic: 10,
  International: 11,
  Drinkit: 12,
  Platform: 13,
  RUN: 14,
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function inlineStringCell(ref: string, value: string, style = 0): WorkbookCell {
  return {
    ref,
    xml: `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`,
  };
}

function numberCell(ref: string, value: number, style = 0): WorkbookCell {
  return {
    ref,
    xml: `<c r="${ref}" s="${style}"><v>${Number.isFinite(value) ? value : 0}</v></c>`,
  };
}

function formulaCell(
  ref: string,
  formula: string,
  cachedValue: number,
  style = 0
): WorkbookCell {
  return {
    ref,
    xml: `<c r="${ref}" s="${style}"><f>${escapeXml(formula)}</f><v>${Number.isFinite(cachedValue) ? cachedValue : 0}</v></c>`,
  };
}

function worksheetRow(
  row: number,
  cells: WorkbookCell[],
  height?: number
): string {
  const heightAttrs = height
    ? ` ht="${Math.round(height * 10) / 10}" customHeight="1"`
    : '';
  return `<row r="${row}"${heightAttrs}>${cells.map((cell) => cell.xml).join('')}</row>`;
}

function isoDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function normalizedEntityName(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'allocation';
}

function allocationRows(
  team: LocationAllocationScenarioTeam
): AllocationWorkbookRow[] {
  const regionRows = ALLOCATION_SCENARIO_AREA_ORDER.map((region) => {
    const item = team.regions.find((candidate) => candidate.region === region);
    const percent = item?.percent ?? 0;
    return {
      area: ALLOCATION_SCENARIO_AREA_LABELS[region],
      percent,
      amountRub: Math.round(team.fot2026Rub * (percent / 100)),
      description: item?.description ?? '',
    };
  });
  return [
    ...regionRows,
    {
      area: 'RUN',
      percent: team.runPercent,
      amountRub: Math.round(team.fot2026Rub * (team.runPercent / 100)),
      description: team.runDescription,
    },
  ];
}

function estimatedRowHeight(
  teamDescription: string,
  allocationDescription: string
): number {
  const estimateLines = (value: string, lineWidth: number) =>
    Math.max(
      1,
      value.split('\n').reduce((sum, line) => {
        return sum + Math.max(1, Math.ceil(line.length / lineWidth));
      }, 0)
    );
  const lines = Math.max(
    estimateLines(teamDescription, 52),
    estimateLines(allocationDescription, 66)
  );
  return Math.min(210, Math.max(46, lines * 14 + 10));
}

const SUMMARY_START_ROW = 10;
const SUMMARY_AREA_COLUMNS = [
  ['E', 'F'],
  ['G', 'H'],
  ['I', 'J'],
  ['K', 'L'],
  ['M', 'N'],
] as const;

function sortedTeams(
  teams: LocationAllocationScenarioTeam[]
): LocationAllocationScenarioTeam[] {
  return [...teams].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ru')
  );
}

function summarySheetXml(
  unit: string,
  teams: LocationAllocationScenarioTeam[],
  exportDate: Date
): string {
  const headers = [
    'Команда',
    'Описание команды',
    'Стоимость 2026 (₽)',
    'Люди 2026',
    'Domestic (%)',
    'Domestic (₽)',
    'International (%)',
    'International (₽)',
    'Drinkit (%)',
    'Drinkit (₽)',
    'Platform (%)',
    'Platform (₽)',
    'RUN (%)',
    'RUN (₽)',
    'Обновил',
    'Обновлено (UTC)',
  ];
  const headerRefs = 'ABCDEFGHIJKLMNOP'.split('');
  const totalCost = teams.reduce((sum, team) => sum + team.fot2026Rub, 0);
  const totalPeople = teams.reduce((sum, team) => sum + team.peopleCount2026, 0);
  const sheetRows: string[] = [
    worksheetRow(1, [
      inlineStringCell('A1', `${unit} — сводка аллокаций 2026`, 1),
    ], 36),
    worksheetRow(2, [
      inlineStringCell(
        'A2',
        `Текущие данные страницы аллокаций · выгружено ${isoDateOnly(exportDate)}`,
        2
      ),
    ], 21),
    worksheetRow(3, [], 12),
    worksheetRow(4, [
      inlineStringCell('A4', 'КОМАНДЫ', 3),
      inlineStringCell('E4', 'СТОИМОСТЬ 2026', 3),
      inlineStringCell('K4', 'ЛЮДИ 2026', 3),
    ], 20),
    worksheetRow(5, [
      numberCell('A5', teams.length, 27),
      numberCell('E5', totalCost, 4),
      numberCell('K5', totalPeople, 5),
    ], 25),
    worksheetRow(6, [], 25),
    worksheetRow(7, [], 12),
    worksheetRow(8, [
      inlineStringCell('A8', 'КОМАНДЫ И РАСПРЕДЕЛЕНИЕ СТОИМОСТИ 2026', 6),
    ], 22),
    worksheetRow(
      9,
      headers.map((header, index) =>
        inlineStringCell(`${headerRefs[index]}9`, header, 21)
      ),
      36
    ),
  ];

  teams.forEach((team, index) => {
    const sheetRow = SUMMARY_START_ROW + index;
    const rows = allocationRows(team);
    const cells: WorkbookCell[] = [
      inlineStringCell(`A${sheetRow}`, team.name, 28),
      inlineStringCell(`B${sheetRow}`, team.description, 22),
      numberCell(`C${sheetRow}`, team.fot2026Rub, 23),
      numberCell(`D${sheetRow}`, team.peopleCount2026, 24),
    ];
    rows.forEach((allocation, allocationIndex) => {
      const [percentColumn, amountColumn] =
        SUMMARY_AREA_COLUMNS[allocationIndex];
      cells.push(
        numberCell(
          `${percentColumn}${sheetRow}`,
          allocation.percent / 100,
          15
        ),
        formulaCell(
          `${amountColumn}${sheetRow}`,
          `C${sheetRow}*${percentColumn}${sheetRow}`,
          allocation.amountRub,
          23
        )
      );
    });
    cells.push(
      inlineStringCell(`O${sheetRow}`, team.updatedByName, 26),
      inlineStringCell(`P${sheetRow}`, team.updatedAt ?? '', 26)
    );
    sheetRows.push(
      worksheetRow(
        sheetRow,
        cells,
        Math.min(130, estimatedRowHeight(team.description, ''))
      )
    );
  });

  const lastTeamRow = Math.max(SUMMARY_START_ROW, SUMMARY_START_ROW + teams.length - 1);
  const totalRow = SUMMARY_START_ROW + teams.length;
  const allocationTotals = SUMMARY_AREA_COLUMNS.map((_, allocationIndex) =>
    teams.reduce((sum, team) => {
      return sum + allocationRows(team)[allocationIndex].amountRub;
    }, 0)
  );
  const totalCells: WorkbookCell[] = [
    inlineStringCell(`A${totalRow}`, 'ИТОГО', 18),
    inlineStringCell(`B${totalRow}`, '', 18),
    formulaCell(
      `C${totalRow}`,
      `SUM(C${SUMMARY_START_ROW}:C${lastTeamRow})`,
      totalCost,
      20
    ),
    formulaCell(
      `D${totalRow}`,
      `SUM(D${SUMMARY_START_ROW}:D${lastTeamRow})`,
      totalPeople,
      29
    ),
  ];
  SUMMARY_AREA_COLUMNS.forEach(([percentColumn, amountColumn], index) => {
    const amount = allocationTotals[index];
    totalCells.push(
      formulaCell(
        `${percentColumn}${totalRow}`,
        `IFERROR(${amountColumn}${totalRow}/C${totalRow},0)`,
        totalCost > 0 ? amount / totalCost : 0,
        19
      ),
      formulaCell(
        `${amountColumn}${totalRow}`,
        `SUM(${amountColumn}${SUMMARY_START_ROW}:${amountColumn}${lastTeamRow})`,
        amount,
        20
      )
    );
  });
  totalCells.push(
    inlineStringCell(`O${totalRow}`, '', 18),
    inlineStringCell(`P${totalRow}`, '', 18)
  );
  sheetRows.push(worksheetRow(totalRow, totalCells, 26));

  return `${XML_HEADER}
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:P${totalRow}"/>
  <sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane xSplit="1" ySplit="9" topLeftCell="B10" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>
    <col min="1" max="1" width="24" customWidth="1"/><col min="2" max="2" width="48" customWidth="1"/>
    <col min="3" max="3" width="18" customWidth="1"/><col min="4" max="4" width="12" customWidth="1"/>
    <col min="5" max="5" width="14" customWidth="1"/><col min="6" max="6" width="17" customWidth="1"/>
    <col min="7" max="7" width="17" customWidth="1"/><col min="8" max="8" width="18" customWidth="1"/>
    <col min="9" max="9" width="14" customWidth="1"/><col min="10" max="10" width="17" customWidth="1"/>
    <col min="11" max="11" width="14" customWidth="1"/><col min="12" max="12" width="17" customWidth="1"/>
    <col min="13" max="13" width="12" customWidth="1"/><col min="14" max="14" width="17" customWidth="1"/>
    <col min="15" max="15" width="22" customWidth="1"/><col min="16" max="16" width="32" customWidth="1"/>
  </cols>
  <sheetData>${sheetRows.join('')}</sheetData>
  <mergeCells count="9">
    <mergeCell ref="A1:P1"/><mergeCell ref="A2:P2"/>
    <mergeCell ref="A4:D4"/><mergeCell ref="E4:J4"/><mergeCell ref="K4:P4"/>
    <mergeCell ref="A5:D6"/><mergeCell ref="E5:J6"/><mergeCell ref="K5:P6"/>
    <mergeCell ref="A8:P8"/>
  </mergeCells>
  <autoFilter ref="A9:P${lastTeamRow}"/>
  <pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/>
</worksheet>`;
}

function teamSheetXml(
  team: LocationAllocationScenarioTeam,
  rows: AllocationWorkbookRow[],
  exportDate: Date,
  summaryRow: number
): string {
  const totalPercent = rows.reduce((sum, row) => sum + row.percent, 0);
  const totalRub = rows.reduce((sum, row) => sum + row.amountRub, 0);
  const teamDescriptionHeight = Math.max(
    75,
    estimatedRowHeight(team.description, '')
  );
  const teamDescriptionRowHeight = teamDescriptionHeight / 3;
  const sheetRows: string[] = [
    worksheetRow(1, [
      inlineStringCell('A1', `${team.name} — аллокация стоимости 2026`, 1),
    ], 36),
    worksheetRow(2, [
      inlineStringCell(
        'A2',
        `${team.unit} · текущие данные страницы аллокаций · выгружено ${isoDateOnly(exportDate)}`,
        2
      ),
    ], 21),
    worksheetRow(3, [], 12),
    worksheetRow(4, [
      inlineStringCell('A4', 'СТОИМОСТЬ 2026', 3),
      inlineStringCell('E4', 'ЛЮДИ 2026', 3),
    ], 20),
    worksheetRow(5, [
      formulaCell('A5', `'Сводка'!C${summaryRow}`, team.fot2026Rub, 4),
      formulaCell('E5', `'Сводка'!D${summaryRow}`, team.peopleCount2026, 5),
    ], 25),
    worksheetRow(6, [], 25),
    worksheetRow(7, [], 12),
    worksheetRow(8, [inlineStringCell('A8', 'ОПИСАНИЕ КОМАНДЫ', 7)], 20),
    worksheetRow(
      9,
      [inlineStringCell('A9', team.description, 8)],
      teamDescriptionRowHeight
    ),
    worksheetRow(10, [], teamDescriptionRowHeight),
    worksheetRow(11, [], teamDescriptionRowHeight),
    worksheetRow(12, [], 12),
    worksheetRow(13, [
      inlineStringCell('A13', 'РАСПРЕДЕЛЕНИЕ СТОИМОСТИ 2026', 6),
    ], 22),
    worksheetRow(14, [
      inlineStringCell('A14', 'Направление', 9),
      inlineStringCell('B14', 'Аллокация', 9),
      inlineStringCell('C14', 'Сумма', 9),
      inlineStringCell('D14', 'Описание', 9),
    ], 22),
  ];

  rows.forEach((row, index) => {
    const sheetRow = 15 + index;
    const [summaryPercentColumn, summaryAmountColumn] =
      SUMMARY_AREA_COLUMNS[index];
    sheetRows.push(
      worksheetRow(
        sheetRow,
        [
          inlineStringCell(
            `A${sheetRow}`,
            row.area,
            AREA_FILL_STYLE[row.area] ?? 14
          ),
          formulaCell(
            `B${sheetRow}`,
            `'Сводка'!${summaryPercentColumn}${summaryRow}`,
            row.percent / 100,
            15
          ),
          formulaCell(
            `C${sheetRow}`,
            `'Сводка'!${summaryAmountColumn}${summaryRow}`,
            row.amountRub,
            16
          ),
          inlineStringCell(`D${sheetRow}`, row.description, 17),
        ],
        estimatedRowHeight('', row.description)
      )
    );
  });

  sheetRows.push(
    worksheetRow(20, [
      inlineStringCell('A20', 'ИТОГО', 18),
      formulaCell('B20', 'SUM(B15:B19)', totalPercent / 100, 19),
      formulaCell('C20', 'SUM(C15:C19)', totalRub, 20),
      inlineStringCell('D20', '', 18),
    ], 24)
  );

  return `${XML_HEADER}
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:H20"/>
  <sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>
    <col min="1" max="1" width="20" customWidth="1"/>
    <col min="2" max="2" width="14" customWidth="1"/>
    <col min="3" max="3" width="17" customWidth="1"/>
    <col min="4" max="8" width="15" customWidth="1"/>
  </cols>
  <sheetData>${sheetRows.join('')}</sheetData>
  <mergeCells count="16">
    <mergeCell ref="A1:H1"/><mergeCell ref="A2:H2"/>
    <mergeCell ref="A4:D4"/><mergeCell ref="E4:H4"/>
    <mergeCell ref="A5:D6"/><mergeCell ref="E5:H6"/>
    <mergeCell ref="A8:H8"/><mergeCell ref="A9:H11"/>
    <mergeCell ref="A13:H13"/><mergeCell ref="D14:H14"/>
    <mergeCell ref="D15:H15"/><mergeCell ref="D16:H16"/>
    <mergeCell ref="D17:H17"/><mergeCell ref="D18:H18"/>
    <mergeCell ref="D19:H19"/><mergeCell ref="D20:H20"/>
  </mergeCells>
  <pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/>
</worksheet>`;
}

function stylesXml(): string {
  const font = (options: {
    size?: number;
    bold?: boolean;
    italic?: boolean;
    color?: string;
  }) => `<font><sz val="${options.size ?? 10}"/><name val="Arial"/>${
    options.bold ? '<b/>' : ''
  }${options.italic ? '<i/>' : ''}<color rgb="FF${
    options.color ?? '111827'
  }"/></font>`;
  const fill = (color: string) =>
    `<fill><patternFill patternType="solid"><fgColor rgb="FF${color}"/><bgColor indexed="64"/></patternFill></fill>`;
  const xf = (
    fontId: number,
    fillId: number,
    borderId: number,
    numFmtId = 0,
    alignment = ''
  ) => `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyFont="1" applyFill="1" applyBorder="1"${
    numFmtId ? ' applyNumberFormat="1"' : ''
  }${alignment ? ' applyAlignment="1"' : ''}>${
    alignment ? `<alignment ${alignment}/>` : ''
  }</xf>`;

  const fonts = [
    font({ size: 10 }),
    font({ size: 18, bold: true, color: 'FFFFFF' }),
    font({ size: 10, color: '475569' }),
    font({ size: 9, bold: true, color: '64748B' }),
    font({ size: 16, bold: true }),
    font({ size: 10, color: '1F2937' }),
    font({ size: 10, bold: true, color: 'FFFFFF' }),
    font({ size: 9, bold: true, color: '334155' }),
    font({ size: 10, bold: true, color: 'FFFFFF' }),
    font({ size: 10, bold: true, color: '166534' }),
    font({ size: 9, bold: true, color: 'FFFFFF' }),
    font({ size: 10, bold: true }),
  ];
  const fills = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    fill('182DA8'),
    fill('EEF2FF'),
    fill('F8FAFC'),
    fill('F1F5F9'),
    fill('E2E8F0'),
    fill('ECFDF5'),
    fill('FF4E00'),
    fill('FF915F'),
    fill('182DA8'),
    fill('0F766E'),
    fill('64748B'),
    fill('FFFFFF'),
  ];
  const borders = [
    '<border><left/><right/><top/><bottom/><diagonal/></border>',
    '<border><left style="thin"><color rgb="FFD1D5DB"/></left><right style="thin"><color rgb="FFD1D5DB"/></right><top style="thin"><color rgb="FFD1D5DB"/></top><bottom style="thin"><color rgb="FFD1D5DB"/></bottom><diagonal/></border>',
    '<border><left/><right/><top/><bottom style="thin"><color rgb="FFE2E8F0"/></bottom><diagonal/></border>',
    '<border><left/><right/><top style="medium"><color rgb="FF16A34A"/></top><bottom style="thin"><color rgb="FF86EFAC"/></bottom><diagonal/></border>',
  ];
  const cellXfs = [
    xf(0, 0, 0),
    xf(1, 2, 0, 0, 'horizontal="left" vertical="center"'),
    xf(2, 3, 2, 0, 'horizontal="left" vertical="center"'),
    xf(3, 4, 1, 0, 'horizontal="center" vertical="center"'),
    xf(4, 13, 1, 164, 'horizontal="center" vertical="center"'),
    xf(4, 13, 1, 165, 'horizontal="center" vertical="center"'),
    xf(6, 2, 0, 0, 'horizontal="left" vertical="center"'),
    xf(3, 5, 0, 0, 'horizontal="left" vertical="center"'),
    xf(5, 13, 1, 0, 'horizontal="left" vertical="top" wrapText="1"'),
    xf(7, 6, 2, 0, 'horizontal="left" vertical="center"'),
    xf(8, 8, 2, 0, 'horizontal="left" vertical="center"'),
    xf(8, 9, 2, 0, 'horizontal="left" vertical="center"'),
    xf(8, 10, 2, 0, 'horizontal="left" vertical="center"'),
    xf(8, 11, 2, 0, 'horizontal="left" vertical="center"'),
    xf(8, 12, 2, 0, 'horizontal="left" vertical="center"'),
    xf(11, 13, 2, 166, 'horizontal="right" vertical="center"'),
    xf(5, 13, 2, 164, 'horizontal="right" vertical="center"'),
    xf(5, 13, 2, 0, 'horizontal="left" vertical="top" wrapText="1"'),
    xf(9, 7, 3, 0, 'horizontal="left" vertical="center"'),
    xf(9, 7, 3, 166, 'horizontal="right" vertical="center"'),
    xf(9, 7, 3, 164, 'horizontal="right" vertical="center"'),
    xf(10, 2, 1, 0, 'horizontal="center" vertical="center" wrapText="1"'),
    xf(5, 13, 2, 0, 'horizontal="left" vertical="top" wrapText="1"'),
    xf(5, 13, 2, 167, 'horizontal="right" vertical="top"'),
    xf(5, 13, 2, 168, 'horizontal="right" vertical="top"'),
    xf(5, 13, 2, 169, 'horizontal="left" vertical="top"'),
    xf(5, 13, 2, 0, 'horizontal="left" vertical="top"'),
    xf(4, 13, 1, 167, 'horizontal="center" vertical="center"'),
    xf(11, 13, 2, 0, 'horizontal="left" vertical="top" wrapText="1"'),
    xf(9, 7, 3, 165, 'horizontal="right" vertical="center"'),
  ];

  return `${XML_HEADER}
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="6">
    <numFmt numFmtId="164" formatCode="0.0,,&quot; млн ₽&quot;"/>
    <numFmt numFmtId="165" formatCode="0.0&quot; FTE&quot;"/>
    <numFmt numFmtId="166" formatCode="0%"/>
    <numFmt numFmtId="167" formatCode="#,##0"/>
    <numFmt numFmtId="168" formatCode="0.0"/>
    <numFmt numFmtId="169" formatCode="yyyy-mm-dd hh:mm"/>
  </numFmts>
  <fonts count="${fonts.length}">${fonts.join('')}</fonts>
  <fills count="${fills.length}">${fills.join('')}</fills>
  <borders count="${borders.length}">${borders.join('')}</borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="${cellXfs.length}">${cellXfs.join('')}</cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;
}

function teamSheetNames(
  teams: LocationAllocationScenarioTeam[]
): string[] {
  const used = new Set(['сводка']);
  return teams.map((team) => {
    const raw = team.name
      .trim()
      .replace(/[\\/?*:[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^'+|'+$/g, '') || 'Команда';
    let suffix = '';
    let candidate = raw.slice(0, 31);
    let copy = 2;
    while (used.has(candidate.toLocaleLowerCase('ru'))) {
      suffix = ` (${copy})`;
      candidate = `${raw.slice(0, 31 - suffix.length)}${suffix}`;
      copy += 1;
    }
    used.add(candidate.toLocaleLowerCase('ru'));
    return candidate;
  });
}

function workbookEntries(
  unit: string,
  inputTeams: LocationAllocationScenarioTeam[],
  exportDate: Date
): Array<{ name: string; data: Uint8Array }> {
  const teams = sortedTeams(inputTeams);
  const teamNames = teamSheetNames(teams);
  const sheets = [
    {
      name: 'Сводка',
      xml: summarySheetXml(unit, teams, exportDate),
    },
    ...teams.map((team, index) => ({
      name: teamNames[index],
      xml: teamSheetXml(
        team,
        allocationRows(team),
        exportDate,
        SUMMARY_START_ROW + index
      ),
    })),
  ];
  const createdAt = exportDate.toISOString();
  const sheetOverrides = sheets
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('');
  const workbookSheets = sheets
    .map(
      (sheet, index) =>
        `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
    )
    .join('');
  const workbookRelationships = [
    ...sheets.map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
    ),
    `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
  ].join('');
  const titles = sheets
    .map((sheet) => `<vt:lpstr>${escapeXml(sheet.name)}</vt:lpstr>`)
    .join('');
  const files: Record<string, string> = {
    '[Content_Types].xml': `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheetOverrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
    '_rels/.rels': `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    'docProps/app.xml': `${XML_HEADER}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Product Portfolio</Application><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${sheets.length}</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="${sheets.length}" baseType="lpstr">${titles}</vt:vector></TitlesOfParts></Properties>`,
    'docProps/core.xml': `${XML_HEADER}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(unit)} — аллокации 2026</dc:title><dc:creator>Product Portfolio</dc:creator><cp:lastModifiedBy>Product Portfolio</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:modified></cp:coreProperties>`,
    'xl/workbook.xml': `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${workbookSheets}</sheets><calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`,
    'xl/_rels/workbook.xml.rels': `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRelationships}</Relationships>`,
    'xl/styles.xml': stylesXml(),
  };
  sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = sheet.xml;
  });
  return Object.entries(files).map(([name, value]) => ({
    name,
    data: textEncoder.encode(value),
  }));
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let current = index;
  for (let bit = 0; bit < 8; bit += 1) {
    current = (current & 1) !== 0 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
  }
  return current >>> 0;
});

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(value: Date): { date: number; time: number } {
  const year = Math.max(1980, value.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate(),
    time:
      (value.getHours() << 11) |
      (value.getMinutes() << 5) |
      Math.floor(value.getSeconds() / 2),
  };
}

function concatenate(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function zip(entries: Array<{ name: string; data: Uint8Array }>, now: Date): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  const { date, time } = dosDateTime(now);
  let localOffset = 0;

  for (const entry of entries) {
    const name = textEncoder.encode(entry.name);
    const checksum = crc32(entry.data);
    const localHeader = new Uint8Array(30 + name.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, time, true);
    localView.setUint16(12, date, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, entry.data.length, true);
    localView.setUint32(22, entry.data.length, true);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(name, 30);
    localParts.push(localHeader, entry.data);

    const centralHeader = new Uint8Array(46 + name.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, date, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, entry.data.length, true);
    centralView.setUint32(24, entry.data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, localOffset, true);
    centralHeader.set(name, 46);
    centralParts.push(centralHeader);
    localOffset += localHeader.length + entry.data.length;
  }

  const localData = concatenate(localParts);
  const centralData = concatenate(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralData.length, true);
  endView.setUint32(16, localData.length, true);
  endView.setUint16(20, 0, true);
  return concatenate([localData, centralData, end]);
}

export function buildAllocationScenarioUnitWorkbook(
  unit: string,
  teams: LocationAllocationScenarioTeam[],
  exportDate = new Date()
): Uint8Array {
  if (teams.length === 0) {
    throw new Error('В юните нет команд для выгрузки.');
  }

  return zip(workbookEntries(unit, teams, exportDate), exportDate);
}

export function allocationScenarioUnitWorkbookFilename(
  unit: string,
  exportDate = new Date()
): string {
  return `${normalizedEntityName(unit)}_аллокации_${isoDateOnly(exportDate)}.xlsx`;
}

export function downloadAllocationScenarioUnitWorkbook(
  unit: string,
  teams: LocationAllocationScenarioTeam[],
  exportDate = new Date()
): void {
  const bytes = buildAllocationScenarioUnitWorkbook(unit, teams, exportDate);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  const blob = new Blob([buffer], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = allocationScenarioUnitWorkbookFilename(unit, exportDate);
  anchor.click();
  URL.revokeObjectURL(url);
}
