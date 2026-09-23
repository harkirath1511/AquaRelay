"use client";
import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { type Incident, titleOf } from "./data";
import { clusterPoints } from "./map-clusters";

export function LiveMap({
  incidents,
  selected,
  onSelect,
  evidence = false,
}: {
  incidents: Incident[];
  selected?: string;
  onSelect: (id: string) => void;
  evidence?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<Leaflet.Map | null>(null),
    library = useRef<typeof Leaflet | null>(null),
    group = useRef<Leaflet.LayerGroup | null>(null);
  const select = useRef(onSelect),
    records = useRef(incidents),
    activeSelection = useRef(selected);
  const [ready, setReady] = useState(false),
    [loading, setLoading] = useState(true),
    [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    select.current = onSelect;
    records.current = incidents;
    activeSelection.current = selected;
  }, [onSelect, incidents, selected]);
  useEffect(() => {
    let disposed = false;
    let resize: ResizeObserver | undefined;
    import("leaflet")
      .then((L) => {
        if (disposed || !host.current) return;
        library.current = L;
        const instance = L.map(host.current, {
          center: [20, 0],
          zoom: 2,
          scrollWheelZoom: true,
          keyboard: true,
          zoomControl: true,
        });
        map.current = instance;
        group.current = L.layerGroup().addTo(instance);
        const tiles = L.tileLayer(
          "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            maxZoom: 19,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
          },
        );
        tiles.on("loading", () => setLoading(true));
        tiles.on("load", () => setLoading(false));
        tiles.on("tileerror", () => {
          setFailed(true);
          setLoading(false);
        });
        tiles.addTo(instance);
        const points = records.current.flatMap((i) =>
          i.location?.coordinates
            ? [
                [i.location.coordinates[1], i.location.coordinates[0]] as [
                  number,
                  number,
                ],
              ]
            : [],
        );
        if (points.length)
          instance.fitBounds(L.latLngBounds(points), {
            padding: [45, 45],
            maxZoom: 14,
          });
        resize = new ResizeObserver(() => instance.invalidateSize());
        resize.observe(host.current);
        setReady(true);
      })
      .catch(() => {
        setFailed(true);
        setLoading(false);
      });
    return () => {
      disposed = true;
      resize?.disconnect();
      map.current?.remove();
      map.current = null;
      group.current = null;
    };
  }, [retry]);
  useEffect(() => {
    if (!ready || !map.current || !library.current || !group.current) return;
    const instance = map.current,
      L = library.current,
      layer = group.current;
    function render() {
      layer.clearLayers();
      const points = incidents.flatMap((i) => {
        const p = i.location?.coordinates;
        if (!p) return [];
        const pixel = instance.project([p[1], p[0]], instance.getZoom());
        return [{ id: i.id, x: pixel.x, y: pixel.y }];
      });
      for (const cluster of clusterPoints(points, 60)) {
        const items = cluster.ids.map(
          (id) => incidents.find((i) => i.id === id)!,
        );
        const coordinates = items.map((i) => i.location!.coordinates!);
        const lat = coordinates.reduce((n, p) => n + p[1], 0) / items.length,
          lng = coordinates.reduce((n, p) => n + p[0], 0) / items.length;
        if (items.length > 1) {
          const marker = L.marker([lat, lng], {
            icon: L.divIcon({
              className: "live-cluster",
              html: `<span>${items.length}</span>`,
              iconSize: [44, 44],
            }),
            title: `${items.length} investigations in this approximate area`,
            keyboard: true,
          }).addTo(layer);
          const list = document.createElement("div");
          list.className = "map-cluster-list";
          const heading = document.createElement("strong");
          heading.textContent = "Investigations in this approximate area";
          list.append(heading);
          for (const item of items) {
            const button = document.createElement("button");
            button.textContent = titleOf(item);
            button.onclick = () => select.current(item.id);
            list.append(button);
          }
          marker.bindPopup(list);
          marker.on("click", () => {
            if (instance.getZoom() < 16)
              instance.setView([lat, lng], instance.getZoom() + 2);
          });
        } else {
          const item = items[0];
          L.circle([lat, lng], {
            radius: 500,
            color: "#39765f",
            weight: 1,
            fillColor: "#80ad94",
            fillOpacity: 0.12,
            interactive: false,
          }).addTo(layer);
          const marker = L.marker([lat, lng], {
            icon: L.divIcon({
              className: `live-point ${selected === item.id ? "active" : ""}`,
              html: '<span aria-hidden="true">≈</span>',
              iconSize: [42, 42],
            }),
            title: `${titleOf(item)} · approximate area`,
            keyboard: true,
          }).addTo(layer);
          const tooltip = document.createElement("span");
          tooltip.textContent = titleOf(item);
          marker.bindTooltip(tooltip);
          marker.on("click", () => select.current(item.id));
        }
      }
    }
    render();
    instance.on("zoomend moveend", render);
    return () => {
      instance.off("zoomend moveend", render);
    };
  }, [incidents, selected, ready]);
  const located = incidents.filter((i) => i.location?.coordinates);
  return (
    <div className={`evidence-map live-map ${evidence ? "compact-map" : ""}`}>
      <div
        ref={host}
        className="leaflet-host"
        aria-label="Interactive map of approximate public locations"
      />
      {loading && (
        <div className="live-map-message" role="status">
          Loading map tiles…
        </div>
      )}
      {failed && (
        <div className="live-map-message warning" role="status">
          Map tiles unavailable. The list and evidence panels remain usable.
          <button
            onClick={() => {
              setFailed(false);
              setReady(false);
              setLoading(true);
              setRetry((n) => n + 1);
            }}
          >
            Retry map
          </button>
        </div>
      )}
      {!located.length && (
        <div className="map-empty">
          <h3>
            {incidents.length
              ? "No public map locations available"
              : "No live records in this view"}
          </h3>
          <p>
            {incidents.length
              ? "Use the list to inspect the available evidence."
              : "Widen your filters or submit a careful observation. Demo records are never substituted."}
          </p>
        </div>
      )}
      <div className="map-legend">
        Approximate public areas · no precise observation coordinates
      </div>
      <button
        className="map-fit"
        onClick={() => {
          const L = library.current;
          if (L && map.current && located.length)
            map.current.fitBounds(
              L.latLngBounds(
                located.map(
                  (i) =>
                    [
                      i.location!.coordinates![1],
                      i.location!.coordinates![0],
                    ] as [number, number],
                ),
              ),
              { padding: [45, 45], maxZoom: 14 },
            );
        }}
        disabled={!located.length}
      >
        Fit records
      </button>
    </div>
  );
}
