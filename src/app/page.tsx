"use client";

import { useMemo, useState } from "react";

type ParsedPoint = {
  frame: number;
  x: number;
  y: number;
  z: number;
};

type FileMetrics = {
  fileName: string;
  points: number;
  skipped: number;
  durationSec: number;
  averageSpeed: number;
  maxSpeed: number;
  maxDisplacement: number;
  totalPath: number;
};

const DEFAULT_FPS = 29.999;

const distance = (a: ParsedPoint, b: ParsedPoint) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

const parseFile = async (file: File, fps: number): Promise<FileMetrics> => {
  const text = await file.text();
  const lines = text.split(/\r?\n/);
  const points: ParsedPoint[] = [];
  let skipped = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 4) {
      skipped += 1;
      continue;
    }
    const frame = Number(parts[0]);
    const x = Number(parts[1]);
    const y = Number(parts[2]);
    const z = Number(parts[3]);
    if ([frame, x, y, z].some((value) => Number.isNaN(value))) {
      skipped += 1;
      continue;
    }
    points.push({ frame, x, y, z });
  }

  if (points.length < 2) {
    return {
      fileName: file.name,
      points: points.length,
      skipped,
      durationSec: 0,
      averageSpeed: 0,
      maxSpeed: 0,
      maxDisplacement: 0,
      totalPath: 0
    };
  }

  let totalPath = 0;
  let maxSpeed = 0;
  let maxDisplacement = 0;
  let validSegments = 0;

  const first = points[0];
  const last = points[points.length - 1];
  const durationSec = Math.max(0, (last.frame - first.frame) / fps);

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const current = points[i];
    const deltaFrames = current.frame - prev.frame;
    if (deltaFrames <= 0) {
      skipped += 1;
      continue;
    }

    const segmentDistance = distance(prev, current);
    const segmentTime = deltaFrames / fps;
    const speed = segmentDistance / segmentTime;
    totalPath += segmentDistance;
    maxSpeed = Math.max(maxSpeed, speed);
    validSegments += 1;
  }

  for (const point of points) {
    const disp = distance(first, point);
    maxDisplacement = Math.max(maxDisplacement, disp);
  }

  const averageSpeed =
    durationSec > 0 ? totalPath / durationSec : 0;

  return {
    fileName: file.name,
    points: points.length,
    skipped,
    durationSec,
    averageSpeed,
    maxSpeed,
    maxDisplacement,
    totalPath
  };
};

