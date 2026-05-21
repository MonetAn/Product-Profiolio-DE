/** Личный превью-режим super_admin: динамический тремап только в этом браузере. */

const PERSONAL_STORAGE_KEY = 'portfolio:superAdminDynamicTreemapPersonal';

export const TREEMAP_PERSONAL_PREF_EVENT = 'portfolio:treemap-personal-pref-changed';

export const TREEMAP_GLOBAL_PREF_EVENT = 'portfolio:treemap-global-pref-changed';

export function readPersonalDynamicTreemap(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(PERSONAL_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writePersonalDynamicTreemap(value: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PERSONAL_STORAGE_KEY, value ? '1' : '0');
    window.dispatchEvent(new CustomEvent(TREEMAP_PERSONAL_PREF_EVENT));
  } catch {
    /* ignore */
  }
}
