import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Component, Dataset, Design } from './model';
import { markerAppearance } from './theme';
import 'leaflet/dist/leaflet.css';
type Place = Dataset['rows'][number];

export function MapView({ design, component, dataset, rows, selectedId, fitToken, onSelect }: {
  design: Design; component: Component; dataset: Dataset; rows: Place[]; selectedId: string | null; fitToken: number; onSelect: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);
  const lastFitToken = useRef(0);

  useEffect(() => {
    if (!host.current) return;
    const center = component.props.center as { lat?: number; lon?: number } | undefined;
    const instance = L.map(host.current, { zoomControl: true, attributionControl: false, dragging: true, scrollWheelZoom: true, minZoom: Number(component.props.minZoom ?? 3), maxZoom: Number(component.props.maxZoom ?? 19) })
      .setView([Number(center?.lat ?? 35.978), Number(center?.lon ?? 140.147)], Number(component.props.zoom ?? 14));
    L.control.attribution({ position: 'topright' }).addTo(instance);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxNativeZoom: 19, maxZoom: 20,
    }).addTo(instance);
    markers.current = L.layerGroup().addTo(instance);
    const observer = new ResizeObserver(() => instance.invalidateSize({ animate: false }));
    observer.observe(host.current);
    map.current = instance;
    return () => { observer.disconnect(); instance.remove(); map.current = null; markers.current = null; };
  }, [component.id]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    instance.setMinZoom(Number(component.props.minZoom ?? 3));
    instance.setMaxZoom(Number(component.props.maxZoom ?? 19));
    const center = component.props.center as { lat?: number; lon?: number } | undefined;
    if (center) instance.setView([Number(center.lat ?? 35.978), Number(center.lon ?? 140.147)], Number(component.props.zoom ?? 14), { animate: false });
    instance.invalidateSize({ animate: false });
  }, [component.props.center, component.props.zoom, component.props.minZoom, component.props.maxZoom]);

  useEffect(() => {
    if (!markers.current) return;
    markers.current.clearLayers();
    const latField = dataset.mapping.lat;
    const lonField = dataset.mapping.lon;
    const nameField = dataset.mapping.name;
    const colors = markerAppearance(design, component);
    for (const row of rows) {
      const lat = Number(row.values[latField]);
      const lon = Number(row.values[lonField]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const marker = L.circleMarker([lat, lon], {
        radius: row.id === selectedId ? 10 : 7,
        color: row.id === selectedId ? colors.selectedBorder : colors.normalBorder,
        fillColor: row.id === selectedId ? colors.selected : colors.normal,
        fillOpacity: .95, weight: 2,
      });
      marker.bindTooltip(String(row.values[nameField] ?? '地点'));
      marker.on('click', () => onSelect(row.id));
      marker.addTo(markers.current);
    }
  }, [dataset, rows, selectedId, onSelect, design, component]);

  const fitAll = () => {
    const latField = dataset.mapping.lat;
    const lonField = dataset.mapping.lon;
    const points = rows.map(row => [Number(row.values[latField]), Number(row.values[lonField])] as [number, number])
      .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
    if (points.length > 1) map.current?.fitBounds(L.latLngBounds(points).pad(.15));
    else if (points.length === 1) map.current?.setView(points[0], Math.max(15, Number(component.props.zoom) || 14));
  };

  useEffect(() => {
    if (fitToken && fitToken !== lastFitToken.current) {
      lastFitToken.current = fitToken;
      fitAll();
    }
  }, [fitToken, rows, dataset, component.props.zoom]);

  return <div className="map-shell">
    <div ref={host} className="map-host" aria-label="地点の地図" />
    <button className="map-fit" onClick={fitAll} disabled={!rows.some(row => Number.isFinite(Number(row.values[dataset.mapping.lat])) && Number.isFinite(Number(row.values[dataset.mapping.lon])))}>全地点を表示</button>
  </div>;
}

