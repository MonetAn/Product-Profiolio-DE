import { forwardRef, useImperativeHandle, useRef } from 'react';

export type ManagementSheetFakeHandle = {
  scrollToFot: () => void;
  scrollToTop: () => void;
};

const cell = (n: number, negative?: boolean): string => {
  const abs = Math.abs(n);
  const s = new Intl.NumberFormat('ru-RU').format(abs);
  if (negative || n < 0) return `(${s})`;
  return s;
};

type RowKind =
  | 'plain'
  | 'ebitda'
  | 'ebitdaAlloc'
  | 'capex'
  | 'capexSub'
  | 'spacer'
  | 'allocTotal'
  | 'income'
  | 'incomeSub'
  | 'expense'
  | 'expenseSub'
  | 'russiaHeader'
  | 'divider'
  | 'region';

const ROW_STYLES: Record<
  RowKind,
  { bg: string; fontWeight?: number; indent?: number; borderBottom?: string; fontSize?: number; color?: string }
> = {
  plain: { bg: '#fff' },
  ebitda: { bg: '#cfe2f3', fontWeight: 700 },
  ebitdaAlloc: { bg: '#9fc5e8', fontWeight: 700 },
  capex: { bg: '#e8daf8', fontWeight: 700 },
  capexSub: { bg: '#fff', indent: 16, fontSize: 12, color: '#5f6368' },
  spacer: { bg: '#fff', borderBottom: '1px solid #e0e0e0' },
  allocTotal: { bg: '#fce8ee', fontWeight: 700 },
  income: { bg: '#e6f4ea', fontWeight: 700 },
  incomeSub: { bg: '#fff', indent: 16, fontSize: 12 },
  expense: { bg: '#fce8d8', fontWeight: 700 },
  expenseSub: { bg: '#fff' },
  russiaHeader: { bg: '#1f4e79', fontWeight: 600, color: '#fff' },
  divider: { bg: '#e8eaed', borderBottom: '3px solid #bdc1c6' },
  region: { bg: '#fff', fontSize: 12, color: '#3c4043' },
};

type Row = {
  kind: RowKind;
  label: string;
  jan?: string;
  feb?: string;
  mar?: string;
};

