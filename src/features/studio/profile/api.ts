import { ApiError, getJson } from '@/lib/api/http';
import type { StudioProfile } from './types';

/** Studio profile API. Reads the static mock in public/api/v1/studio until the backend exists. */
export interface StudioApi {
  getProfile(slug: string, signal?: AbortSignal): Promise<StudioProfile | null>;
}

export function createStudioApi(baseUrl: string): StudioApi {
  const root = baseUrl.replace(/\/+$/, '');
  return {
    async getProfile(slug, signal) {
      if (!/^[a-z0-9-]+$/.test(slug)) return null;
      try {
        return await getJson<StudioProfile>(`${root}/studio/${slug}.json`, signal);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  };
}

export const studioApi = createStudioApi(import.meta.env.VITE_API_BASE_URL ?? '/api/v1');
