"""Offline Ontario vector map renderer for Power BI Python visuals.

The basemap and Great Lakes layers are read from local GeoJSON files and
rendered with Matplotlib. There are intentionally no web calls, map tiles, GIS
libraries, or projection conversions in this module.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Iterable

import matplotlib.pyplot as plt
from matplotlib.patches import PathPatch
from matplotlib.path import Path as MplPath
import numpy as np
import pandas as pd


REQUIRED_COLUMNS = [
    "LineID",
    "FromLatitude",
    "FromLongitude",
    "ToLatitude",
    "ToLongitude",
    "VoltageKV",
]

VIEW_CENTER_LONGITUDE_COLUMNS = ["MapCenterLongitude", "CenterLongitude", "CenterLon"]
VIEW_CENTER_LATITUDE_COLUMNS = ["MapCenterLatitude", "CenterLatitude", "CenterLat"]
VIEW_ZOOM_COLUMNS = ["MapZoom", "Zoom"]

DATA_DIR = Path(__file__).resolve().parent / "data"
DATA_PATH = DATA_DIR / "ontario.geojson"
LAKES_PATH = DATA_DIR / "great_lakes.geojson"


def render_ontario_map(
    df: pd.DataFrame | None = None,
    *,
    center_lon: float | None = None,
    center_lat: float | None = None,
    zoom: float | None = None,
    extent: tuple[float, float, float, float] | None = None,
):
    """Render Ontario and optional transmission line vectors.

    Parameters
    ----------
    df:
        Optional pandas DataFrame, including the special Power BI Python visual
        DataFrame named ``dataset``. Two valid coordinate pairs draw a line;
        a single pair draws a dot. Substation rows use diamond markers, with
        shared StationID values drawn once. ProjectNumber enables diagnostics.
        Optional Power BI view-control columns may also be included:
        MapCenterLongitude, MapCenterLatitude, and MapZoom.
    center_lon, center_lat:
        Optional map center in WGS84 longitude/latitude. If omitted, matching
        Power BI control columns are used when present; otherwise Ontario is
        centered automatically.
    zoom:
        Optional zoom factor. 1 shows full Ontario, 2 is twice as close, and 4
        is four times as close. If omitted, MapZoom/Zoom columns are used when
        present.
    extent:
        Optional exact viewport as (west, south, east, north). This overrides
        center and zoom.

    Returns
    -------
    tuple
        ``(fig, ax)`` from Matplotlib.
    """

    ontario_geojson = _load_geojson(DATA_PATH)
    lakes_geojson = _load_geojson(LAKES_PATH)
    bounds = _geojson_bounds(ontario_geojson)
    view_extent = _resolve_view_extent(
        bounds,
        df=df,
        center_lon=center_lon,
        center_lat=center_lat,
        zoom=zoom,
        extent=extent,
    )

    fig, ax = plt.subplots(figsize=(8, 9))
    fig.patch.set_facecolor("white")
    ax.set_facecolor("#f8fbff")

    _draw_ontario(ax, ontario_geojson)
    _draw_great_lakes(ax, lakes_geojson)
    _set_extent_and_aspect(ax, view_extent)
    _style_map_axes(ax)

    if df is not None:
        _draw_powerbi_lines(ax, df)

    fig.tight_layout(pad=0.2)
    return fig, ax


def _load_geojson(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _draw_ontario(ax, geojson: dict) -> None:
    _draw_geojson_polygons(
        ax,
        geojson,
        facecolor="#edf3ec",
        edgecolor="#4f6353",
        linewidth=0.9,
        alpha=1.0,
        zorder=1,
    )


def _draw_great_lakes(ax, geojson: dict) -> None:
    _draw_geojson_polygons(
        ax,
        geojson,
        facecolor="#8fc7df",
        edgecolor="#4f92b5",
        linewidth=0.6,
        alpha=0.9,
        zorder=2,
    )


def _draw_geojson_polygons(
    ax,
    geojson: dict,
    facecolor: str,
    edgecolor: str,
    linewidth: float,
    alpha: float,
    zorder: int,
) -> None:
    for feature in geojson.get("features", []):
        geometry = feature.get("geometry", {})
        for polygon in _iter_polygons(geometry):
            path = _polygon_to_path(polygon)
            if path is None:
                continue

            patch = PathPatch(
                path,
                facecolor=facecolor,
                edgecolor=edgecolor,
                linewidth=linewidth,
                alpha=alpha,
                joinstyle="round",
                capstyle="round",
                zorder=zorder,
            )
            ax.add_patch(patch)


def _draw_powerbi_lines(ax, df: pd.DataFrame) -> None:
    coordinate_columns = ["FromLatitude", "FromLongitude", "ToLatitude", "ToLongitude"]
    missing = [column for column in coordinate_columns if column not in df.columns]
    if missing:
        _add_message(ax, "Missing required columns: " + ", ".join(missing))
        return

    rows = df.copy()
    for column in coordinate_columns + ["VoltageKV"]:
        rows[column] = pd.to_numeric(rows[column], errors="coerce") if column in rows else np.nan

    projects: dict[str, bool] = {}
    stations_seen: set[str] = set()
    labels_seen: set[str] = set()
    drawable = 0
    for _, row in rows.iterrows():
        points = []
        for prefix in ("From", "To"):
            latitude, longitude = row[prefix + "Latitude"], row[prefix + "Longitude"]
            if np.isfinite(latitude) and np.isfinite(longitude) and abs(latitude) <= 90 and abs(longitude) <= 180:
                points.append((longitude, latitude))
        station = str(row.get("FeatureType", "")).lower() == "substation"
        if station:
            points = points[:1]
        number = row.get("ProjectNumber")
        if pd.notna(number) and str(number).strip():
            key = str(number)
            projects[key] = projects.get(key, False) or bool(points)
        if not points:
            continue

        drawable += 1
        style = _line_style(row["VoltageKV"])
        label = style["label"]
        legend_label = label if label not in labels_seen else "_nolegend_"
        if station:
            station_id = row.get("StationID")
            key = str(station_id) if pd.notna(station_id) and str(station_id).strip() else str(points[0])
            if key in stations_seen:
                continue
            stations_seen.add(key)
        labels_seen.add(label)
        xs, ys = zip(*points)
        if len(points) == 2:
            ax.plot(xs, ys, color=style["color"], linewidth=style["linewidth"],
                    linestyle=style["linestyle"], solid_capstyle="round", alpha=0.9,
                    label=legend_label, zorder=4)
            legend_label = "_nolegend_"
        ax.scatter(xs, ys, s=42 if station else 26 if len(points) == 1 else 18,
                   marker="D" if station else "o", color=style["color"], edgecolor="white",
                   linewidth=0.7, label=legend_label, zorder=5)

    if labels_seen:
        ax.legend(loc="lower left", frameon=False, fontsize=8)
    if not drawable:
        _add_message(ax, "No drawable features after filtering.")
    ax.text(0.99, 0.01, f"Projects without location: {sum(not located for located in projects.values())}",
            transform=ax.transAxes, ha="right", va="bottom", fontsize=8,
            color="#435258", zorder=10)


def _line_style(voltage_kv: float) -> dict[str, object]:
    if not np.isnan(voltage_kv) and int(voltage_kv) == 500:
        return {
            "color": "#b12a34",
            "linewidth": 2.8,
            "linestyle": "-",
            "label": "500 kV",
        }

    if not np.isnan(voltage_kv) and int(voltage_kv) == 230:
        return {
            "color": "#1f6f8b",
            "linewidth": 1.9,
            "linestyle": "-",
            "label": "230 kV",
        }

    if np.isnan(voltage_kv):
        label = "Unknown kV"
    else:
        label = f"{int(voltage_kv)} kV"

    return {
        "color": "#5b6770",
        "linewidth": 1.5,
        "linestyle": "--",
        "label": label,
    }


def _iter_polygons(geometry: dict) -> Iterable[list]:
    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates", [])

    if geometry_type == "Polygon":
        yield coordinates
    elif geometry_type == "MultiPolygon":
        yield from coordinates


def _polygon_to_path(polygon: list) -> MplPath | None:
    vertices = []
    codes = []

    for ring in polygon:
        points = _clean_ring(ring)
        if len(points) < 4:
            continue

        vertices.extend(points)
        codes.extend(
            [MplPath.MOVETO]
            + [MplPath.LINETO] * (len(points) - 2)
            + [MplPath.CLOSEPOLY]
        )

    if not vertices:
        return None

    return MplPath(vertices, codes)


def _clean_ring(ring: list) -> list[tuple[float, float]]:
    points = [(float(point[0]), float(point[1])) for point in ring if len(point) >= 2]
    if points and points[0] != points[-1]:
        points.append(points[0])
    return points


def _geojson_bounds(geojson: dict) -> tuple[float, float, float, float]:
    if "bbox" in geojson and len(geojson["bbox"]) == 4:
        west, south, east, north = geojson["bbox"]
        return float(west), float(south), float(east), float(north)

    points = []
    for feature in geojson.get("features", []):
        for polygon in _iter_polygons(feature.get("geometry", {})):
            for ring in polygon:
                points.extend(_clean_ring(ring))

    if not points:
        raise ValueError("No coordinates found in Ontario GeoJSON.")

    longitudes = [point[0] for point in points]
    latitudes = [point[1] for point in points]
    return min(longitudes), min(latitudes), max(longitudes), max(latitudes)


def _resolve_view_extent(
    bounds: tuple[float, float, float, float],
    df: pd.DataFrame | None,
    center_lon: float | None,
    center_lat: float | None,
    zoom: float | None,
    extent: tuple[float, float, float, float] | None,
    margin_fraction: float = 0.04,
) -> tuple[float, float, float, float]:
    if extent is not None:
        return _validate_extent(extent)

    west, south, east, north = _expand_bounds(bounds, margin_fraction)

    if center_lon is None:
        center_lon = _first_numeric_value(df, VIEW_CENTER_LONGITUDE_COLUMNS)
    if center_lat is None:
        center_lat = _first_numeric_value(df, VIEW_CENTER_LATITUDE_COLUMNS)
    if zoom is None:
        zoom = _first_numeric_value(df, VIEW_ZOOM_COLUMNS)

    center_lon = _coalesce_float(center_lon, (west + east) / 2)
    center_lat = _coalesce_float(center_lat, (south + north) / 2)
    zoom = _coalesce_float(zoom, 1.0)
    zoom = min(max(zoom, 1.0), 50.0)

    width = (east - west) / zoom
    height = (north - south) / zoom

    return (
        center_lon - width / 2,
        center_lat - height / 2,
        center_lon + width / 2,
        center_lat + height / 2,
    )


def _set_extent_and_aspect(
    ax, extent: tuple[float, float, float, float]
) -> None:
    west, south, east, north = extent

    ax.set_xlim(west, east)
    ax.set_ylim(south, north)

    mean_latitude = (south + north) / 2
    aspect = 1 / math.cos(math.radians(mean_latitude))
    ax.set_aspect(aspect, adjustable="box")


def _expand_bounds(
    bounds: tuple[float, float, float, float], margin_fraction: float
) -> tuple[float, float, float, float]:
    west, south, east, north = bounds
    lon_margin = (east - west) * margin_fraction
    lat_margin = (north - south) * margin_fraction

    return (
        west - lon_margin,
        south - lat_margin,
        east + lon_margin,
        north + lat_margin,
    )


def _validate_extent(
    extent: tuple[float, float, float, float]
) -> tuple[float, float, float, float]:
    west, south, east, north = [float(value) for value in extent]
    if west >= east or south >= north:
        raise ValueError("extent must be ordered as (west, south, east, north).")
    return west, south, east, north


def _first_numeric_value(
    df: pd.DataFrame | None, column_names: list[str]
) -> float | None:
    if df is None:
        return None

    for column_name in column_names:
        if column_name not in df.columns:
            continue

        values = pd.to_numeric(df[column_name], errors="coerce").dropna()
        if not values.empty:
            return float(values.iloc[0])

    return None


def _coalesce_float(value: float | None, fallback: float) -> float:
    if value is None:
        return fallback

    value = float(value)
    if math.isnan(value):
        return fallback

    return value


def _style_map_axes(ax) -> None:
    ax.set_xlabel("")
    ax.set_ylabel("")
    ax.set_xticks([])
    ax.set_yticks([])
    for spine in ax.spines.values():
        spine.set_visible(False)


def _add_message(ax, message: str) -> None:
    ax.text(
        0.5,
        0.04,
        message,
        transform=ax.transAxes,
        ha="center",
        va="bottom",
        fontsize=9,
        color="#263238",
        bbox={
            "boxstyle": "round,pad=0.35",
            "facecolor": "white",
            "edgecolor": "#c9d1d3",
            "alpha": 0.9,
        },
        zorder=10,
    )
