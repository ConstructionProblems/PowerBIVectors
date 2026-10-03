"""Offline renderer and sample-join smoke tests; run from any working directory."""

import socket
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import PathPatch
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "powerbi_ontario_vector_map"))
from demo import build_sample_lines
from map_renderer import render_ontario_map, _load_geojson, _iter_polygons, _polygon_to_path, DATA_PATH


class OfflineMapTests(unittest.TestCase):
    def tearDown(self):
        plt.close("all")

    def test_demo_and_layers_without_network(self):
        with patch.object(socket.socket, "connect", side_effect=AssertionError("Runtime network call")):
            rows = build_sample_lines()
            self.assertEqual(rows["ProjectNumber"].nunique(), 15)
            self.assertEqual(rows.iloc[0]["ProjectNumber"], "01001")
            fig, ax = render_ontario_map(rows)
            fig.canvas.draw()
            self.assertEqual(len(ax.lines), 14)
            self.assertEqual(len(ax.images), 0)
            self.assertTrue(all(isinstance(item, PathPatch) for item in ax.patches))
            self.assertTrue(any(item.get_text() == "Projects without location: 2" for item in ax.texts))
            pixels = np.asarray(fig.canvas.buffer_rgba())
            self.assertGreater(len(np.unique(pixels.reshape(-1, 4), axis=0)), 100)

    def test_none_empty_and_missing_columns(self):
        rows = build_sample_lines()
        for data in [None, rows.iloc[:0], pd.DataFrame({"LineID": ["X"]})]:
            fig, ax = render_ontario_map(data)
            fig.canvas.draw()
            self.assertGreater(len(ax.patches), 0)
        self.assertTrue(any("Missing required columns" in item.get_text() for item in ax.texts))

    def test_single_endpoints_invalid_and_project_count(self):
        samples = build_sample_lines()
        rows = samples.loc[samples.LineID.isin(["LINE_001", "LINE_002"])].copy()
        rows.loc[rows.index[0], ["ToLatitude", "ToLongitude"]] = np.nan
        rows.loc[rows.index[1], ["FromLatitude", "FromLongitude"]] = np.nan
        fig, ax = render_ontario_map(rows)
        self.assertEqual(len(ax.lines), 0)
        self.assertEqual(len(ax.collections), 2)
        rows.loc[rows.index[1], "ToLatitude"] = np.inf
        fig, ax = render_ontario_map(rows)
        self.assertEqual(len(ax.collections), 1)
        self.assertTrue(any(item.get_text() == "Projects without location: 1" for item in ax.texts))

    def test_first_two_routes_are_inside_ontario(self):
        polygons = [_polygon_to_path(polygon) for feature in _load_geojson(DATA_PATH)["features"]
                    for polygon in _iter_polygons(feature["geometry"])]
        samples = build_sample_lines()
        for line_id in ["LINE_001", "LINE_002"]:
            row = samples.loc[samples.LineID == line_id].iloc[0]
            for fraction in np.linspace(0, 1, 21):
                point = (row.FromLongitude + fraction * (row.ToLongitude - row.FromLongitude),
                         row.FromLatitude + fraction * (row.ToLatitude - row.FromLatitude))
                self.assertTrue(any(polygon.contains_point(point) for polygon in polygons), (line_id, point))

    def test_sample_flattening_is_reproducible_and_preserves_projects(self):
        a = ROOT / "ontarioVectorMapVisual/sample_data/transmission_lines_demo.csv"
        b = ROOT / "powerbi_ontario_vector_map/data/sample_transmission_lines.csv"
        self.assertEqual(a.read_text(encoding="utf-8"), b.read_text(encoding="utf-8"))
        from prepare_demo_data import build_demo_data
        original = a.read_text(encoding="utf-8")
        build_demo_data()
        self.assertEqual(a.read_text(encoding="utf-8"), original)
        rows = pd.read_csv(a, dtype={"ProjectNumber": "string"})
        self.assertTrue(pd.isna(rows.loc[rows.ProjectNumber == "01015", "FeatureID"].iloc[0]))


if __name__ == "__main__":
    unittest.main()
