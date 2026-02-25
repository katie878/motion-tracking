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

type FileRecord = FileMetrics & {
  id: string;
  groupId: string;
  order: number;
};

type Group = {
  id: string;
  name: string;
};

const DEFAULT_FPS = 29.999;
const DEFAULT_GROUPS: Group[] = [
  { id: "select-group", name: "Select Group" },
  { id: "control", name: "Control" },
  { id: "hinge", name: "Hinge" },
  { id: "modular", name: "Modular" },
  { id: "manual-flex", name: "Manual Flex" }
];

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
  }

  for (const point of points) {
    const disp = distance(first, point);
    maxDisplacement = Math.max(maxDisplacement, disp);
  }

  const averageSpeed = durationSec > 0 ? totalPath / durationSec : 0;

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

const normalizeGroupOrders = (items: FileRecord[], groupId: string) => {
  const orderMap = new Map(
    items
      .filter((item) => item.groupId === groupId)
      .sort((a, b) => a.order - b.order)
      .map((item, index) => [item.id, index] as const)
  );

  return items.map((item) =>
    item.groupId === groupId
      ? { ...item, order: orderMap.get(item.id) ?? item.order }
      : item
  );
};

const makeId = (fileName: string, index: number) =>
  `${fileName}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;

export default function Home() {
  const [fps, setFps] = useState(DEFAULT_FPS);
  const [results, setResults] = useState<FileRecord[]>([]);
  const [groups] = useState<Group[]>(DEFAULT_GROUPS);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<keyof FileMetrics>("averageSpeed");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const groupSortIndex = useMemo(() => {
    return new Map(groups.map((group, index) => [group.id, index]));
  }, [groups]);

  const organizedFiles = useMemo(() => {
    return [...results].sort((a, b) => {
      const aGroup = groupSortIndex.get(a.groupId) ?? Number.MAX_SAFE_INTEGER;
      const bGroup = groupSortIndex.get(b.groupId) ?? Number.MAX_SAFE_INTEGER;
      if (aGroup !== bGroup) return aGroup - bGroup;
      return a.order - b.order;
    });
  }, [results, groupSortIndex]);

  const groupedTables = useMemo(() => {
    return groups
      .map((group) => {
        const items = results.filter((item) => item.groupId === group.id);
        const sorted = [...items].sort((a, b) => {
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
        const count = sorted.length;
        const averages =
          count === 0
            ? null
            : {
                points: sorted.reduce((sum, item) => sum + item.points, 0) / count,
                durationSec:
                  sorted.reduce((sum, item) => sum + item.durationSec, 0) / count,
                averageSpeed:
                  sorted.reduce((sum, item) => sum + item.averageSpeed, 0) / count,
                maxSpeed: sorted.reduce((sum, item) => sum + item.maxSpeed, 0) / count,
                maxDisplacement:
                  sorted.reduce((sum, item) => sum + item.maxDisplacement, 0) / count,
                totalPath: sorted.reduce((sum, item) => sum + item.totalPath, 0) / count,
                skipped: sorted.reduce((sum, item) => sum + item.skipped, 0) / count
              };
        return { ...group, items: sorted, averages };
      })
      .filter((group) => group.items.length > 0);
  }, [groups, results, sortKey, sortDir]);

  const groupSpeedStats = useMemo(() => {
    const rows = groups
      .filter((group) => group.id !== "select-group")
      .map((group) => {
      const items = results.filter((item) => item.groupId === group.id);
      const count = items.length;
      const averageSpeed =
        count > 0
          ? items.reduce((sum, item) => sum + item.averageSpeed, 0) / count
          : null;
      const maxSpeedAverage =
        count > 0
          ? items.reduce((sum, item) => sum + item.maxSpeed, 0) / count
          : null;
      const maxDisplacementAverage =
        count > 0
          ? items.reduce((sum, item) => sum + item.maxDisplacement, 0) / count
          : null;
      const totalPathAverage =
        count > 0
          ? items.reduce((sum, item) => sum + item.totalPath, 0) / count
          : null;
      return {
        id: group.id,
        name: group.name,
        count,
        averageSpeed,
        maxSpeedAverage,
        maxDisplacementAverage,
        totalPathAverage
      };
      });

    const maxAverageSpeed = Math.max(
      ...rows.map((row) => row.averageSpeed ?? 0),
      0
    );
    const maxMaxSpeedAverage = Math.max(
      ...rows.map((row) => row.maxSpeedAverage ?? 0),
      0
    );
    const maxDisplacementAverageMax = Math.max(
      ...rows.map((row) => row.maxDisplacementAverage ?? 0),
      0
    );
    const maxTotalPathAverage = Math.max(
      ...rows.map((row) => row.totalPathAverage ?? 0),
      0
    );

    return {
      rows,
      maxAverageSpeed,
      maxMaxSpeedAverage,
      maxDisplacementAverageMax,
      maxTotalPathAverage
    };
  }, [groups, results]);

  const toggleSort = (nextKey: keyof FileMetrics) => {
    if (nextKey === sortKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDir("desc");
  };

  const assignGroup = (fileId: string, groupId: string) => {
    setResults((prev) => {
      const target = prev.find((item) => item.id === fileId);
      if (!target || target.groupId === groupId) return prev;

      const destinationOrder = prev.filter((item) => item.groupId === groupId).length;
      let next = prev.map((item) =>
        item.id === fileId ? { ...item, groupId, order: destinationOrder } : item
      );
      next = normalizeGroupOrders(next, target.groupId);
      next = normalizeGroupOrders(next, groupId);
      return next;
    });
  };

  const clearAll = () => setResults([]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);

    if (!Number.isFinite(fps) || fps <= 0) {
      setError("FPS must be a positive number.");
      return;
    }

    setIsParsing(true);
    try {
      const incoming = Array.from(files);
      const parsed = await Promise.all(incoming.map((file) => parseFile(file, fps)));
      const defaultGroupId = groups[0]?.id ?? DEFAULT_GROUPS[0].id;
      setResults((prev) => {
        const offset = prev.filter((item) => item.groupId === defaultGroupId).length;
        const appended = parsed.map((item, index) => ({
          ...item,
          id: makeId(item.fileName, index),
          groupId: defaultGroupId,
          order: offset + index
        }));
        return [...prev, ...appended];
      });
    } catch {
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
            <h1>Motion Analysis for Face Tracking Coordinates</h1>
            <p className="subhead">
              Expected format: <span>frame x y z</span> per line. Baseline FPS is 29.999.
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
              Uploading more files appends to your current workspace. Use the organizer to
              reorder files and split them into groups.
            </p>
            {error ? <p className="error">{error}</p> : null}
          </div>
        </header>

        {results.length > 0 ? (
          <section className="organizer">
            <div className="organizer-header">
              <h2>File Organizer</h2>
              <button type="button" className="ghost-button" onClick={clearAll}>
                Clear All Files
              </button>
            </div>
            <div className="organizer-body">
              <div className="organizer-list">
                {organizedFiles.map((file) => {
                  return (
                    <div className="organizer-row" key={file.id}>
                      <div className="organizer-file">
                        <strong>{file.fileName}</strong>
                      </div>
                      <label>
                        Group
                        <select
                          value={file.groupId}
                          onChange={(event) => assignGroup(file.id, event.target.value)}
                        >
                          {groups.map((group) => (
                            <option key={group.id} value={group.id}>
                              {group.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  );
                })}
              </div>
              <aside className="speed-chart">
                <div className="speed-chart-box">
                  <div className="speed-chart-head">
                    <h3>Average Speed</h3>
                    <p>px/s</p>
                  </div>
                  <div className="speed-chart-list">
                    {groupSpeedStats.rows.map((row) => {
                      const width =
                        row.averageSpeed !== null && groupSpeedStats.maxAverageSpeed > 0
                          ? (row.averageSpeed / groupSpeedStats.maxAverageSpeed) * 100
                          : 0;
                      return (
                        <div key={row.id} className="speed-bar-row">
                          <div className="speed-bar-label">{row.name}</div>
                          <div className="speed-bar-track">
                            <div
                              className="speed-bar-fill"
                              style={{ width: `${width}%` }}
                            />
                          </div>
                          <div className="speed-bar-value">
                            {row.averageSpeed === null ? "—" : format(row.averageSpeed)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="speed-chart-box">
                  <div className="speed-chart-head">
                    <h3>Max Speed</h3>
                    <p>px/s</p>
                  </div>
                  <div className="speed-chart-list">
                    {groupSpeedStats.rows.map((row) => {
                      const width =
                        row.maxSpeedAverage !== null && groupSpeedStats.maxMaxSpeedAverage > 0
                          ? (row.maxSpeedAverage / groupSpeedStats.maxMaxSpeedAverage) * 100
                          : 0;
                      return (
                        <div key={`${row.id}-max`} className="speed-bar-row">
                          <div className="speed-bar-label">{row.name}</div>
                          <div className="speed-bar-track">
                            <div
                              className="speed-bar-fill"
                              style={{ width: `${width}%` }}
                            />
                          </div>
                          <div className="speed-bar-value">
                            {row.maxSpeedAverage === null ? "—" : format(row.maxSpeedAverage)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="speed-chart-box">
                  <div className="speed-chart-head">
                    <h3>Max Displacement</h3>
                    <p>px</p>
                  </div>
                  <div className="speed-chart-list">
                    {groupSpeedStats.rows.map((row) => {
                      const width =
                        row.maxDisplacementAverage !== null &&
                        groupSpeedStats.maxDisplacementAverageMax > 0
                          ? (row.maxDisplacementAverage /
                              groupSpeedStats.maxDisplacementAverageMax) *
                            100
                          : 0;
                      return (
                        <div key={`${row.id}-disp`} className="speed-bar-row">
                          <div className="speed-bar-label">{row.name}</div>
                          <div className="speed-bar-track">
                            <div
                              className="speed-bar-fill"
                              style={{ width: `${width}%` }}
                            />
                          </div>
                          <div className="speed-bar-value">
                            {row.maxDisplacementAverage === null
                              ? "—"
                              : format(row.maxDisplacementAverage)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="speed-chart-box">
                  <div className="speed-chart-head">
                    <h3>Total Path</h3>
                    <p>px</p>
                  </div>
                  <div className="speed-chart-list">
                    {groupSpeedStats.rows.map((row) => {
                      const width =
                        row.totalPathAverage !== null &&
                        groupSpeedStats.maxTotalPathAverage > 0
                          ? (row.totalPathAverage / groupSpeedStats.maxTotalPathAverage) * 100
                          : 0;
                      return (
                        <div key={`${row.id}-path`} className="speed-bar-row">
                          <div className="speed-bar-label">{row.name}</div>
                          <div className="speed-bar-track">
                            <div
                              className="speed-bar-fill"
                              style={{ width: `${width}%` }}
                            />
                          </div>
                          <div className="speed-bar-value">
                            {row.totalPathAverage === null ? "—" : format(row.totalPathAverage)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </aside>
            </div>
          </section>
        ) : null}

        <section className="results">
          <div className="results-header">
            <h2>Per-File Metrics</h2>
            <p>Click any column header to change sorting.</p>
          </div>

          {results.length === 0 ? (
            <div className="empty">Upload one or more txt files to see metrics here.</div>
          ) : (
            groupedTables.map((group) => (
              <div key={group.id} className="group-block">
                <div className="group-title">
                  <h3>{group.name}</h3>
                  <p>{group.items.length} file(s)</p>
                </div>
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
                      {group.items.map((item) => (
                        <tr key={item.id}>
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
                    {group.averages ? (
                      <tfoot>
                        <tr className="average-row">
                          <td className="file-cell">
                            <div>Group Average</div>
                            <span>{group.items.length} files</span>
                          </td>
                          <td>{format(group.averages.points)}</td>
                          <td>{format(group.averages.durationSec)}</td>
                          <td>{format(group.averages.averageSpeed)}</td>
                          <td>{format(group.averages.maxSpeed)}</td>
                          <td>{format(group.averages.maxDisplacement)}</td>
                          <td>{format(group.averages.totalPath)}</td>
                          <td>{format(group.averages.skipped)}</td>
                        </tr>
                      </tfoot>
                    ) : null}
                  </table>
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