export default function Home() {
  const [fps, setFps] = useState(DEFAULT_FPS);
  const [results, setResults] = useState<FileMetrics[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<keyof FileMetrics>("averageSpeed");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const combined = useMemo(() => {
    if (results.length === 0) return null;
    const totalPath = results.reduce((sum, item) => sum + item.totalPath, 0);
    const totalDuration = results.reduce((sum, item) => sum + item.durationSec, 0);
    const maxSpeed = Math.max(...results.map((item) => item.maxSpeed));
    const maxDisplacement = Math.max(...results.map((item) => item.maxDisplacement));
    const totalPoints = results.reduce((sum, item) => sum + item.points, 0);
    const totalSkipped = results.reduce((sum, item) => sum + item.skipped, 0);
    const averageSpeed = totalDuration > 0 ? totalPath / totalDuration : 0;
    return {
      totalPath,
      totalDuration,
      maxSpeed,
      maxDisplacement,
      totalPoints,
      totalSkipped,
      averageSpeed
    };
  }, [results]);

  const sortedResults = useMemo(() => {
    const copy = [...results];
    copy.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      return 0;
    });
    return copy;
  }, [results, sortKey, sortDir]);

  const toggleSort = (nextKey: keyof FileMetrics) => {
    if (nextKey === sortKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDir("desc");
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);

    if (!Number.isFinite(fps) || fps <= 0) {
      setError("FPS must be a positive number.");
      return;
    }

    setIsParsing(true);
    try {
      const parsed = await Promise.all(
        Array.from(files).map((file) => parseFile(file, fps))
      );
      setResults(parsed);
    } catch (err) {
      setError("Something went wrong while reading the files.");
    } finally {
      setIsParsing(false);
    }
  };

  const format = (value: number, digits = 3) => value.toFixed(digits);
  const sortArrow = (key: keyof FileMetrics) =>
    key === sortKey ? (sortDir === "asc" ? "↑" : "↓") : "↕";

  return (
    <main>
      <div className="shell">
        <header className="hero">
          <div>
            <p className="eyebrow">Face Motion Parser</p>
            <h1>Upload face tracking txt files and get movement metrics.</h1>
            <p className="subhead">
              Format: <span>frame x y z</span> per line. FPS defaults to 29.999.
            </p>
          </div>
          <div className="hero-card">
            <div className="hero-row">
              <span>FPS</span>
              <input
                type="number"
                step="0.001"
                value={fps}
                onChange={(event) => setFps(Number(event.target.value))}
              />
            </div>
            <label className="uploader">
              <input
                type="file"
                accept=".txt"
                multiple
                onChange={(event) => handleFiles(event.target.files)}
              />
              <span>{isParsing ? "Parsing..." : "Upload txt files"}</span>
            </label>
            <p className="note">
              We compute average speed, max speed, max displacement, and total path length
              in pixels and pixels per second.
            </p>
            {error ? <p className="error">{error}</p> : null}
          </div>
        </header>

        {combined ? (
          <section className="summary">
            <div className="summary-card">
              <h2>Combined Snapshot</h2>
              <div className="summary-grid">
                <div>
                  <span>Total Files</span>
                  <strong>{results.length}</strong>
                </div>
                <div>
                  <span>Total Points</span>
                  <strong>{combined.totalPoints}</strong>
                </div>
                <div>
                  <span>Total Duration</span>
                  <strong>{format(combined.totalDuration)} s</strong>
                </div>
                <div>
                  <span>Total Path</span>
                  <strong>{format(combined.totalPath)} px</strong>
                </div>
                <div>
                  <span>Avg Speed</span>
                  <strong>{format(combined.averageSpeed)} px/s</strong>
                </div>
                <div>
                  <span>Max Speed</span>
                  <strong>{format(combined.maxSpeed)} px/s</strong>
                </div>
                <div>
                  <span>Max Displacement</span>
                  <strong>{format(combined.maxDisplacement)} px</strong>
                </div>
                <div>
                  <span>Skipped Lines</span>
                  <strong>{combined.totalSkipped}</strong>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="results">
          <div className="results-header">
            <h2>Per-File Metrics</h2>
            <p>Click a column header to sort.</p>
          </div>

          {results.length === 0 ? (
            <div className="empty">
              Upload one or more txt files to see metrics here.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="compare-table">
                <thead>
                  <tr>
                    <th>
                      <button type="button" onClick={() => toggleSort("fileName")}>
                        File {sortArrow("fileName")}
                      </button>
                    </th>
                    <th>
                      <button type="button" onClick={() => toggleSort("points")}>
                        Points {sortArrow("points")}
                      </button>
                    </th>
                    <th>
                      <button type="button" onClick={() => toggleSort("durationSec")}>
                        Duration (s) {sortArrow("durationSec")}
                      </button>
                    </th>
                    <th>
                      <button type="button" onClick={() => toggleSort("averageSpeed")}>
                        Avg Speed (px/s) {sortArrow("averageSpeed")}
                      </button>
                    </th>
                    <th>
                      <button type="button" onClick={() => toggleSort("maxSpeed")}>
                        Max Speed (px/s) {sortArrow("maxSpeed")}
                      </button>
                    </th>
                    <th>
                      <button type="button" onClick={() => toggleSort("maxDisplacement")}>
                        Max Disp (px) {sortArrow("maxDisplacement")}
                      </button>
                    </th>
                    <th>
                      <button type="button" onClick={() => toggleSort("totalPath")}>
                        Total Path (px) {sortArrow("totalPath")}
                      </button>
                    </th>
                    <th>
                      <button type="button" onClick={() => toggleSort("skipped")}>
                        Skipped {sortArrow("skipped")}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedResults.map((item) => (
                    <tr key={item.fileName}>
                      <td className="file-cell">
                        <div>{item.fileName}</div>
                        <span>{item.points} points</span>
                      </td>
                      <td>{item.points}</td>
                      <td>{format(item.durationSec)}</td>
                      <td>{format(item.averageSpeed)}</td>
                      <td>{format(item.maxSpeed)}</td>
                      <td>{format(item.maxDisplacement)}</td>
                      <td>{format(item.totalPath)}</td>
                      <td>{item.skipped}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
