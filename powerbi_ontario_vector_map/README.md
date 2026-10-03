# Power BI Ontario Vector Map

This small package renders an offline vector map of Ontario, draws the Great Lakes that touch Ontario in blue, and overlays transmission-style line vectors. It is intended for Microsoft Power BI Python visuals, but `demo.py` also runs as a normal local Python script.

## Data Source

The Ontario boundary is stored locally in `data/ontario.geojson`. It was extracted from Natural Earth 1:10m Admin 1 States/Provinces data:

- Source: https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/
- Terms: https://www.naturalearthdata.com/about/terms-of-use/

The lake layer is stored locally in `data/great_lakes.geojson`. It was extracted from Natural Earth 1:10m Lakes data and includes only the Great Lakes that touch Ontario: Lake Superior, Lake Huron, Lake Erie, and Lake Ontario.

- Source: https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-lakes/

Natural Earth states that its raster and vector map data are in the public domain. The repository stores only the extracted Ontario and Great Lakes vector geometries. No map tiles, raster basemap, web API, or runtime download is used.

## Install

Install the small runtime dependency set in the Python environment used by Power BI:

```powershell
pip install -r requirements.txt
```

## Run The Demo

From this folder, run:

```powershell
python demo.py
```

The demo opens a Matplotlib window with Ontario and the Great Lakes drawn from local GeoJSON, plus fourteen complete fictional transmission segments, one single-location dot and four physical substation markers:

- Toronto area to Barrie area, 230 kV
- Mississauga area to Hamilton area, 500 kV
- Additional fictional Ontario transmission segments with 115 kV, 230 kV, 345 kV, and 500 kV examples

The sample transmission records are demo data only and are stored in `data/sample_transmission_lines.csv`.

## Use In Power BI

1. Add a Python visual to your report.
2. Add these fields to the visual:
   - `LineID`
   - `FromLatitude`
   - `FromLongitude`
   - `ToLatitude`
   - `ToLongitude`
   - `VoltageKV`
3. Copy the contents of `powerbi_example.py` into the Python visual editor.
4. Edit `PACKAGE_PATH` so it points to your local `powerbi_ontario_vector_map` folder.
5. Run the visual.

Power BI supplies the visual data as a pandas DataFrame named `dataset`. Slicers and report filters change the rows passed to `dataset`, so the Python map redraws using the filtered line records.

## Pan And Zoom

Power BI Python visuals render as static images, so they do not support browser-style drag panning or mouse-wheel zooming inside the visual. This package supports script-driven and slicer-driven view controls instead.

To set the view in the Python script, pass a map center and zoom:

```python
fig, ax = render_ontario_map(
    dataset,
    center_lon=-79.6,
    center_lat=44.0,
    zoom=4,
)
plt.show()
```

`zoom=1` shows full Ontario, `zoom=2` is twice as close, and `zoom=4` is four times as close. The center uses WGS84 longitude/latitude.

For Power BI slicer or parameter control, add any of these optional fields to the Python visual:

```text
MapCenterLongitude
MapCenterLatitude
MapZoom
```

The renderer uses the first nonblank value it receives. These optional fields can come from Power BI parameters, slicers, or columns added to your model.
For predictable results, keep one selected value for each control field and set numeric control fields to `Don't summarize`.

## Expected Columns

The renderer expects:

```text
LineID
FromLatitude
FromLongitude
ToLatitude
ToLongitude
VoltageKV
```

These six fields remain the recommended legacy format. Only the four coordinate columns are mandatory in Python; missing voltage uses a neutral style, and expanded inputs may use FeatureID instead of LineID.

Coordinates must be WGS84 longitude/latitude. The map uses X = longitude and Y = latitude. No projection conversion is performed.

Two valid coordinate pairs draw a segment; a single valid pair draws a colored dot. Invalid or missing pairs are ignored without losing a row's project metadata. Optional `FeatureType = Substation` draws a diamond; shared `StationID` references are drawn once. `ProjectNumber` enables a count of unique filtered projects with no drawable feature. An incomplete feature does not count as an unlocated project when another feature locates it. If coordinate columns are missing, or no drawable rows remain, the map still renders with an informative message.

The demo CSV also includes optional planning fields used by the custom visual:

```text
Status
PlannedConstructionStart
PlannedConstructionFinish
ConstructionOutsourcingStrategy
ProjectNumber
ProjectName
DepartmentResponsible
Contractor
ContractValue
TowerType
CircuitName
ProjectStatus
ContractStatus
ProjectStage
RFPDate
BESTReleaseDate
DETLReleaseDate
EMPPReleaseDate
ISDDate
```

The expanded CSV also contains `ProjectGrossCapex`, `FeatureID`, `FeatureType`, `StationID`, `StationName`, `ContractID` and feature milestone overrides. It is regenerated from the custom visual's normalized Projects, Map Features and Contracts samples by `python build_tools/prepare_demo_data.py` from the repository root. The left join preserves projects without features. Keep project numbers as text to retain leading zeros.

The Python renderer uses feature type/station ID for geometry and project number for diagnostics; it does not show financial metadata or implement the custom visual's interactive label/glow controls. Demo contractors and CAD amounts are fictional; sample departments are `Department 1` and `Department 2`. There are fifteen sample projects, including two without a location.

## Data Safety

Do not commit corporate, customer, operational, or business-sensitive data to this GitHub repository. Keep real transmission records in Power BI or another approved data source. This repository should contain only the reusable renderer, demo code, and public Ontario boundary geometry.
