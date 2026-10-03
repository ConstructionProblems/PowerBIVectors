# Power BI Ontario Python Map

A standalone Python/Matplotlib renderer for Ontario, the four Great Lakes that touch Ontario, transmission segments and substation markers. All basemap geometry is local vector GeoJSON; there are no tiles, raster basemaps, web APIs or runtime downloads.

**For interactive pan/zoom, project labels, line glow and native formatting, use the [custom visual](../ontarioVectorMapVisual/README.md).** Power BI Python visuals display a static image.

## Install And Run

Install dependencies in the Python environment selected by Power BI. From this folder:

```powershell
python -m pip install -r requirements.txt
python demo.py
```

The demo opens a Matplotlib window with 14 complete fictional line segments, one single-location dot and four physical substations. It includes Toronto-Barrie at 230 kV and Mississauga-Hamilton at 500 kV.

The [sample CSV](data/sample_transmission_lines.csv) is generated from the custom visual's current Projects, MapFeatures and Contracts demo tables. To regenerate both flat CSV copies, run `python build_tools/prepare_demo_data.py` from the repository root. See the [demo import guide](../README.md#demo-data) for the separate-table setup.

## Use In Power BI

1. Add a Python visual.
2. Add `FromLatitude`, `FromLongitude`, `ToLatitude`, `ToLongitude` and `VoltageKV`, plus `FeatureID` to preserve distinct input features.
3. Add `ProjectNumber` for missing-location diagnostics, and `FeatureType` / `StationID` for substation markers and shared-station deduplication.
4. Paste [powerbi_example.py](powerbi_example.py) into the script editor and edit `PACKAGE_PATH` to your local `powerbi_ontario_vector_map` folder.
5. Run the visual.

Use **Don't summarize** for numeric fields and keep IDs as **Text**, including leading zeros. Power BI provides the selected fields and filtered rows in the pandas DataFrame named `dataset`. Slicers and filters change those rows and cause the map to redraw. Power BI removes identical selected rows before the script runs, so include FeatureID when distinct associations otherwise look identical.

## Input Fields

| Columns | Purpose |
| --- | --- |
| FromLatitude, FromLongitude, ToLatitude, ToLongitude | Required coordinate columns; individual values may be blank |
| VoltageKV | Optional rating for line color/width; missing ratings use a neutral style |
| FeatureID | Feature identifier for Power BI's input grouping |
| FeatureType | Line or Substation; omitted values draw as lines |
| StationID | Shared physical station identifier; repeated stations are drawn once |
| ProjectNumber | Text project identifier for unique unlocated-project counts |

The older LineID field is also accepted. Project/contract financial metadata, stages and milestone dates can remain in the CSV, but this renderer does not display them.

Coordinates are WGS84 with X = longitude and Y = latitude. Two valid pairs draw a segment; one valid pair draws a colored dot. Substation features draw diamonds. Invalid, missing or out-of-range coordinate pairs are ignored without discarding project metadata. A project counts as unlocated only when none of its filtered features has a valid location.

If required coordinate columns are missing, or no drawable records remain, the local map still renders with an informative message. The renderer returns `(fig, ax)`.

## Script-Driven View

There are no clickable viewport controls in a Power BI Python visual. Set the view in your script:

```python
fig, ax = render_ontario_map(dataset, center_lon=-79.6, center_lat=44.0, zoom=4)
plt.show()
```

`zoom=1` shows Ontario; larger values zoom in. You can also add `MapCenterLongitude`, `MapCenterLatitude` and `MapZoom` columns to the Python visual for parameter/slicer-driven redraws. The renderer uses the first nonblank value for each control, so keep one selected value and use Don't summarize. Optional `extent=(west, south, east, north)` overrides center and zoom.

## Offline Sources

- [data/ontario.geojson](data/ontario.geojson): Ontario extracted from [Natural Earth 1:10m Admin 1 States/Provinces](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/).
- [data/great_lakes.geojson](data/great_lakes.geojson): Superior, Huron, Erie and Ontario extracted from [Natural Earth 1:10m Lakes](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-lakes/).
- Natural Earth vector data are [public domain](https://www.naturalearthdata.com/about/terms-of-use/).

Only extracted local vector geometry is stored. Matplotlib draws the geometry directly; Power BI's final Python visual is a static image of that rendering.

## Data Safety

All sample routes, stations, departments, contractors, amounts and dates are fictional. Never commit corporate, customer, operational or business-sensitive data. Keep real data in Power BI or another approved source.