/** Фрагмент отчёта вокруг блока аллокаций (данные как в CSV Russia). */
const ROWS: Row[] = [
  { kind: 'ebitda', label: 'EBITDA', jan: cell(389_842_360), feb: cell(434_574_150), mar: '—' },
  { kind: 'ebitdaAlloc', label: 'EBITDA с аллокациями', jan: cell(192_930_090), feb: cell(244_519_634), mar: '—' },
  { kind: 'spacer', label: '' },
  { kind: 'capex', label: 'Капитальные вложения', jan: cell(48_754, true), feb: cell(277_404), mar: cell(3_097_438, true) },
  {
    kind: 'capexSub',
    label: 'Dodo Pizza.Russia.Commissary',
    jan: cell(179_255, true),
    feb: cell(219_470),
    mar: cell(3_097_438, true),
  },
  { kind: 'capexSub', label: 'Dodo Pizza.Customer Support', jan: '0', feb: '0', mar: '0' },
  { kind: 'spacer', label: '' },
  { kind: 'russiaHeader', label: 'Russia', jan: 'Jan 26', feb: 'Feb 26', mar: 'Mar 26' },
  {
    kind: 'allocTotal',
    label: 'Всего аллоцировано',
    jan: cell(192_599_236, true),
    feb: cell(196_912_270, true),
    mar: cell(190_054_516, true),
  },
  { kind: 'income', label: 'Доходы', jan: cell(603_760), feb: cell(89_833), mar: cell(87_830) },
  { kind: 'incomeSub', label: 'Роялти', jan: '0', feb: '0', mar: '0' },
  { kind: 'incomeSub', label: 'Услуги', jan: cell(603_760), feb: cell(89_833), mar: cell(87_830) },
  {
    kind: 'incomeSub',
    label: 'Доходы (Убытки) сопутствующего бизнеса',
    jan: '0',
    feb: '0',
    mar: '0',
  },
  {
    kind: 'expense',
    label: 'Расходы',
    jan: cell(193_202_996, true),
    feb: cell(197_002_104, true),
    mar: cell(190_142_346, true),
  },
  {
    kind: 'expenseSub',
    label: 'ФОТ',
    jan: cell(170_362_265, true),
    feb: cell(164_271_842, true),
    mar: cell(155_799_137, true),
  },
  {
    kind: 'expenseSub',
    label: 'Хостинг',
    jan: '0',
    feb: '0',
    mar: cell(30_811, true),
  },
  {
    kind: 'expenseSub',
    label: 'Программное обеспечение и лицензии',
    jan: cell(5_214_491, true),
    feb: cell(5_213_227, true),
    mar: cell(5_689_856, true),
  },
  {
    kind: 'expenseSub',
    label: 'Командировки',
    jan: cell(779_545, true),
    feb: cell(4_137_590, true),
    mar: cell(2_926_430, true),
  },
  {
    kind: 'expenseSub',
    label: 'Консалтинг и услуги',
    jan: cell(8_663_884, true),
    feb: cell(9_260_115, true),
    mar: cell(6_661_009, true),
  },
  {
    kind: 'expenseSub',
    label: 'Прочий ОРЕХ',
    jan: cell(8_182_811, true),
    feb: cell(14_119_330, true),
    mar: cell(19_035_103, true),
  },
  { kind: 'divider', label: '' },
  {
    kind: 'region',
    label: 'Dodo Brands.All countries',
    jan: cell(97_863_193, true),
    feb: cell(95_899_084, true),
    mar: cell(97_751_827, true),
  },
  {
    kind: 'region',
    label: 'Dodo Pizza.All countries',
    jan: cell(92_686_112, true),
    feb: cell(99_270_885, true),
    mar: cell(90_349_838, true),
  },
];

const FADE_MS = '1.15s';
const FADE_EASE = 'cubic-bezier(0.33, 1, 0.68, 1)';

export type ManagementSheetFakeProps = {
  fotRowId?: string;
  /** Подсветка строки ФОТ (переход в People Platform). */
  highlightFot?: boolean;
  /** Одновременно: плавный fade-out остальной сетки + шапки/вкладок; ФОТ поверх. */
  dimOverlay?: boolean;
};

