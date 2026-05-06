import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, Segmented, Typography } from 'antd';
import { motion } from 'framer-motion';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import ManagementSheetFake, { type ManagementSheetFakeHandle } from '@/components/mock/ManagementSheetFake';
import { PeoplePlatformBudgetTreemapMini } from '@/components/mock/PeoplePlatformBudgetTreemapMini';
import { PeoplePlatformLogo } from '@/components/mock/PeoplePlatformLogo';

const { Title, Text } = Typography;

/** Фиксированные суммы по строке ФОТ (квартал), ₽ — как в управленческой */
const MONTHS = [
  { key: 'jan', label: 'Январь 2026', short: 'Янв 26', total: 170_362_265 },
  { key: 'feb', label: 'Февраль 2026', short: 'Фев 26', total: 164_271_842 },
  { key: 'mar', label: 'Март 2026', short: 'Мар 26', total: 155_799_137 },
] as const;

const QUARTER_TOTAL = MONTHS.reduce((s, m) => s + m.total, 0);

const FN_SHARE = { IT: 0.4, HR: 0.23, RD: 0.15, SC: 0.22 } as const;

const IT_UNIT_KEYS = ['App&Web', 'B2B Pizza', 'Data Office', 'Tech Platform', 'Client Platform', 'FAP'] as const;
const IT_UNIT_SHARE: Record<(typeof IT_UNIT_KEYS)[number], number> = {
  'App&Web': 0.32,
  'B2B Pizza': 0.28,
  'Data Office': 0.2,
  'Tech Platform': 1 / 15,
  'Client Platform': 1 / 15,
  FAP: 1 / 15,
};

const FN_COLORS: Record<keyof typeof FN_SHARE, string> = {
  IT: '#1677FF',
  HR: '#13C2C2',
  RD: '#FAAD14',
  SC: '#52C41A',
};

const IT_UNIT_COLORS: Record<(typeof IT_UNIT_KEYS)[number], string> = {
  'App&Web': '#1677FF',
  'B2B Pizza': '#722ED1',
  'Data Office': '#FA8C16',
  'Tech Platform': '#2F54EB',
  'Client Platform': '#13C2C2',
  FAP: '#EB2F96',
};

const TEAM_MEMBERS = [
  {
    id: 'member-1',
    name: 'Русалочка',
    salaryRub: 100,
    imagePath: '/characters/pngwing.com%20(1).png',
  },
  {
    id: 'member-2',
    name: 'Шрек',
    salaryRub: 200,
    imagePath: '/characters/pngwing.com%20(2).png',
  },
  {
    id: 'member-3',
    name: 'Джерри',
    salaryRub: 300,
    imagePath: '/characters/pngwing.com%20(3).png',
  },
  {
    id: 'member-4',
    name: 'Карлсон',
    salaryRub: 400,
    imagePath: '/characters/pngwing.com%20(4).png',
  },
  {
    id: 'member-5',
    name: 'Донателло',
    salaryRub: 500,
    imagePath: '/characters/pngwing.com.png',
  },
] as const;

const TEAM_TOTAL_RUB = TEAM_MEMBERS.reduce((sum, m) => sum + m.salaryRub, 0);

const INITIATIVE_SPLIT = [
  { key: 'init-1', label: 'Спасение мира', percent: 50 },
  { key: 'init-2', label: 'Сниматься в мультиках', percent: 15 },
  { key: 'init-3', label: 'Говорить, что мультики раньше были лучше', percent: 5 },
  { key: 'support', label: 'Поддержка', percent: 30, isSupport: true },
] as const;

const INITIATIVE_ONE_COST_RUB = Math.round((TEAM_TOTAL_RUB * 50) / 100);

const MARKET_DRIVER_ROWS = [
  { market: 'Russia', countries: 'Россия', driverValue: 80 },
  { market: 'Drinkit', countries: 'Drinkit', driverValue: 14 },
  { market: 'Central Asia', countries: 'Казахстан, Узбекистан', driverValue: 60 },
  { market: 'MENA', countries: 'ОАЭ, Катар, Ирак, Морокко', driverValue: 22 },
  { market: 'Turkey', countries: 'Турция', driverValue: 19 },
  {
    market: 'Europe',
    countries:
      'Литва, Эстония, Румыния, Словения, Польша, Сербия, Кипр, Хорватия, Болгария, Монтенегро, Молдова, Испания, Беларусь',
    driverValue: 35,
  },
  {
    market: 'Other Countries',
    countries: 'Таджикистан, Грузия, Азербайджан, Нигерия, Кыргызстан, Армения, Индонезия',
    driverValue: 9,
  },
] as const;

