"use client";
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { type Incident, titleOf } from "./data";
import { Icon } from "./ui";
import { LiveMap } from "./live-map";

export function EvidenceMap(props: { incidents: Incident[]; selected?:string; onSelect:(id:string)=>void; demo:boolean; evidence?:boolean }) {
  return props.demo ? <DemoEvidenceMap {...props}/> : <LiveMap {...props}/>;
}

function DemoEvidenceMap({
  incidents,
  selected,
  onSelect,
  demo,
  evidence = false,
}: {
  incidents: Incident[];
  selected?: string;
  onSelect: (id: string) => void;
  demo: boolean;
  evidence?: boolean;
}) {
  const [zoom, setZoom] = useState(0);
  const [pan, setPan] = useState([0, 0]);
  const [tileError, setTileError] = useState(false);
  const center = incidents.find(i => i.location?.coordinates)?.location?.coordinates ?? [77.595, 12.975];
  const z = 13 + zoom;
  const mercator = (lng: number, lat: number) => [
    ((lng + 180) / 360) * 2 ** z,
    ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z,
  ];
  const base = mercator(center[0], center[1]);
  const origin = [base[0] + pan[0], base[1] + pan[1]];
  return (
    <div
      className={`evidence-map ${evidence ? "compact-map" : ""}`}
      aria-label={
        demo
          ? "Illustrative map of fictional stream areas"
          : "Map of approximate incident areas"
      }
    >
      {demo ? (
        <svg
          className="terrain"
          viewBox="0 0 1000 760"
          preserveAspectRatio="xMidYMid slice"
          role="img"
          aria-label="Fictional Millbrook stream, public trails and approximate observation areas"
        >
          <defs>
            <pattern
              id="grid"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M40 0H0V40"
                fill="none"
                stroke="#cdd8c6"
                strokeWidth=".5"
              />
            </pattern>
          </defs>
          <rect width="1000" height="760" fill="#e8ebdf" />
          <g
            transform={`translate(${pan[0] * 60} ${pan[1] * 60}) translate(500 380) scale(${1 + zoom * 0.2}) translate(-500 -380)`}
          >
            <path
              d="M0 0h360L290 145 390 250 210 400 0 380ZM1000 150 730 50 650 210 790 330 630 480 780 760h220Z"
              fill="#d0dec9"
            />
            <path
              d="M40 90 250 60 320 180 180 280 30 250ZM660 480 890 390 1020 610 930 750 720 690Z"
              fill="#c3d6bb"
            />
            <rect width="1000" height="760" fill="url(#grid)" />
            <g fill="none" stroke="#b8c9ae" strokeWidth="1.2" opacity=".7">
              {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                <path
                  key={n}
                  d={`M${-120 + n * 22} 70C350 ${-80 + n * 30} 140 ${260 + n * 20} 330 ${320 + n * 20}S600 460 530 ${800 + n * 20}M${730 + n * 20} -40C570 220 1060 220 790 430S${620 + n * 20} 710 850 850`}
                />
              ))}
            </g>
            <g fill="none" strokeLinecap="round">
              <path
                d="M-30 580 290 420 580 480 1000 260M160 0 280 250 480 310 690 760M0 210 310 180 710 210 1040 150"
                stroke="#d0cabc"
                strokeWidth="13"
              />
              <path
                d="M-30 580 290 420 580 480 1000 260M160 0 280 250 480 310 690 760M0 210 310 180 710 210 1040 150"
                stroke="#faf8ef"
                strokeWidth="9"
              />
              <path
                d="M540 -50C390 140 700 160 565 305S290 355 440 480 700 610 505 800"
                stroke="#87b7bc"
                strokeWidth="36"
              />
              <path
                d="M540 -50C390 140 700 160 565 305S290 355 440 480 700 610 505 800"
                stroke="#acd0ce"
                strokeWidth="27"
              />
              <path
                d="M595 0C430 170 785 180 620 330S350 410 500 500 780 650 600 790"
                stroke="#9b9b7a"
                strokeWidth="2"
                strokeDasharray="6 7"
              />
              <path d="m390 328 180 80" stroke="#a99f89" strokeWidth="12" />
              <path d="m390 328 180 80" stroke="#eee8d8" strokeWidth="7" />
            </g>
            <g
              fill="#71816d"
              fontFamily="Arial, sans-serif"
              fontSize="13"
              letterSpacing="2"
            >
              <text x="145" y="140">
                CEDAR WOODLAND
              </text>
              <text x="700" y="540">
                WILLOW PARK
              </text>
              <text x="165" y="650">
                MILLBROOK
              </text>
              <text x="630" y="180" fontSize="11">
                NORTH TRAIL
              </text>
              <text x="300" y="300" fontSize="11">
                FOOTBRIDGE
              </text>
              <text
                x="535"
                y="670"
                fill="#47808a"
                transform="rotate(-25 535 670)"
              >
                Millbrook stream
              </text>
            </g>
          </g>
        </svg>
      ) : (
        <div className="tile-layer">
          {Array.from({ length: 25 }, (_, n) => {
            const x = Math.floor(origin[0]) + (n % 5) - 2,
              y = Math.floor(origin[1]) + Math.floor(n / 5) - 2;
            return (
              <img
                key={`${z}-${x}-${y}`}
                alt=""
                onError={() => setTileError(true)}
                src={`https://tile.openstreetmap.org/${z}/${x}/${y}.png`}
                style={{
                  left: `calc(50% + ${(x - origin[0]) * 256}px)`,
                  top: `calc(50% + ${(y - origin[1]) * 256}px)`,
                }}
              />
            );
          })}
        </div>
      )}
      <div className="map-title">
        <Icon name="map" size={16} />
        {demo ? "Millbrook catchment" : "Approximate incident areas"}
        <span>{demo ? "ILLUSTRATIVE MAP" : "PUBLIC VIEW"}</span>
      </div>
      {incidents.map((incident, index) => {
        const positions = [
          [49, 48],
          [66, 68],
          [55, 23],
        ];
        const point = incident.location?.coordinates;
        if (!demo && !point) return null;
        const stablePositions: Record<string, number[]> = {
          "demo-foam": [49, 48], "demo-upstream": [55, 23],
          "demo-litter": [66, 68], "demo-repeat": [66, 68],
          "demo-flow": [55, 23], "demo-comparison": [55, 23],
          "demo-1": [49, 48], "demo-2": [55, 23], "demo-3": [57, 72],
          "demo-4": [46, 48], "demo-5": [51, 51], "demo-6": [49, 45],
        };
        const position = stablePositions[incident.id] ?? positions[index % 3];
        const p = point ? mercator(point[0], point[1]) : base;
        const style = demo
          ? {
              left: `${50 + (position[0] - 50) * (1 + zoom * 0.2) + pan[0] * 6}%`,
              top: `${50 + (position[1] - 50) * (1 + zoom * 0.2) + pan[1] * 8}%`,
            }
          : {
              left: `calc(50% + ${(p[0] - origin[0]) * 256}px)`,
              top: `calc(50% + ${(p[1] - origin[1]) * 256}px)`,
            };
        return (
          <button
            style={style}
            key={incident.id}
            className={`map-marker ${selected === incident.id ? "selected" : ""} ${incident.evidence_status}`}
            onClick={() => onSelect(incident.id)}
            aria-label={`Open ${titleOf(incident)}, approximate area`}
            aria-pressed={selected === incident.id}
          >
            <Icon name={incident.category === "litter" ? "leaf" : "water"} />
            <span>{incident.category}</span>
          </button>
        );
      })}
      {evidence && demo && (
        <>
          <span className="map-evidence upstream">② Clear upstream</span>
          <span className="map-evidence downstream">③ Foam downstream</span>
        </>
      )}
      <div className="map-controls">
        <button
          aria-label="Zoom in"
          disabled={zoom >= 3}
          onClick={() => setZoom(zoom + 1)}
        >
          +
        </button>
        <button
          aria-label="Zoom out"
          disabled={zoom <= 0}
          onClick={() => setZoom(zoom - 1)}
        >
          −
        </button>
        <button
          aria-label="Pan north"
          onClick={() => setPan([pan[0], pan[1] - 1])}
        >
          ↑
        </button>
        <button
          aria-label="Pan west"
          onClick={() => setPan([pan[0] - 1, pan[1]])}
        >
          ←
        </button>
        <button
          aria-label="Pan east"
          onClick={() => setPan([pan[0] + 1, pan[1]])}
        >
          →
        </button>
        <button
          aria-label="Pan south"
          onClick={() => setPan([pan[0], pan[1] + 1])}
        >
          ↓
        </button>
        <button
          aria-label="Reset map"
          onClick={() => {
            setPan([0, 0]);
            setZoom(0);
          }}
        >
          ⌖
        </button>
      </div>
      <div className="map-legend">
        <span className="dot" /> Approximate areas only{" "}
        <span className="map-scale">{demo ? "Not to scale" : `Zoom ${z}`}</span>
      </div>
      <div className="map-attribution">
        {demo ? (
          "Fictional geography · exact locations are private"
        ) : (
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            © OpenStreetMap contributors
          </a>
        )}
      </div>
      {tileError && (
        <div className="map-error" role="status">
          Map tiles unavailable. Use the investigation list to explore evidence.
        </div>
      )}
    </div>
  );
}
