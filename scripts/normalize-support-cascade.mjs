/**
 * One-time script: normalize support cascade in Supabase initiatives.
 * For each row, if any quarter has support=true, sets support=true for that quarter
 * and all following quarters (by key order), then updates the row if changed.
 *
 * Run from project root:
 *   node --env-file=.env scripts/normalize-support-cascade.mjs
 * (Node 20+ loads .env from --env-file. On older Node, set VITE_SUPABASE_* in the shell.)
 *
 * Requires: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY in .env
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(url, key);

function sortedQuarters(quarterlyData) {
  return Object.keys(quarterlyData || {}).sort();
}

function normalizeQuarterlySupport(quarterlyData) {
  if (!quarterlyData || typeof quarterlyData !== 'object') return quarterlyData;
  const quarters = sortedQuarters(quarterlyData);
  const firstSupportIdx = quarters.findIndex((q) => quarterlyData[q]?.support === true);
  if (firstSupportIdx === -1) return quarterlyData;

  const out = { ...quarterlyData };
  for (let i = firstSupportIdx; i < quarters.length; i++) {
    const q = quarters[i];
    out[q] = { ...(out[q] || {}), support: true };
  }
  return out;
}

function deepEqualQuarterly(a, b) {
  const qs = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const q of qs) {
    const va = a?.[q];
    const vb = b?.[q];
    if (va?.support !== vb?.support) return false;
  }
  return true;
}

async function main() {
  console.log('Fetching initiatives...');
  const { data: rows, error: fetchError } = await supabase
    .from('initiatives')
    .select('id, initiative, quarterly_data');

  if (fetchError) {
    console.error('Fetch failed:', fetchError.message);
    process.exit(1);
  }

  if (!rows?.length) {
    console.log('No initiatives found.');
    return;
  }

  let updated = 0;
  for (const row of rows) {
    const original = row.quarterly_data;
    const normalized = normalizeQuarterlySupport(original);
    if (deepEqualQuarterly(original, normalized)) continue;

    const { error: updateError } = await supabase
      .from('initiatives')
      .update({ quarterly_data: normalized })
      .eq('id', row.id);

    if (updateError) {
      console.error(`Failed to update "${row.initiative}" (${row.id}):`, updateError.message);
      continue;
    }
    updated++;
    console.log('Updated:', row.initiative);
  }

  console.log(`Done. Updated ${updated} of ${rows.length} initiatives.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