function allocateByShares(total: number, entries: { key: string; share: number }[]): Record<string, number> {
  const s = entries.reduce((a, e) => a + e.share, 0);
  const scaled = entries.map((e) => ({ key: e.key, raw: (total * e.share) / s }));
  const floors = scaled.map((x) => Math.floor(x.raw));
  let rem = total - floors.reduce((a, b) => a + b, 0);
  const frac = scaled.map((x, i) => ({ i, f: x.raw - floors[i] }));
  frac.sort((a, b) => b.f - a.f);
  const out: Record<string, number> = {};
  entries.forEach((e, i) => {
    out[e.key] = floors[i];
  });
  for (let k = 0; k < rem; k++) {
    const i = frac[k % frac.length].i;
    out[entries[i].key] += 1;
  }
  return out;
}

function formatRub(n: number): string {
  return new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
}

/** Как в Google Sheets: расход в скобках без знака «−». */
function formatSheetParenRub(n: number): string {
  const s = new Intl.NumberFormat('ru-RU').format(Math.abs(n));
  return `(${s})`;
}

type StackMode = 'functions' | 'itUnits';

function usePrefersReducedMotion(): boolean {
  return useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);
}

/** Три месяца ФОТ — тот же вид в фокусе и на дашборде. */
function FotMonthValuesStrip() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 20,
        alignItems: 'stretch',
      }}
    >
      {MONTHS.map((m) => (
        <div
          key={m.key}
          style={{
            padding: '10px 12px',
            borderRadius: 10,
            background: 'rgba(0, 0, 0, 0.02)',
            border: '1px solid rgba(0, 0, 0, 0.06)',
          }}
        >
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginBottom: 6 }}>{m.short}</div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              color: 'rgba(0,0,0,0.88)',
            }}
          >
            {formatSheetParenRub(m.total)}
          </div>
        </div>
      ))}
    </div>
  );
}

function FotMonthHeaderCard() {
  return (
    <Card
      styles={{ body: { padding: '16px 20px' } }}
      style={{
        marginBottom: 0,
        borderRadius: 12,
        border: '1px solid rgba(22, 119, 255, 0.2)',
        background: 'linear-gradient(180deg, rgba(230, 244, 255, 0.65) 0%, #fff 100%)',
      }}
    >
      <FotMonthValuesStrip />
    </Card>
  );
}

function CharacterAvatar({ src, fallback }: { src: string; fallback: string }) {
  const [broken, setBroken] = useState(false);

  if (broken) {
    return (
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: 999,
          background: 'linear-gradient(135deg, rgba(22,119,255,0.22), rgba(114,46,209,0.18))',
          color: 'rgba(0,0,0,0.7)',
          fontWeight: 700,
          fontSize: 24,
          display: 'grid',
          placeItems: 'center',
          border: '1px solid rgba(0,0,0,0.08)',
        }}
      >
        {fallback}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      onError={() => setBroken(true)}
      style={{
        width: 80,
        height: 80,
        borderRadius: 16,
        objectFit: 'cover',
        background: '#fff',
        border: '1px solid rgba(0,0,0,0.08)',
      }}
    />
  );
}

