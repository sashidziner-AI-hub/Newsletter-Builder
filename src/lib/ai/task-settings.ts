/**
 * Per-task routing settings (6B): which provider/model each `AiTaskId` uses,
 * plus its own ordered fallback chain. This is the one thing `run-task.ts`
 * reads to decide what a given task's call actually hits.
 *
 * Deliberately not wired into `backup.ts`: this is routing configuration, not
 * a secret, but full-backup scope was fixed in 7A to brands/emails/blocks/
 * images/versions and this doesn't need to join that list to work correctly
 * — same precedent `email-defaults.ts` and `user.ts` already set. For the
 * same reason those two skip `writeSafe`, so does this: a routing record is
 * a few dozen bytes, not worth the quota-pruning machinery, and depending on
 * `storage.ts` here would risk a circular import the way it would for
 * `user.ts` (see that file's own note).
 */

import { AI_TASKS, ALL_TASK_IDS, type AiTaskId } from './tasks';
import { activeProvider, loadKey } from './key-store';

const STORAGE_KEY = 'email-builder:ai-task-routing:v1';
const SCHEMA_VERSION = 1;

export interface FallbackEntry {
  providerId: string;
  model: string;
}

export interface TaskRoute {
  providerId: string;
  model: string;
  options: Record<string, unknown>;
  fallbacks: FallbackEntry[];
}

export type TaskRoutes = Record<AiTaskId, TaskRoute>;

function defaultRoute(taskId: AiTaskId): TaskRoute {
  const def = AI_TASKS[taskId];
  return {
    providerId: def.defaultProviderId,
    model: def.defaultModel,
    options: { ...def.defaultOptions },
    fallbacks: [],
  };
}

function defaultRoutes(): TaskRoutes {
  const out = {} as TaskRoutes;
  for (const id of ALL_TASK_IDS) out[id] = defaultRoute(id);
  return out;
}

/**
 * The one-time transfer: seed `image.generate` from whatever the old single
 * "active provider/model" currently holds, so a 5A setup already configured
 * before 6B existed isn't lost. `text.brief` never read the key store's
 * model field, so it has nothing to migrate and just takes its coded
 * default. Only the provider id and model string move — `loadKey` is read
 * here for its `.model` field only, never its `.key`.
 */
function migratedDefaults(): TaskRoutes {
  const routes = defaultRoutes();
  const active = activeProvider();
  if (active) {
    const record = loadKey(active);
    if (record) {
      routes['image.generate'] = {
        ...routes['image.generate'],
        providerId: active,
        model: record.model || routes['image.generate'].model,
      };
    }
  }
  return routes;
}

function normalizeFallback(raw: unknown): FallbackEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.providerId !== 'string' || !r.providerId) return null;
  if (typeof r.model !== 'string' || !r.model) return null;
  return { providerId: r.providerId, model: r.model };
}

function normalizeRoute(raw: unknown, fallbackDefault: TaskRoute): TaskRoute {
  if (!raw || typeof raw !== 'object') return fallbackDefault;
  const r = raw as Record<string, unknown>;
  const fallbacks = Array.isArray(r.fallbacks)
    ? r.fallbacks.map(normalizeFallback).filter((f): f is FallbackEntry => !!f)
    : [];
  return {
    providerId: typeof r.providerId === 'string' && r.providerId ? r.providerId : fallbackDefault.providerId,
    model: typeof r.model === 'string' && r.model ? r.model : fallbackDefault.model,
    options:
      r.options && typeof r.options === 'object' && !Array.isArray(r.options)
        ? { ...fallbackDefault.options, ...r.options }
        : fallbackDefault.options,
    fallbacks,
  };
}

function write(routes: TaskRoutes): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ routes, schemaVersion: SCHEMA_VERSION }));
  } catch {
    // storage full or unavailable; the change just doesn't persist this session
  }
}

/**
 * On the very first call with nothing stored yet, this runs the migration
 * ONCE and persists the result immediately — so routing is a frozen snapshot
 * from that point on, not a live mirror of whatever `key-store.ts`'s active
 * provider happens to be later.
 */
export function loadTaskSettings(): TaskRoutes {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return defaultRoutes();
  }

  if (!raw) {
    const migrated = migratedDefaults();
    write(migrated);
    return migrated;
  }

  try {
    const parsed = JSON.parse(raw) as { routes?: Record<string, unknown> };
    const seed = defaultRoutes();
    const out = {} as TaskRoutes;
    for (const id of ALL_TASK_IDS) out[id] = normalizeRoute(parsed?.routes?.[id], seed[id]);
    return out;
  } catch {
    return defaultRoutes();
  }
}

export function saveTaskSettings(routes: TaskRoutes): void {
  write(routes);
}

export function setTaskRoute(taskId: AiTaskId, route: TaskRoute): void {
  const routes = loadTaskSettings();
  routes[taskId] = route;
  write(routes);
}

export function resetTaskSettings(): TaskRoutes {
  const routes = defaultRoutes();
  write(routes);
  return routes;
}

export const AI_TASK_ROUTING_STORAGE_KEY = STORAGE_KEY;
