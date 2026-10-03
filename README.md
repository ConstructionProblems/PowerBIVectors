# PowerBIVectors

This repository contains two offline Ontario vector-map options for Power BI:

- `powerbi_ontario_vector_map/`: a Python visual helper that renders Ontario, the Great Lakes, and transmission lines with Matplotlib.
- `ontarioVectorMapVisual/`: a packaged Power BI custom visual project with built-in viewport controls.

Both options use local vector geometry. There are no web map tiles, raster basemaps, or runtime map API calls.

## Test The Custom Visual

The packaged visual is here:

```text
ontarioVectorMapVisual/dist/ontarioVectorMapVisual5EA53A093588421AA3963F21BE38F37D.1.3.0.0.pbiviz
```

In Power BI Desktop:

1. Open a report.
2. Select `Visualizations` > `...` > `Import a visual from a file`.
3. Pick the `.pbiviz` file above.
4. Import `ontarioVectorMapVisual/sample_data/transmission_lines_demo.csv` or use your own line data.
5. Add these fields to the visual:
   - `LineID`
   - `FromLatitude`
   - `FromLongitude`
   - `ToLatitude`
   - `ToLongitude`
   - `VoltageKV`
   - `Status`
   - `PlannedConstructionStart`
   - `PlannedConstructionFinish`
   - `ConstructionOutsourcingStrategy`
   - `ProjectNumber`
   - `ProjectName`
   - `DepartmentResponsible`
   - `Contractor`
   - `ContractValue`
   - `TowerType`
   - `CircuitName`
   - `ProjectStatus`
   - `ContractStatus`
   - `ProjectStage`
   - `RFPDate`
   - `BESTReleaseDate`
   - `DETLReleaseDate`
   - `EMPPReleaseDate`
   - `ISDDate`

The first six fields are required. The other fields are optional. `Status` is a compatibility field for older reports; prefer separate `ProjectStatus`, `ContractStatus`, and `ProjectStage` fields for new reports. Project numbers and names are needed for project badges and the legend. Refresh or reimport the demo CSV to pick up the added columns. Set numeric fields to `Don't summarize` and use plain date fields instead of date hierarchies.

Import the new package to replace the older visual when prompted. Select the custom visual and open `Format visual` > `Visual` for its settings.

## Custom Visual Controls

The custom visual has real in-visual controls:

- Magnifier buttons zoom the map.
- Arrow buttons pan the viewport.
- The reset button returns to the full Ontario view.
- The legend-settings button opens a field selector. Choose a primary label and toggle legend details.
- Mouse wheel zoom and drag panning also work when Power BI allows pointer events.

The Power BI Format pane also includes:

- Canvas background color and opacity.
- Ontario land color and opacity.
- Great Lakes color and opacity.
- City/town label show/hide, color, size, and opacity.
- Voltage color settings for 115 kV, 230 kV, 345 kV, 500 kV, and other voltages.
- Transmission line thickness scale and `Thickness by voltage` toggle. Turn the toggle off for equal widths.
- Status-based, solid, or dashed line pattern.
- Color mode switch between voltage colors and outsourcing colors, where `IN` is green and `OUT` is blue by default.
- `Projects` > `Show project numbers`: numbered circles on the lines. Numbers come from `ProjectNumber` and remain stable after slicers filter the data.
- `Legend`: independently show/hide the line color key and project list; choose project, circuit, or line labels; select tower, status, stage, department, contractor/value, and milestone-date details; adjust text size and panel width. The on-map legend tool updates these same settings.

Demo project metadata includes `Department 1` and `Department 2`, fictional contractors, and fictional contract values in CAD. Each project number must be a positive whole number with one consistent name. Multiple segments of the same project share a single legend entry; line rows are never merged.

Tower examples include steel lattice suspension/dead-end towers, guyed lattice steel, steel and wood H-frames, tubular steel monopoles, and concrete poles. The sample project stages include Initialized, Budgetary, Design, Construction, Permitting, and In Service. All values, circuit names, statuses, and dates are fictional; these examples do not define a corporate workflow.

## Rebuild The `.pbiviz`

From the custom visual folder:

```powershell
cd "ontarioVectorMapVisual"
npm install
npm run package
npm run test:visual
```

On this machine, `npm run package` automatically uses `build_tools/pwsh.cmd` so the package step can use Windows PowerShell when PowerShell Core's `pwsh` is not installed.

Do not commit corporate, customer, operational, or business-sensitive transmission data. The included sample records are fictional.

Source code is MIT-licensed; bundled Natural Earth geometry and places are public domain. See [LICENSE](LICENSE), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and the [custom visual field guide](ontarioVectorMapVisual/README.md).