function AllocationApproachScene({
  stage,
  reducedMotion,
  ease,
}: {
  stage: 1 | 2 | 3;
  reducedMotion: boolean;
  ease: readonly number[];
}) {
  const initiativeRows = INITIATIVE_SPLIT.map((i) => ({
    ...i,
    cost: Math.round((TEAM_TOTAL_RUB * i.percent) / 100),
  }));

  const teamShiftX = stage >= 2 ? -20 : 0;
  const showFirstInitiative = stage >= 2;
  const showAllInitiatives = stage >= 2;

  return (
    <div
      style={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '16px 24px 24px',
      }}
    >
      <Title level={2} style={{ margin: '0 0 20px', textAlign: 'center', fontSize: 30 }}>
        Команда IT
      </Title>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: stage === 1 ? '1fr' : 'minmax(520px, 1fr) minmax(440px, 0.95fr)',
          gap: 18,
          alignItems: 'center',
        }}
      >
        <motion.div
          initial={false}
          animate={{
            x: teamShiftX,
            transition: { duration: reducedMotion ? 0 : 0.72, ease },
          }}
          style={{
            justifySelf: stage === 1 ? 'center' : 'stretch',
            width: '100%',
            maxWidth: 760,
          }}
        >
          <Card
            styles={{ body: { padding: '18px 20px 16px' } }}
            style={{
              borderRadius: 16,
              border: '1px solid rgba(22,119,255,0.18)',
              boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
              background: 'linear-gradient(180deg, rgba(230,244,255,0.5) 0%, #fff 100%)',
            }}
          >
            <div
              style={{
                marginTop: 2,
                display: 'grid',
                gridTemplateColumns: 'repeat(5, minmax(86px, 1fr))',
                gap: 12,
              }}
            >
              {TEAM_MEMBERS.map((m, idx) => (
                <div key={m.id} style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <CharacterAvatar src={m.imagePath} fallback={String(idx + 1)} />
                  <Text style={{ display: 'block', marginTop: 8, fontSize: 12, color: 'rgba(0,0,0,0.6)' }}>{m.name}</Text>
                  <Text strong style={{ fontSize: 14 }}>
                    {formatRub(m.salaryRub)}
                  </Text>
                </div>
              ))}
            </div>
            <div
              style={{
                marginTop: 14,
                paddingTop: 12,
                borderTop: '1px dashed rgba(0,0,0,0.12)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 15, color: 'rgba(0,0,0,0.65)' }}>Итого стоимость подразделения</Text>
              <Text strong style={{ fontSize: 22 }}>
                {formatRub(TEAM_TOTAL_RUB)}
              </Text>
            </div>
          </Card>
        </motion.div>

        <motion.div
          initial={false}
          animate={{
            opacity: showFirstInitiative ? 1 : 0,
            x: showFirstInitiative ? 0 : 28,
            transition: { duration: reducedMotion ? 0 : 0.55, ease },
          }}
          style={{
            pointerEvents: showFirstInitiative ? 'auto' : 'none',
            minHeight: 0,
          }}
        >
          <Card
            styles={{ body: { padding: '18px 20px 18px' } }}
            style={{ borderRadius: 16, border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 8px 30px rgba(0,0,0,0.07)' }}
          >
            <Text type="secondary" style={{ display: 'block', marginBottom: 10, fontSize: 13 }}>
              Какой процент усилий мы тратим на инициативу?
            </Text>

            {showFirstInitiative ? (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid rgba(0,0,0,0.08)',
                  background: 'rgba(0,0,0,0.02)',
                  marginBottom: showAllInitiatives ? 12 : 0,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                  <Text strong>Спасение мира</Text>
                  <Text strong>50%</Text>
                </div>
                <Text style={{ display: 'block', marginTop: 8, fontSize: 14, color: 'rgba(0,0,0,0.72)' }}>
                  {formatRub(TEAM_TOTAL_RUB)} × 50% = <b>{formatRub(Math.round((TEAM_TOTAL_RUB * 50) / 100))}</b>
                </Text>
              </div>
            ) : null}

            {showAllInitiatives ? (
              <>
                <div style={{ display: 'grid', gap: 8 }}>
                  {initiativeRows.slice(1).map((row) => (
                    <div
                      key={row.key}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(0,0,0,0.08)',
                        background: row.isSupport ? 'rgba(250,173,20,0.14)' : 'rgba(0,0,0,0.02)',
                        display: 'grid',
                        gridTemplateColumns: '1fr auto',
                        gap: 10,
                        alignItems: 'center',
                      }}
                    >
                      <Text strong>{row.label}</Text>
                      <Text strong>{row.percent}%</Text>
                      <Text style={{ gridColumn: '1 / span 2', fontSize: 13, color: 'rgba(0,0,0,0.68)' }}>
                        {formatRub(TEAM_TOTAL_RUB)} × {row.percent}% = <b>{formatRub(row.cost)}</b>
                      </Text>
                    </div>
                  ))}
                </div>
                <Text strong style={{ display: 'block', marginTop: 12, fontSize: 14 }}>
                  Сумма усилий: 50% + 15% + 5% + 30% = 100%
                </Text>
              </>
            ) : null}
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

function InitiativeMarketAllocationScene({
  stage,
  reducedMotion,
  ease,
}: {
  stage: 1 | 2 | 3;
  reducedMotion: boolean;
  ease: readonly number[];
}) {
  const showDriver = stage >= 2;
  const showMarkets = stage >= 3;

  const marketCosts = useMemo(() => {
    const costs = allocateByShares(
      INITIATIVE_ONE_COST_RUB,
      MARKET_DRIVER_ROWS.map((r) => ({ key: r.market, share: r.driverValue }))
    );
    return MARKET_DRIVER_ROWS.map((r) => ({
      ...r,
      costRub: costs[r.market] ?? 0,
    }));
  }, []);

  return (
    <div
      style={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '16px 24px 24px',
      }}
    >
      <Title level={2} style={{ margin: '0 0 20px', textAlign: 'center', fontSize: 30 }}>
        Аллокация инициативы по рынкам
      </Title>

      <div style={{ display: 'grid', gap: 14, justifyItems: 'center' }}>
        <Card
          styles={{ body: { padding: '14px 18px' } }}
          style={{
            width: 'min(620px, 96%)',
            borderRadius: 14,
            border: '1px solid rgba(22,119,255,0.2)',
            background: 'rgba(230,244,255,0.55)',
          }}
        >
          <Text strong style={{ fontSize: 16 }}>
            Инициатива: Спасение мира
          </Text>
          <Text style={{ display: 'block', marginTop: 6, color: 'rgba(0,0,0,0.68)' }}>
            Стоимость инициативы: <b>{formatRub(INITIATIVE_ONE_COST_RUB)}</b>
          </Text>
        </Card>

        <motion.div
          initial={false}
          animate={{
            opacity: showDriver ? 1 : 0,
            y: showDriver ? 0 : -8,
            transition: { duration: reducedMotion ? 0 : 0.45, ease },
          }}
          style={{ pointerEvents: showDriver ? 'auto' : 'none', width: 'min(720px, 98%)' }}
        >
          <div style={{ textAlign: 'center', fontSize: 22, lineHeight: 1, color: 'rgba(0,0,0,0.55)' }}>↓</div>
          <Card
            styles={{ body: { padding: '14px 18px' } }}
            style={{ borderRadius: 14, border: '1px solid rgba(0,0,0,0.1)', marginTop: 10 }}
          >
            <Text strong style={{ fontSize: 16 }}>
              Драйвер: количество людей, которых спасаем
            </Text>
          </Card>
        </motion.div>

        <motion.div
          initial={false}
          animate={{
            opacity: showMarkets ? 1 : 0,
            y: showMarkets ? 0 : 10,
            transition: { duration: reducedMotion ? 0 : 0.55, ease },
          }}
          style={{ pointerEvents: showMarkets ? 'auto' : 'none', width: '100%' }}
        >
          <div style={{ textAlign: 'center', fontSize: 22, lineHeight: 1, color: 'rgba(0,0,0,0.55)', marginBottom: 8 }}>↓</div>
          <Card
            styles={{ body: { padding: '14px 16px' } }}
            style={{ borderRadius: 14, border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 8px 30px rgba(0,0,0,0.06)' }}
          >
            <div style={{ display: 'grid', gap: 8 }}>
              {marketCosts.map((row) => (
                <div
                  key={row.market}
                  style={{
                    borderRadius: 10,
                    border: '1px solid rgba(0,0,0,0.08)',
                    background: 'rgba(0,0,0,0.02)',
                    padding: '10px 12px',
                    display: 'grid',
                    gridTemplateColumns: 'minmax(220px, 1fr) auto auto',
                    gap: 10,
                    alignItems: 'start',
                  }}
                >
                  <div>
                    <Text strong style={{ display: 'block' }}>
                      {row.market}
                    </Text>
                    <Text style={{ fontSize: 12, color: 'rgba(0,0,0,0.56)' }}>{row.countries}</Text>
                  </div>
                    <Text style={{ whiteSpace: 'nowrap', fontSize: 13, color: 'rgba(0,0,0,0.72)' }}>
                      Драйвер (кол-во людей): <b>{row.driverValue}</b>
                    </Text>
                    <Text style={{ whiteSpace: 'nowrap', fontSize: 13, color: 'rgba(0,0,0,0.78)' }}>
                      Стоимость: <b>{formatRub(row.costRub)}</b>
                    </Text>
                </div>
              ))}
            </div>
            <Text style={{ display: 'block', marginTop: 12, fontSize: 13, color: 'rgba(0,0,0,0.68)' }}>
              Стоимость распределена пропорционально драйверу: сумма по рынкам = <b>{formatRub(INITIATIVE_ONE_COST_RUB)}</b>.
            </Text>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

/** Дашборд People Platform */
function AllocationsDashboardBody({ hideFotMonthCard = false }: { hideFotMonthCard?: boolean }) {
  const [stackMode, setStackMode] = useState<StackMode>('functions');

  const fnQuarterRub = useMemo(() => {
    return allocateByShares(QUARTER_TOTAL, [
      { key: 'IT', share: FN_SHARE.IT },
      { key: 'HR', share: FN_SHARE.HR },
      { key: 'RD', share: FN_SHARE.RD },
      { key: 'SC', share: FN_SHARE.SC },
    ]);
  }, []);

  const itQuarterTotal = fnQuarterRub.IT;

  const itPieData = useMemo(() => {
    const parts = allocateByShares(itQuarterTotal, [
      { key: 'App&Web', share: IT_UNIT_SHARE['App&Web'] },
      { key: 'B2B Pizza', share: IT_UNIT_SHARE['B2B Pizza'] },
      { key: 'Data Office', share: IT_UNIT_SHARE['Data Office'] },
      { key: 'Tech Platform', share: IT_UNIT_SHARE['Tech Platform'] },
      { key: 'Client Platform', share: IT_UNIT_SHARE['Client Platform'] },
      { key: 'FAP', share: IT_UNIT_SHARE.FAP },
    ]);
    return IT_UNIT_KEYS.map((name) => ({
      name,
      value: parts[name],
      fill: IT_UNIT_COLORS[name],
    }));
  }, [itQuarterTotal]);

  const fnPieData = useMemo(
    () => [
      { name: 'IT', value: fnQuarterRub.IT, fill: FN_COLORS.IT },
      { name: 'HR', value: fnQuarterRub.HR, fill: FN_COLORS.HR },
      { name: 'R&D', value: fnQuarterRub.RD, fill: FN_COLORS.RD },
      { name: 'Supply chain', value: fnQuarterRub.SC, fill: FN_COLORS.SC },
    ],
    [fnQuarterRub]
  );

  const monthRowsFunctions = useMemo(() => {
    return MONTHS.map((m) => {
      const parts = allocateByShares(m.total, [
        { key: 'IT', share: FN_SHARE.IT },
        { key: 'HR', share: FN_SHARE.HR },
        { key: 'RD', share: FN_SHARE.RD },
        { key: 'SC', share: FN_SHARE.SC },
      ]);
      return {
        monthLabel: m.label,
        IT: parts.IT,
        HR: parts.HR,
        RD: parts.RD,
        SC: parts.SC,
        total: m.total,
      };
    });
  }, []);

  const monthRowsItOnly = useMemo(() => {
    return MONTHS.map((m) => {
      const partsFn = allocateByShares(m.total, [
        { key: 'IT', share: FN_SHARE.IT },
        { key: 'HR', share: FN_SHARE.HR },
        { key: 'RD', share: FN_SHARE.RD },
        { key: 'SC', share: FN_SHARE.SC },
      ]);
      const itSlice = partsFn.IT;
      const sub = allocateByShares(itSlice, [
        { key: 'App&Web', share: IT_UNIT_SHARE['App&Web'] },
        { key: 'B2B Pizza', share: IT_UNIT_SHARE['B2B Pizza'] },
        { key: 'Data Office', share: IT_UNIT_SHARE['Data Office'] },
        { key: 'Tech Platform', share: IT_UNIT_SHARE['Tech Platform'] },
        { key: 'Client Platform', share: IT_UNIT_SHARE['Client Platform'] },
        { key: 'FAP', share: IT_UNIT_SHARE.FAP },
      ]);
      return {
        monthLabel: m.label,
        ...sub,
        total: itSlice,
        fullMonthTotal: m.total,
      };
    });
  }, []);

  const initiatives = useMemo(() => {
    const rows = [
      { name: 'Auth на .NET8', rub: 48_000_000 },
      { name: 'Популяризация Passkey', rub: 36_000_000 },
      { name: '2FA для пользователей с крит ролями', rub: 34_000_000 },
      { name: 'КБАМ — Web Monolith', rub: 27_000_000 },
      { name: 'КБАМ — UUId', rub: 21_000_000 },
      { name: 'Декомпозиция роли Root Administrator', rub: 12_000_000 },
    ];
    const fixed = rows.reduce((a, r) => a + r.rub, 0);
    const lastRub = itQuarterTotal - fixed;
    const withLast = [
      ...rows,
      { name: 'Автоматическая деактивация неиспользуемых учётных записей', rub: lastRub },
    ];
    return withLast.sort((a, b) => b.rub - a.rub);
  }, [itQuarterTotal]);

  const stackKeys =
    stackMode === 'functions'
      ? (['IT', 'HR', 'SC', 'RD'] as const)
      : ([...IT_UNIT_KEYS] as const);

  const stackColors: Record<string, string> =
    stackMode === 'functions'
      ? { HR: FN_COLORS.HR, IT: FN_COLORS.IT, RD: FN_COLORS.RD, SC: FN_COLORS.SC }
      : { ...IT_UNIT_COLORS };

  const barData = stackMode === 'functions' ? monthRowsFunctions : monthRowsItOnly;

  return (
    <>
      {!hideFotMonthCard ? (
        <div style={{ marginBottom: 16 }}>
          <FotMonthHeaderCard />
        </div>
      ) : null}

      <header
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          padding: '24px 0',
        }}
      >
        <Title level={1} style={{ margin: 0, fontSize: 38, fontWeight: 600, letterSpacing: 0.38 }}>
          Аллокации по рынкам
        </Title>
        <Text style={{ fontSize: 16, color: 'rgba(0,0,0,0.45)' }}>Кластер: Россия · квартал</Text>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'stretch' }}>
          <Card
            styles={{ body: { padding: '20px 24px 24px' } }}
            style={{ flex: '1 1 420px', borderRadius: 12, border: 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
          >
            <Title level={4} style={{ marginTop: 0, marginBottom: 16, fontSize: 20, fontWeight: 600 }}>
              По функциям (квартал)
            </Title>
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={fnPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={68}
                    outerRadius={110}
                    paddingAngle={1}
                  >
                    {fnPieData.map((e) => (
                      <Cell key={e.name} fill={e.fill} stroke="#fff" strokeWidth={1} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatRub(v)} contentStyle={{ borderRadius: 8, fontSize: 14 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ textAlign: 'center', marginTop: -36, position: 'relative', zIndex: 1 }}>
              <Text strong style={{ fontSize: 18, display: 'block', color: 'rgba(0,0,0,0.88)' }}>
                {formatRub(QUARTER_TOTAL)}
              </Text>
              <Text type="secondary" style={{ fontSize: 13 }}>
                всего за квартал
              </Text>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 20px', marginTop: 20, justifyContent: 'center' }}>
              {fnPieData.map((s) => (
                <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: s.fill }} />
                  <span style={{ color: 'rgba(0,0,0,0.88)' }}>{s.name}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card
            styles={{ body: { padding: '20px 24px 24px' } }}
            style={{ flex: '1 1 420px', borderRadius: 12, border: 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
          >
            <Title level={4} style={{ marginTop: 0, marginBottom: 16, fontSize: 20, fontWeight: 600 }}>
              IT: по юнитам (квартал)
            </Title>
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={itPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={68}
                    outerRadius={110}
                    paddingAngle={1}
                  >
                    {itPieData.map((e) => (
                      <Cell key={e.name} fill={e.fill} stroke="#fff" strokeWidth={1} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatRub(v)} contentStyle={{ borderRadius: 8, fontSize: 14 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ textAlign: 'center', marginTop: -36, position: 'relative', zIndex: 1 }}>
              <Text strong style={{ fontSize: 18, display: 'block', color: 'rgba(0,0,0,0.88)' }}>
                {formatRub(itQuarterTotal)}
              </Text>
              <Text type="secondary" style={{ fontSize: 13 }}>
                доля IT за квартал
              </Text>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 16px', marginTop: 20, justifyContent: 'center' }}>
              {itPieData.map((s) => (
                <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: s.fill }} />
                  <span style={{ color: 'rgba(0,0,0,0.88)' }}>{s.name}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card
          styles={{ body: { padding: '20px 24px 24px' } }}
          style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <Title level={4} style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
              По месяцам
            </Title>
            <Segmented
              value={stackMode}
              onChange={(v) => setStackMode(v as StackMode)}
              options={[
                { label: 'Все функции', value: 'functions' },
                { label: 'Только IT (юниты)', value: 'itUnits' },
              ]}
            />
          </div>
          {stackMode === 'itUnits' && (
            <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 14 }}>
              Полоса = доля IT в месяце; сегменты — распределение этой суммы по IT-юнитам (остальные функции в этом режиме
              не показаны).
            </Text>
          )}
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={barData} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                <XAxis type="number" tickFormatter={(n) => `${(n / 1e6).toFixed(0)} млн`} style={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="monthLabel" width={130} tick={{ fontSize: 13 }} />
                <Tooltip formatter={(v: number) => formatRub(v)} contentStyle={{ borderRadius: 8 }} />
                {stackKeys.map((k) => (
                  <Bar key={k} dataKey={k} stackId="a" fill={stackColors[k]} barSize={28} radius={[0, 4, 4, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 18px', marginTop: 8 }}>
            {stackKeys.map((k) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: stackColors[k] }} />
                <span style={{ color: 'rgba(0,0,0,0.88)' }}>
                  {k === 'RD' ? 'R&D' : k === 'SC' ? 'Supply chain' : k}
                </span>
              </div>
            ))}
          </div>
          {stackMode === 'functions' && (
            <Text type="secondary" style={{ marginTop: 12, display: 'block', fontSize: 13 }}>
              Итого по месяцам: {MONTHS.map((m) => `${m.label.split(' ')[0]} — ${formatRub(m.total)}`).join(' · ')}
            </Text>
          )}
        </Card>

        <Card
          styles={{ body: { padding: '20px 24px 24px' } }}
          style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
        >
          <Title level={4} style={{ marginTop: 0, marginBottom: 16, fontSize: 20, fontWeight: 600 }}>
            Инициативы IT за период (по убыванию стоимости)
          </Title>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {initiatives.map((row, idx) => (
              <li
                key={row.name}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 16,
                  padding: '14px 0',
                  borderBottom: idx < initiatives.length - 1 ? '1px solid rgba(0,0,0,0.06)' : undefined,
                }}
              >
                <Text style={{ fontSize: 15, color: 'rgba(0,0,0,0.88)', flex: 1 }}>{row.name}</Text>
                <Text strong style={{ fontSize: 15, whiteSpace: 'nowrap' }}>
                  {formatRub(row.rub)}
                </Text>
              </li>
            ))}
          </ul>
        </Card>

        <div style={{ marginTop: 28 }}>
          <Title level={3} style={{ marginBottom: 16, fontSize: 22, fontWeight: 600 }}>
            Бюджет по рынкам
          </Title>
          <Card
            styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', minHeight: 0 } }}
            style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', overflow: 'hidden' }}
          >
            <PeoplePlatformBudgetTreemapMini />
          </Card>
        </div>
      </div>
    </>
  );
}

/**
 * 0 — таблица;
 * 1 — фокус на ФОТ;
 * 2 — экран аллокаций;
 * 3 — подход к аллокации: команда;
 * 4 — все инициативы и поддержка с расчётами;
 * 5 — инициатива в центре;
 * 6 — добавлен драйвер;
 * 7 — распределение по рынкам с расчётом стоимости.
 */
type FlowStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export default function PeoplePlatformAllocationsMock() {
  const reducedMotion = usePrefersReducedMotion();
  const sheetRef = useRef<ManagementSheetFakeHandle>(null);
  const [step, setStep] = useState<FlowStep>(0);

  const fx = useMemo(
    () => ({
      fotHighlight: step === 1,
      dim: step === 1,
      sheetHidden: step >= 2,
      platformShown: step === 2,
    }),
    [step]
  );

  const advance = useCallback(() => {
    setStep((s) => {
      if (s >= 7) return s;
      if (s === 0) {
        sheetRef.current?.scrollToFot();
        return 1;
      }
      return (s + 1) as FlowStep;
    });
  }, []);

  const retreat = useCallback(() => {
    setStep((s) => {
      if (s === 0) return s;
      if (s === 1) {
        sheetRef.current?.scrollToTop();
        return 0;
      }
      return (s - 1) as FlowStep;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        advance();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        retreat();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance, retreat]);

  const ease = [0.25, 0.8, 0.25, 1] as const;

  const sheetPointer = step < 2;
  const platformPointer = step === 2;
  const approachPointer = step >= 3 && step <= 4;
  const marketAllocationPointer = step >= 5;
  const sidebarVisible = step >= 2;

  /** Пока таблица «снята», слой таблицы уходит под дашборд, иначе прозрачная таблица перекрывает контент. */
  const sheetZ = fx.sheetHidden ? 1 : 3;
  const platformZ = fx.platformShown ? 3 : 1;
  const approachZ = step >= 3 && step <= 4 ? 3 : 1;
  const marketAllocationZ = step >= 5 ? 3 : 1;

  return (
    <div
      style={{
        height: '100dvh',
        maxHeight: '100dvh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        background: '#F5F5F5',
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Segoe UI', sans-serif",
      }}
    >
      <div style={{ display: 'flex', flex: 1, minHeight: 0, alignItems: 'stretch' }}>
        <aside
          style={{
            width: 72,
            flexShrink: 0,
            background: 'rgba(0,0,0,0.02)',
            borderRight: '1px solid rgba(0,0,0,0.06)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: 16,
            gap: 8,
            /* Поверх слоёв таблицы/дашборда (absolute + z-index), иначе правая колонка рисуется поверх и «съедает» лого */
            position: 'relative',
            zIndex: 12,
          }}
        >
          <motion.div
            initial={false}
            animate={{
              opacity: sidebarVisible ? 1 : 0,
              y: sidebarVisible ? 0 : -6,
              transition: { duration: reducedMotion ? 0 : 0.42, ease },
            }}
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              pointerEvents: sidebarVisible ? 'auto' : 'none',
            }}
          >
            <div
              style={{
                flexShrink: 0,
                width: 40,
                height: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <PeoplePlatformLogo size={40} />
            </div>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: i === 0 ? 'rgba(0,0,0,0.08)' : 'transparent',
                }}
              />
            ))}
            <div style={{ flex: 1 }} />
            <div style={{ width: 44, height: 44, borderRadius: 10, marginBottom: 8 }} />
            <div style={{ width: 44, height: 44, borderRadius: 10, marginBottom: 16 }} />
          </motion.div>
        </aside>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          <div
            style={{
              padding: '12px 40px 0',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexShrink: 0,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <Title level={3} style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>
                {step < 2
                  ? 'Управленческая отчётность'
                  : step === 2
                    ? 'People Platform · аллокации'
                    : step <= 4
                      ? 'Подход к аллокации по инициативам'
                      : 'Аллокация инициативы по рынкам'}
              </Title>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }} />
          </div>

          {/* Только поверх таблицы (шаг 1); на дашборде (шаг 2) плашка внутри скролла — см. hideFotMonthCard */}
          {step === 1 ? (
            <div
              style={{
                padding: '0 40px 12px',
                flexShrink: 0,
                position: 'relative',
                zIndex: 6,
              }}
            >
              <FotMonthHeaderCard />
            </div>
          ) : null}

          <div style={{ flex: 1, minHeight: 0, padding: '12px 40px 24px', position: 'relative' }}>
            <motion.div
              initial={false}
              animate={{
                opacity: fx.sheetHidden ? 0 : 1,
                y: fx.sheetHidden ? -12 : 0,
                transition: { duration: reducedMotion ? 0 : 0.92, ease },
              }}
              style={{
                position: 'absolute',
                inset: 12,
                bottom: 24,
                zIndex: sheetZ,
                pointerEvents: sheetPointer ? 'auto' : 'none',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <ManagementSheetFake
                ref={sheetRef}
                highlightFot={fx.fotHighlight}
                dimOverlay={fx.dim && !fx.sheetHidden}
              />
            </motion.div>

            <motion.div
              initial={false}
              animate={{
                opacity: fx.platformShown ? 1 : 0,
                y: fx.platformShown ? 0 : 18,
                transition: {
                  duration: reducedMotion ? 0 : 0.88,
                  ease,
                  delay: fx.platformShown && !reducedMotion ? 0.08 : 0,
                },
              }}
              style={{
                position: 'absolute',
                inset: 12,
                bottom: 24,
                zIndex: platformZ,
                pointerEvents: platformPointer ? 'auto' : 'none',
                overflowY: 'auto',
                overflowX: 'hidden',
                WebkitOverflowScrolling: 'touch',
                paddingRight: 4,
              }}
            >
              <div style={{ maxWidth: 1320, margin: '0 auto' }}>
                <AllocationsDashboardBody hideFotMonthCard={step === 1} />
              </div>
            </motion.div>

            {step <= 4 ? (
              <motion.div
                initial={false}
                animate={{
                  opacity: step >= 3 ? 1 : 0,
                  y: step >= 3 ? 0 : 18,
                  transition: {
                    duration: reducedMotion ? 0 : 0.88,
                    ease,
                  },
                }}
                style={{
                  position: 'absolute',
                  inset: 12,
                  bottom: 24,
                  zIndex: approachZ,
                  pointerEvents: approachPointer ? 'auto' : 'none',
                  overflow: 'visible',
                }}
              >
                <AllocationApproachScene
                  stage={step >= 4 ? 3 : 1}
                  reducedMotion={reducedMotion}
                  ease={ease}
                />
              </motion.div>
            ) : null}

            <motion.div
              initial={false}
              animate={{
                opacity: step >= 5 ? 1 : 0,
                y: step >= 5 ? 0 : 18,
                transition: {
                  duration: reducedMotion ? 0 : 0.72,
                  ease,
                  delay: step >= 5 && !reducedMotion ? 0.2 : 0,
                },
              }}
              style={{
                position: 'absolute',
                inset: 12,
                bottom: 24,
                zIndex: marketAllocationZ,
                pointerEvents: marketAllocationPointer ? 'auto' : 'none',
                overflowY: 'auto',
                overflowX: 'hidden',
                WebkitOverflowScrolling: 'touch',
                paddingRight: 4,
              }}
            >
              <div style={{ maxWidth: 1320, margin: '0 auto' }}>
                <InitiativeMarketAllocationScene
                  stage={step >= 7 ? 3 : step === 6 ? 2 : 1}
                  reducedMotion={reducedMotion}
                  ease={ease}
                />
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
