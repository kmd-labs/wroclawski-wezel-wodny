import {
  Injectable,
  NgZone,
  effect,
  inject,
  signal,
  untracked
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import {
  GeoJSONSource,
  Map as MapLibreMap,
  setWorkerUrl
} from 'maplibre-gl';
import { SplashService, ThemeService, TooltipService } from '@kmd/design-system';
import {
  MAP_DEFAULT_ZOOM,
  MAP_MAX_ZOOM,
  MAP_MIN_ZOOM,
  SRC_CANALS,
  SRC_DEPRESSIONS,
  SRC_EMBANKMENTS,
  SRC_HISTORY_URBAN,
  SRC_INUNDATION,
  SRC_WEIRS,
  WROCLAW_BOUNDS,
  WROCLAW_CENTER
} from './map.config';
import {
  DynamicSourcesPayload,
  buildBaseWwwStyle,
  buildDynamicSources
} from './style.builder';
import { FloodWaterPlaneLayer } from './flood-plane.layer';
import { I18nService } from '../i18n/i18n.service';
import { AppStateService } from '../services/app-state.service';
import { HydrologyService } from '../services/hydrology.service';
import { VectorDataService } from '../services/vector-data.service';
import { HISTORY_ERAS } from '../data/www-events.data';
import { CANAL_SEGMENTS, DEPRESSED_ZONES, WEIR_NODES } from '../data/www-hydrology.data';
import { MapPinViewModel, WeirNode } from '../models/www.model';

const WORKER_ASSET_PATH = 'assets/maplibre/maplibre-gl-worker.mjs';
let workerConfigured = false;

export interface ProjectedWeirBadge {
  weir: WeirNode;
  x: number;
  y: number;
  visible: boolean;
  openingPct: number;
}

@Injectable({ providedIn: 'root' })
export class MapService {
  private readonly zone = inject(NgZone);
  private readonly theme = inject(ThemeService);
  private readonly i18n = inject(I18nService);
  private readonly state = inject(AppStateService);
  private readonly hydro = inject(HydrologyService);
  private readonly vectors = inject(VectorDataService);
  private readonly splash = inject(SplashService);
  private readonly tooltip = inject(TooltipService);
  private readonly sanitizer = inject(DomSanitizer);

  private map: MapLibreMap | null = null;
  private readonly styleLoaded = signal(false);
  private readonly floodPlaneLayer = new FloodWaterPlaneLayer();

  readonly mapReady = signal(false);
  readonly projectedPins = signal<MapPinViewModel[]>([]);
  readonly projectedWeirs = signal<ProjectedWeirBadge[]>([]);

  constructor() {
    // 1. Rebuild base MapLibre style ONLY when Theme or Language changes
    let lastTheme = this.theme.mode();
    let lastLang = this.i18n.lang();
    effect(() => {
      const mode = this.theme.mode();
      const lang = this.i18n.lang();
      const map = this.map;
      if (!map || !this.styleLoaded()) {
        lastTheme = mode;
        lastLang = lang;
        return;
      }
      if (mode === lastTheme && lang === lastLang) return;
      lastTheme = mode;
      lastLang = lang;

      const payload = untracked(() => this.computeDynamicSources());
      const style = untracked(() =>
        buildBaseWwwStyle(
          mode,
          lang,
          this.state.show3dBuildings(),
          this.state.currentView(),
          payload,
          (token, fallback) => this.theme.getTokenColor(token, fallback)
        )
      );
      untracked(() => {
        this.zone.runOutsideAngular(() => map.setStyle(style, { diff: true }));
      });
    });

    // 2. Patch GeoJSON sources in-place via `source.setData()` when LOD, hydrology, or timeline updates
    effect(() => {
      const payload = this.computeDynamicSources();
      const ready = this.styleLoaded();
      const map = this.map;
      if (!map || !ready) return;
      untracked(() => {
        this.zone.runOutsideAngular(() => this.applySourcesToMap(map, payload));
      });
    });

    // 3. Toggle 3D Buildings visibility without rebuilding style
    effect(() => {
      const visible = this.state.show3dBuildings() && this.state.currentView() !== 'history';
      const ready = this.styleLoaded();
      const map = this.map;
      if (!map || !ready) return;
      untracked(() => {
        this.zone.runOutsideAngular(() => {
          if (map.getLayer('buildings-3d')) {
            map.setLayoutProperty('buildings-3d', 'visibility', visible ? 'visible' : 'none');
          }
        });
      });
    });

    // 4. Camera framing when view changes
    let prevView = this.state.currentView();
    effect(() => {
      const view = this.state.currentView();
      const map = this.map;
      if (!map || !this.styleLoaded() || view === prevView) {
        prevView = view;
        return;
      }
      prevView = view;
      untracked(() => {
        this.zone.runOutsideAngular(() => {
          map.flyTo({
            center: WROCLAW_CENTER,
            zoom: MAP_DEFAULT_ZOOM,
            pitch: 0,
            bearing: 0,
            duration: 950
          });
        });
      });
    });

    // 5. Reproject DOM pins & weir badges whenever timeline/view/lang/gates change
    effect(() => {
      this.state.currentView();
      this.state.floodScenario();
      this.state.floodTimelineStep();
      this.state.historyYear();
      this.state.gateOpenings();
      this.i18n.lang();
      this.mapReady();
      untracked(() => this.updateProjections());
    });

    // 6. Keep clicked river segment or map flood-level tooltip live when timeline, gates, or language change
    effect(() => {
      const seg = this.state.selectedSegment();
      const floodPt = this.state.selectedFloodPoint();
      this.hydro.branchHydrology();
      this.hydro.floodPlaneState();
      this.i18n.lang();
      this.mapReady();
      untracked(() => {
        if (seg) this.updateSegmentTooltip();
        else if (floodPt) this.updateFloodPointTooltip();
        else this.tooltip.hide();
      });
    });

    // 7. Sync real-DEM 1:1 flood water plane upon failure
    effect(() => {
      const plane = this.hydro.floodPlaneState();
      const ready = this.styleLoaded();
      const map = this.map;
      if (!map || !ready) return;
      untracked(() => {
        this.zone.runOutsideAngular(() => {
          this.floodPlaneLayer.setFloodState(plane);
        });
      });
    });
  }

  init(container: HTMLElement): void {
    if (this.map) return;
    void this.initAsync(container);
  }

  private async ensureWorkerConfigured(): Promise<void> {
    if (workerConfigured) return;
    const workerAssetUrl = new URL(WORKER_ASSET_PATH, document.baseURI).href;

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      } catch {
        // ignore
      }
    }

    try {
      const resp = await fetch(workerAssetUrl, { cache: 'no-store' });
      if (resp.ok) {
        const code = (await resp.text()).replace(/\/\/#\s*sourceMappingURL=.*$/gm, '');
        const blobUrl = URL.createObjectURL(
          new Blob([code], { type: 'application/javascript' })
        );
        setWorkerUrl(blobUrl);
        workerConfigured = true;
        return;
      }
    } catch {
      // fall back to asset URL below
    }

    setWorkerUrl(workerAssetUrl);
    workerConfigured = true;
  }

  private async initAsync(container: HTMLElement): Promise<void> {
    await this.ensureWorkerConfigured();
    if (this.map) return;

    const initialPayload = untracked(() => this.computeDynamicSources());
    const initialStyle = untracked(() =>
      buildBaseWwwStyle(
        this.theme.mode(),
        this.i18n.lang(),
        this.state.show3dBuildings(),
        this.state.currentView(),
        initialPayload,
        (token, fallback) => this.theme.getTokenColor(token, fallback)
      )
    );

    const map = this.zone.runOutsideAngular(
      () =>
        new MapLibreMap({
          container,
          style: initialStyle,
          center: WROCLAW_CENTER,
          zoom: MAP_DEFAULT_ZOOM,
          pitch: 0,
          bearing: 0,
          minZoom: MAP_MIN_ZOOM,
          maxZoom: MAP_MAX_ZOOM,
          maxBounds: WROCLAW_BOUNDS,
          attributionControl: false,
          maplibreLogo: false
        })
    );

    map.on('style.load', () => {
      this.zone.run(() => {
        if (!map.getLayer(this.floodPlaneLayer.id)) {
          const beforeId = map.getLayer('canals-3d') ? 'canals-3d' : undefined;
          map.addLayer(this.floodPlaneLayer, beforeId);
        }
        const plane = untracked(() => this.hydro.floodPlaneState());
        this.floodPlaneLayer.setFloodState(plane);
        this.styleLoaded.set(true);
      });
    });

    map.once('load', () => {
      this.zone.run(() => {
        this.mapReady.set(true);
        this.splash.finish();
        this.syncCameraTelemetry(map);
        this.vectors.syncWithZoom(map.getZoom());
        this.updateProjections();
      });
    });

    map.on('move', () => {
      this.syncCameraTelemetry(map);
      this.updateProjections();
      if (this.state.selectedSegment()) {
        this.zone.run(() => this.updateSegmentTooltip());
      } else if (this.state.selectedFloodPoint()) {
        this.zone.run(() => this.updateFloodPointTooltip());
      }
    });
    map.on('zoomend', () => {
      this.zone.run(() => this.vectors.syncWithZoom(map.getZoom()));
    });
    map.on('resize', () => this.updateProjections());

    map.on('mouseenter', 'canals-3d', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'canals-3d', () => {
      map.getCanvas().style.cursor = '';
    });
    map.on('click', e => {
      const hits = map.queryRenderedFeatures(e.point, { layers: ['canals-3d'] });
      this.zone.run(() => {
        if (hits.length > 0) {
          const props = hits[0].properties ?? {};
          const segKey = String(props['segKey'] ?? '');
          const branchId = String(props['id'] ?? '');
          if (segKey && branchId) {
            this.state.selectedFloodPoint.set(null);
            this.state.selectedSegment.set({
              segKey,
              branchId,
              lngLat: [e.lngLat.lng, e.lngLat.lat]
            });
            this.updateSegmentTooltip();
            return;
          }
        }
        this.state.selectedSegment.set(null);
        this.state.selectedFloodPoint.set([e.lngLat.lng, e.lngLat.lat]);
        this.updateFloodPointTooltip();
      });
    });

    this.map = map;
  }

  clearSelectedSegment(): void {
    this.state.selectedSegment.set(null);
    this.state.selectedFloodPoint.set(null);
    this.tooltip.hide();
  }

  private updateFloodPointTooltip(): void {
    const map = this.map;
    const coords = this.state.selectedFloodPoint();
    if (!map || !coords) return;

    const pt = map.project(coords);
    const rect = map.getContainer().getBoundingClientRect();
    const sx = rect.left + pt.x;
    const sy = rect.top + pt.y;

    const lang = this.i18n.lang();
    const t = this.i18n.t();
    const info = this.hydro.inspectFloodAtLngLat(coords[0], coords[1]);
    const zoneMeta = info.zoneId ? DEPRESSED_ZONES.find(z => z.id === info.zoneId) : null;
    const title = zoneMeta
      ? (lang === 'pl' ? zoneMeta.namePl : zoneMeta.nameEn)
      : info.isFloodway
        ? t.floodPopupFloodway
        : t.floodPopupTitle;

    const waterText =
      info.waterMasl !== null
        ? `${info.waterMasl.toFixed(1)} m a.s.l.`
        : info.kind === 'protected' && this.hydro.floodPlaneState().active
          ? t.floodPopupProtected
          : info.kind === 'upland'
            ? t.floodPopupUpland
            : t.floodPopupDry;

    const depthText = info.depthM > 0 ? `+${info.depthM.toFixed(1)} m` : '0.0 m';

    const terrainSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="www-tooltip-col__icon www-tooltip-col__icon--cap"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>`;
    const waterSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="www-tooltip-col__icon www-tooltip-col__icon--water"><path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></svg>`;
    const depthSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="www-tooltip-col__icon www-tooltip-col__icon--load"><path d="M12 2v20"/><path d="m8 18 4 4 4-4"/><path d="m8 6 4-4 4 4"/></svg>`;

    const htmlString = `
      <div class="www-tooltip-col">
        <div class="www-tooltip-col__header">
          <span class="www-tooltip-col__title">${title}</span>
        </div>
        <div class="www-tooltip-col__divider"></div>
        <div class="www-tooltip-col__rows">
          <div class="www-tooltip-col__row">
            <div class="www-tooltip-col__label-group">
              ${terrainSvg}
              <span class="www-tooltip-col__label">${t.floodPopupGround}</span>
            </div>
            <span class="www-tooltip-col__val">${info.groundMasl.toFixed(1)} m</span>
          </div>
          <div class="www-tooltip-col__row">
            <div class="www-tooltip-col__label-group">
              ${waterSvg}
              <span class="www-tooltip-col__label">${t.floodPopupWaterLevel}</span>
            </div>
            <span class="www-tooltip-col__val ${info.depthM > 0 ? 'www-tooltip-col__val--overtop' : ''}">${waterText}</span>
          </div>
          <div class="www-tooltip-col__row">
            <div class="www-tooltip-col__label-group">
              ${depthSvg}
              <span class="www-tooltip-col__label">${t.floodPopupDepth}</span>
            </div>
            <span class="www-tooltip-col__val ${info.depthM > 0 ? 'www-tooltip-col__val--overtop' : ''}">${depthText}</span>
          </div>
        </div>
      </div>
    `.trim();

    const safeHtml = this.sanitizer.bypassSecurityTrustHtml(htmlString);
    this.tooltip.show(
      `${title}: ${depthText}`,
      sx,
      sy - 10,
      'top',
      0,
      {
        html: safeHtml,
        interactive: true,
        closable: true,
        onClose: () => this.clearSelectedSegment()
      }
    );
  }

  private updateSegmentTooltip(): void {
    const map = this.map;
    const sel = this.state.selectedSegment();
    if (!map || !sel) return;

    const pt = map.project(sel.lngLat);
    const rect = map.getContainer().getBoundingClientRect();
    const sx = rect.left + pt.x;
    const sy = rect.top + pt.y;

    const lang = this.i18n.lang();
    const t = this.i18n.t();
    const segMeta = CANAL_SEGMENTS.find(s => s.id === sel.branchId);
    const branchName = segMeta
      ? (lang === 'pl' ? segMeta.namePl : segMeta.nameEn)
      : sel.branchId;
    const hydro = this.hydro.branchHydrology()[sel.branchId];
    const flowQ = hydro?.flowM3s ?? 0;
    const maxCap = hydro?.maxCapacityM3s ?? segMeta?.maxCapacityM3s ?? 0;
    const loadPct = Math.round((hydro?.loadRatio ?? 0) * 100);
    const overtopped = hydro?.overtopped ?? false;

    const waterSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="www-tooltip-col__icon www-tooltip-col__icon--water"><path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></svg>`;
    const capSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="www-tooltip-col__icon www-tooltip-col__icon--cap"><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-5"/></svg>`;
    const loadSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="www-tooltip-col__icon www-tooltip-col__icon--load"><path d="M12 14l4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>`;

    const htmlString = `
      <div class="www-tooltip-col">
        <div class="www-tooltip-col__header">
          <span class="www-tooltip-col__title">${branchName}</span>
        </div>
        <div class="www-tooltip-col__divider"></div>
        <div class="www-tooltip-col__rows">
          <div class="www-tooltip-col__row">
            <div class="www-tooltip-col__label-group">
              ${waterSvg}
              <span class="www-tooltip-col__label">${t.dischargeLabel}</span>
            </div>
            <span class="www-tooltip-col__val">${flowQ} m³/s</span>
          </div>
          <div class="www-tooltip-col__row">
            <div class="www-tooltip-col__label-group">
              ${capSvg}
              <span class="www-tooltip-col__label">${t.segmentCapacity}</span>
            </div>
            <span class="www-tooltip-col__val">${maxCap} m³/s</span>
          </div>
          <div class="www-tooltip-col__row">
            <div class="www-tooltip-col__label-group">
              ${loadSvg}
              <span class="www-tooltip-col__label">${t.segmentLoad}</span>
            </div>
            <span class="www-tooltip-col__val ${overtopped ? 'www-tooltip-col__val--overtop' : ''}">${loadPct}%</span>
          </div>
        </div>
      </div>
    `.trim();

    const safeHtml = this.sanitizer.bypassSecurityTrustHtml(htmlString);
    this.tooltip.show(
      `${branchName}: ${flowQ} m³/s`,
      sx,
      sy - 10,
      'top',
      0,
      {
        html: safeHtml,
        interactive: true,
        closable: true,
        onClose: () => this.clearSelectedSegment()
      }
    );
  }

  // ─── Camera Controls (invoked from floating button above bottom timeline) ──

  setZoom(zoom: number): void {
    const clamped = Math.max(MAP_MIN_ZOOM, Math.min(MAP_MAX_ZOOM, zoom));
    this.zone.runOutsideAngular(() => {
      this.map?.easeTo({ zoom: clamped, duration: 220 });
    });
  }

  zoomBy(delta: number): void {
    if (!this.map) return;
    this.setZoom(this.map.getZoom() + delta);
  }

  setPitch(pitch: number): void {
    const clamped = Math.max(0, Math.min(68, pitch));
    this.zone.runOutsideAngular(() => {
      this.map?.easeTo({ pitch: clamped, duration: 260 });
    });
  }

  setBearing(bearing: number): void {
    this.zone.runOutsideAngular(() => {
      this.map?.easeTo({ bearing, duration: 260 });
    });
  }

  rotateBy(delta: number): void {
    if (!this.map) return;
    this.setBearing(this.map.getBearing() + delta);
  }

  resetNorth(): void {
    this.setBearing(0);
  }

  resetCamera(): void {
    this.zone.runOutsideAngular(() => {
      this.map?.flyTo({
        center: WROCLAW_CENTER,
        zoom: MAP_DEFAULT_ZOOM,
        pitch: 0,
        bearing: 0,
        duration: 650
      });
    });
  }

  flyTo(lngLat: [number, number], zoom = 14.2): void {
    if (!this.map) return;
    this.zone.runOutsideAngular(() => {
      this.map?.flyTo({ center: lngLat, zoom, duration: 750 });
    });
  }

  destroy(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    this.styleLoaded.set(false);
    this.mapReady.set(false);
  }

  private computeDynamicSources(): DynamicSourcesPayload {
    return buildDynamicSources({
      lang: this.i18n.lang(),
      view: this.state.currentView(),
      lod: this.vectors.activeLod(),
      riverScale: 5,
      bundle: this.vectors.loadedBundle(),
      show3dEmbankments: this.state.show3dEmbankments(),
      showDepressionZones: this.state.showDepressionZones(),
      branches: this.hydro.branchHydrology(),
      floodedZones: this.hydro.floodedZoneIds(),
      breachedEmbankments: this.hydro.breachedEmbankmentIds(),
      historyYear: this.state.historyYear(),
      selectedSegmentKey: this.state.selectedSegment()?.segKey ?? null
    });
  }

  private applySourcesToMap(map: MapLibreMap, payload: DynamicSourcesPayload): void {
    const entries: [string, GeoJSON.FeatureCollection][] = [
      [SRC_CANALS, payload.canals],
      [SRC_EMBANKMENTS, payload.embankments],
      [SRC_WEIRS, payload.weirs],
      [SRC_DEPRESSIONS, payload.depressions],
      [SRC_INUNDATION, payload.inundation],
      [SRC_HISTORY_URBAN, payload.historyUrban]
    ];
    for (const [id, data] of entries) {
      const src = map.getSource(id) as GeoJSONSource | undefined;
      if (src && typeof src.setData === 'function') {
        src.setData(data);
      }
    }
  }

  private syncCameraTelemetry(map: MapLibreMap): void {
    const z = Math.round(map.getZoom() * 10) / 10;
    const p = Math.round(map.getPitch());
    const b = Math.round(map.getBearing());
    this.zone.run(() => {
      if (this.state.cameraZoom() !== z) this.state.cameraZoom.set(z);
      if (this.state.cameraPitch() !== p) this.state.cameraPitch.set(p);
      if (this.state.cameraBearing() !== b) this.state.cameraBearing.set(b);
      this.vectors.syncWithZoom(z);
    });
  }

  private updateProjections(): void {
    const map = this.map;
    if (!map) return;

    const view = this.state.currentView();
    const lang = this.i18n.lang();
    const w = map.getContainer().clientWidth;
    const h = map.getContainer().clientHeight;

    const pins: MapPinViewModel[] = [];

    if (view === 'floods') {
      const scenario = this.hydro.activeFloodScenario();
      const step = this.state.floodTimelineStep();
      for (const p of scenario.pins) {
        const pt = map.project(p.lngLat);
        const reached = step >= p.step;
        pins.push({
          id: p.id,
          lngLat: p.lngLat,
          screenX: pt.x,
          screenY: pt.y,
          visible: pt.x >= -40 && pt.x <= w + 40 && pt.y >= -40 && pt.y <= h + 40,
          reached,
          opacity: reached ? 1.0 : 0.5,
          category: p.category,
          label: p.dateLabel,
          dateLabel: p.dateLabel,
          waterLevelCm: p.waterLevelCm,
          flowM3s: p.flowM3s,
          title: lang === 'pl' ? p.titlePl : p.titleEn,
          desc: lang === 'pl' ? p.descPl : p.descEn,
          sourceOutlet: p.sourceOutlet,
          sourceTitle: lang === 'pl' ? p.sourceTitlePl : p.sourceTitleEn,
          sourceUrl: p.sourceUrl
        });
      }
    } else if (view === 'history') {
      const yr = this.state.historyYear();
      for (const era of HISTORY_ERAS) {
        const pt = map.project(era.pin.lngLat);
        const reached = yr >= era.year;
        pins.push({
          id: era.pin.id,
          lngLat: era.pin.lngLat,
          screenX: pt.x,
          screenY: pt.y,
          visible: pt.x >= -40 && pt.x <= w + 40 && pt.y >= -40 && pt.y <= h + 40,
          reached,
          opacity: reached ? 1.0 : 0.5,
          category: 'milestone',
          label: String(era.year),
          dateLabel: String(era.year),
          flowM3s: era.capacityM3s,
          title: lang === 'pl' ? era.pin.titlePl : era.pin.titleEn,
          desc: lang === 'pl' ? era.pin.descPl : era.pin.descEn,
          sourceOutlet: era.pin.sourceOutlet,
          sourceTitle: lang === 'pl' ? era.labelPl : era.labelEn,
          sourceUrl: era.pin.sourceUrl
        });
      }
    }

    const weirs: ProjectedWeirBadge[] = [];
    if (view === 'equilibrium') {
      const openings = this.state.gateOpenings();
      for (const weir of WEIR_NODES) {
        if (!weir.controllable || !weir.gateId) continue;
        const pt = map.project(weir.lngLat);
        weirs.push({
          weir,
          x: pt.x,
          y: pt.y,
          visible: pt.x >= -40 && pt.x <= w + 40 && pt.y >= -40 && pt.y <= h + 40,
          openingPct: openings[weir.gateId]
        });
      }
    }

    this.zone.run(() => {
      this.projectedPins.set(pins);
      this.projectedWeirs.set(weirs);
    });
  }
}
