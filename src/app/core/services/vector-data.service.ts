import { Injectable, computed, signal } from '@angular/core';
import type { Feature, FeatureCollection } from 'geojson';

export type LodLevel = 0 | 1 | 2;
export type LodMode = 'auto' | LodLevel;

export interface WwwLodBundle {
  lod: LodLevel;
  generatedAt: string;
  canals: FeatureCollection;
  embankments: FeatureCollection;
  weirs: FeatureCollection;
  depressions: FeatureCollection;
  silesia: FeatureCollection;
  silesiaRivers: FeatureCollection;
  historyUrban: Record<string, Feature>;
}

const LOD_PATHS: Record<LodLevel, string> = {
  0: 'assets/data/www-lod0.json',
  1: 'assets/data/www-lod1.json',
  2: 'assets/data/www-lod2.json'
};

/**
 * Dynamically loads and switches between 3 OSM vector precision tiers (LOD 0 / 1 / 2)
 * based on live map zoom level with hysteresis to prevent thrashing.
 */
@Injectable({ providedIn: 'root' })
export class VectorDataService {
  private readonly cache = new Map<LodLevel, WwwLodBundle>();
  private readonly inflight = new Map<LodLevel, Promise<WwwLodBundle | null>>();

  readonly lodMode = signal<LodMode>('auto');
  readonly activeLod = signal<LodLevel>(1);
  readonly loadedBundle = signal<WwwLodBundle | null>(null);
  readonly loadingLod = signal<LodLevel | null>(null);

  readonly activePrecisionLabel = computed(() => {
    const lod = this.activeLod();
    return lod === 2 ? 'LOD 2 (~1 m)' : lod === 1 ? 'LOD 1 (~9 m)' : 'LOD 0 (~55 m)';
  });

  constructor() {
    // Load city-scale LOD 1 immediately, plus lightweight LOD 0 in parallel
    void this.activateLod(1);
    void this.fetchLod(0);
  }

  /** Called by MapService as zoom changes; applies hysteresis to avoid LOD flicker. */
  syncWithZoom(zoom: number): void {
    const mode = this.lodMode();
    if (mode !== 'auto') {
      if (this.activeLod() !== mode || this.loadedBundle()?.lod !== mode) {
        void this.activateLod(mode);
      }
      return;
    }

    const current = this.activeLod();
    let target: LodLevel = current;

    if (current === 0) {
      if (zoom >= 11.3) target = zoom >= 13.9 ? 2 : 1;
    } else if (current === 1) {
      if (zoom < 10.7) target = 0;
      else if (zoom >= 13.8) target = 2;
      else if (zoom >= 13.0) void this.fetchLod(2); // warm-prefetch LOD 2 before crossing threshold
    } else {
      if (zoom < 10.7) target = 0;
      else if (zoom < 13.2) target = 1;
    }

    if (target !== current) {
      void this.activateLod(target);
    }
  }

  setLodMode(mode: LodMode, currentZoom: number): void {
    this.lodMode.set(mode);
    if (mode === 'auto') {
      const target: LodLevel = currentZoom >= 13.8 ? 2 : currentZoom >= 11.0 ? 1 : 0;
      void this.activateLod(target);
    } else {
      void this.activateLod(mode);
    }
  }

  private async activateLod(lod: LodLevel): Promise<void> {
    this.activeLod.set(lod);
    const cached = this.cache.get(lod);
    if (cached) {
      this.loadedBundle.set(cached);
      return;
    }
    this.loadingLod.set(lod);
    const fetched = await this.fetchLod(lod);
    if (this.loadingLod() === lod) {
      this.loadingLod.set(null);
    }
    if (fetched && this.activeLod() === lod) {
      this.loadedBundle.set(fetched);
    }
  }

  private fetchLod(lod: LodLevel): Promise<WwwLodBundle | null> {
    const cached = this.cache.get(lod);
    if (cached) return Promise.resolve(cached);
    const existing = this.inflight.get(lod);
    if (existing) return existing;

    const url = new URL(LOD_PATHS[lod], document.baseURI).href;
    const promise = fetch(url)
      .then(async res => {
        if (!res.ok) return null;
        const data = (await res.json()) as WwwLodBundle;
        this.cache.set(lod, data);
        return data;
      })
      .catch(() => null)
      .finally(() => {
        this.inflight.delete(lod);
      });

    this.inflight.set(lod, promise);
    return promise;
  }
}