const ManagementSheetFake = forwardRef<ManagementSheetFakeHandle, ManagementSheetFakeProps>(
  function ManagementSheetFake({ fotRowId = 'sheet-fot-row', highlightFot = false, dimOverlay = false }, ref) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const fotRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      scrollToFot: () => {
        fotRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      },
      scrollToTop: () => {
        scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      },
    }));

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          minHeight: 0,
          background: '#fff',
          borderRadius: 8,
          border: '1px solid #dadce0',
          boxShadow: '0 1px 2px rgba(60,64,67,0.3)',
          overflow: 'hidden',
        }}
      >
        {/* Упрощённый «хром» Google Sheets — гаснет вместе с «остальным» при dim */}
        <div
          style={{
            padding: '8px 12px',
            borderBottom: '1px solid #dadce0',
            background: '#f8f9fa',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexShrink: 0,
            opacity: dimOverlay ? 0.1 : 1,
            transition: `opacity ${FADE_MS} ${FADE_EASE}`,
          }}
        >
          <span style={{ fontSize: 18, color: '#188038' }}>▦</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#202124', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Управленческая отчетность Группы 2026
            </div>
            <div style={{ fontSize: 11, color: '#5f6368' }}>Лист: Russia (фрагмент)</div>
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              background: '#fdd663',
              color: '#202124',
              padding: '2px 8px',
              borderRadius: 4,
            }}
          >
            Confidential
          </span>
        </div>

        <div
          ref={scrollRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            position: 'relative',
          }}
        >
          <div style={{ minWidth: 640, padding: 8, position: 'relative', zIndex: 0 }}>
            {ROWS.map((row, idx) => {
              const st = ROW_STYLES[row.kind];
              const isFot = row.label === 'ФОТ';
              const fotLift = isFot && (highlightFot || dimOverlay);
              const restSoft = dimOverlay && !isFot;
              return (
                <div
                  key={idx}
                  ref={isFot ? fotRef : undefined}
                  id={isFot ? fotRowId : undefined}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '36px minmax(200px,1.4fr) repeat(3, minmax(100px, 1fr))',
                    columnGap: 4,
                    alignItems: 'stretch',
                    fontSize: st.fontSize ?? 13,
                    fontFamily: 'Arial, Roboto, sans-serif',
                    color: st.color ?? '#202124',
                    background: isFot && highlightFot ? '#fff9e6' : st.bg,
                    fontWeight: st.fontWeight ?? 400,
                    borderBottom: st.borderBottom ?? '1px solid #e8eaed',
                    minHeight: row.kind === 'spacer' ? 10 : 32,
                    position: fotLift ? 'relative' : undefined,
                    zIndex: fotLift ? 2 : undefined,
                    filter: restSoft ? 'blur(7px)' : undefined,
                    opacity: restSoft ? 0.38 : 1,
                    transform: restSoft ? 'scale(0.992)' : undefined,
                    boxShadow:
                      isFot && highlightFot
                        ? '0 0 0 2px #1967d2, 0 6px 20px rgba(25, 103, 210, 0.18)'
                        : undefined,
                    borderRadius: isFot && highlightFot ? 6 : undefined,
                    transition: `box-shadow 0.65s ${FADE_EASE}, background 0.65s ${FADE_EASE}, filter ${FADE_MS} ${FADE_EASE}, opacity ${FADE_MS} ${FADE_EASE}, transform ${FADE_MS} ${FADE_EASE}`,
                  }}
                >
                  <div
                    style={{
                      padding: '6px 4px',
                      textAlign: 'right',
                      color: '#5f6368',
                      fontSize: 11,
                      userSelect: 'none',
                    }}
                  >
                    {row.kind === 'spacer' || row.kind === 'divider' || row.kind === 'russiaHeader'
                      ? ''
                      : idx + 1}
                  </div>
                  <div
                    style={{
                      padding: '6px 8px',
                      paddingLeft: 8 + (st.indent ?? 0),
                      display: 'flex',
                      alignItems: 'center',
                      borderRight: '1px solid #f1f3f4',
                    }}
                  >
                    {row.label}
                  </div>
                  {['jan', 'feb', 'mar'].map((k) => (
                    <div
                      key={k}
                      style={{
                        padding: '6px 8px',
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                        borderRight: '1px solid #f1f3f4',
                      }}
                    >
                      {(row as Record<string, string | undefined>)[k] ?? ''}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Нижние «вкладки» */}
        <div
          style={{
            display: 'flex',
            gap: 0,
            borderTop: '1px solid #dadce0',
            background: '#fff',
            flexShrink: 0,
            overflowX: 'auto',
            padding: '4px 8px',
            opacity: dimOverlay ? 0.1 : 1,
            transition: `opacity ${FADE_MS} ${FADE_EASE}`,
          }}
        >
          {['Pizza', 'Domestic Region', 'International Region', 'Russia', 'Central Asia', 'Europe'].map((t) => (
            <div
              key={t}
              style={{
                padding: '6px 14px',
                fontSize: 12,
                borderRadius: 6,
                marginRight: 4,
                whiteSpace: 'nowrap',
                background: t === 'Russia' ? '#d3e3fd' : 'transparent',
                color: t === 'Russia' ? '#1967d2' : '#5f6368',
                fontWeight: t === 'Russia' ? 600 : 400,
                border: t === 'Russia' ? '1px solid #aecbfa' : '1px solid transparent',
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    );
  }
);

export default ManagementSheetFake;
