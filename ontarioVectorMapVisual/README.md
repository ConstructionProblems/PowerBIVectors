# Ontario Vector Map v1.4

A Power BI custom visual with local Ontario and Great Lakes vectors, bundled city/town labels, transmission lines, substation pins, tooltips and real pan/zoom controls. Runtime privileges are empty; no maps or names are downloaded.

Package: [v1.4.0.0](dist/ontarioVectorMapVisual5EA53A093588421AA3963F21BE38F37D.1.4.0.0.pbiviz). Import it through **Visualizations > ... > Import a visual from a file** and accept replacement of the older version.

## Normalized Model

| Table | Grain / key | Contents |
| --- | --- | --- |
| Projects | One row per text ProjectNumber | ProjectName, ProjectGrossCapex, DepartmentResponsible, ProjectStatus, ProjectStage, overall ISDDate and default milestone dates |
| Map Features | One project-feature association per row | ProjectNumber, FeatureID, FeatureType, coordinates, StationID/Name, circuit/tower, IN/OUT strategy, optional ContractID and feature date overrides |
| Contracts | One row per ContractID | Contractor, ContractStatus, ContractValue |

Use `sample_data/projects_demo.csv`, `map_features_demo.csv`, and `contracts_demo.csv`. Preserve keys as **Text**, especially leading-zero project numbers. Feature IDs identify associations; StationID identifies the physical station across projects. Use consistent WGS84 coordinates for all references to a shared station. When supplied locations disagree, the first visible association locates its pin.

Each feature owns its sourcing strategy and contract linkage. Multiple features may reference the same contract. Station pins are merged by StationID (or identical coordinates when no ID is supplied); transmission segments remain one segment per row.

## Power Query Left Join

Paste [flatten_demo.pq](sample_data/flatten_demo.pq) into a blank query's Advanced Editor and edit `SampleFolder`. It loads the three local files, preserves text keys, validates unique project/contract lookup keys and performs:

```text
Projects LEFT JOIN MapFeatures ON ProjectNumber
         LEFT JOIN Contracts ON ContractID
```

For your own tables, use **Merge Queries**, choose **Left Outer**, then expand the feature columns except their ProjectNumber. Merge that result with Contracts by ContractID using Left Outer and expand contractor/status/value, not a second ContractID. Keep the original project columns and distinct feature override names. Do not inner-join or drop null coordinates: featureless projects must reach the visual.

The ready-to-import [transmission_lines_demo.csv](sample_data/transmission_lines_demo.csv) is the same flattening plus legacy LineID/Status aliases. Regenerate it and the Python copy with `python build_tools/prepare_demo_data.py` from the repository root. There are 15 fictional projects, 22 feature associations, 12 contracts and 23 flat rows.

Do not SUM ProjectGrossCapex or repeated ContractValue in the flattened table. Use the Projects and Contracts lookup tables for financial measures. The visual lists supplied amounts without totaling them and deduplicates ContractID references. Conflicting repeated gross-capex amounts show a warning in the project legend, not a misleading sum.

## Field Wells

Assign fields to their matching wells. The four coordinate wells use WGS84: longitude is X, latitude is Y. New inputs should include ProjectNumber, ProjectName, FeatureID and FeatureType. At least ProjectNumber, FeatureID or legacy LineID must be assigned. Coordinate/destination/voltage roles are optional so station-only and featureless projects are supported.

| CSV column(s) | Well(s) / purpose |
| --- | --- |
| ProjectNumber, ProjectName, ProjectGrossCapex | Project Number, Project Name, Project Gross Capex |
| FeatureID, FeatureType | Feature ID, Feature Type; Line or Substation |
| FromLatitude, FromLongitude, ToLatitude, ToLongitude | Matching coordinate wells; use From pair for a station |
| VoltageKV | Voltage kV; blank rating uses neutral styling |
| StationID, StationName | Station ID, Station Name |
| ConstructionOutsourcingStrategy | Construction Outsourcing Strategy; IN / OUT per association |
| ContractID, Contractor, ContractStatus, ContractValue | Matching contract wells |
| DepartmentResponsible, ProjectStatus, ProjectStage | Matching project wells; status and stage are independent |
| CircuitName, TowerType | Free-text Circuit Name and Tower Type |
| PlannedConstructionStart, PlannedConstructionFinish | Planned Start, Planned Finish; project defaults |
| RFPDate, BESTReleaseDate, DETLReleaseDate, EMPPReleaseDate, ISDDate | RFP Date, BEST Release Date, DETL Release Date, EMPP Release Date, Project ISD Date |
| FeaturePlannedConstructionStart, FeaturePlannedConstructionFinish | Feature Planned Start / Finish overrides |
| FeatureRFPDate, FeatureBESTReleaseDate, FeatureDETLReleaseDate, FeatureEMPPReleaseDate, FeatureISDDate | Matching Feature date override wells |
| LineID, Status | Legacy Line ID / Status; old six-field line-only reports still work |

Use **Don't summarize** for numeric fields and plain date values instead of hierarchies. Date fields accept Power BI dates or ISO YYYY-MM-DD strings; timestamps display without time. Blank overrides inherit the project date; tooltips explicitly mark supplied feature overrides and show the project default. Only overall Project ISD Date controls numbering.

Project numbers are text, including shorter legacy identifiers. If importing the flat CSV, set ProjectNumber to Text before Power Query converts it to numbers. Power BI groups identical selected field combinations; include FeatureID to preserve distinct feature associations. The visual does not generate additional line records or combine line geometry.

## Map Behavior

Two valid coordinate pairs draw a line. One valid pair draws a colored dot. Substation features draw diamond station pins, not line segments. Invalid, blank and out-of-range coordinates are not drawable. Shared stations draw once; outsourcing mode splits a diamond green/blue when its visible associations include IN and OUT. Station tooltips list associated projects, contracts, amounts, strategies and effective dates.

The bottom-right **Projects without location: N** counts unique filtered ProjectNumber values with no drawable feature. An incomplete row does not make a project unlocated if another feature locates it. Legacy rows with no project ID cannot be counted as unique projects. Empty filters display the local map and an informative message.

## Controls And Formatting

Magnifiers zoom, arrows pan, reset restores Ontario, and the legend icon opens checkboxes plus a primary-label selector. Mouse wheel and drag also navigate. The legend panel scrolls without zooming the map; Escape closes its editor.

Under **Format visual > Visual**:

- **Canvas / Map layers**: background, Ontario and lake colors/opacity, all 100% by default.
- **City and town labels**: visibility, color, size and opacity. Locally bundled Natural Earth names appear progressively with zoom.
- **Transmission lines / Voltage colors**: voltage or IN/OUT coloring, rating-relative or equal thickness, thickness multiplier, solid/dashed/status pattern and voltage palette.
- **Projects**: show labels; actual project numbers or sequential map numbers; sort by overall ISD (default earliest first), project number, name or gross capex; ascending/descending; independent circle toggles, size, bold, color and opacity.
- **Line glow**: enabled (default off), match current line color (default on), custom color, intensity and blur radius. The halo sits below the crisp stroke and follows its dash pattern.
- **Legend**: independent color key/project list visibility, primary project/circuit/line labels, text size, width and metadata toggles including gross capex, station names and contracts. The on-map editor persists the same properties.

Actual project IDs default to plain text; sequential map numbers default to circles. Unique located projects remaining after slicers receive 1..N. Missing sort values stay last in either direction; project number breaks ties. A project repeats its label across located features and has one legend entry. Panning and zooming do not change assigned numbers, even if features leave the viewport. Crowded labels are offset with leaders; individual badges may be omitted if a very small viewport has no free space.

Status-based patterns use ProjectStage, then ProjectStatus, then legacy Status. Initialized, budgetary, design, permitting and planned phases are dashed; construction has longer dashes; other phases are solid. ContractStatus never sets the pattern. All statuses/stages/tower categories accept free text.

## Offline Sources

- Ontario: [Natural Earth 1:10m Admin 1 States/Provinces](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/).
- Superior, Huron, Erie and Ontario lakes: [Natural Earth 1:10m Lakes](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-lakes/).
- City/town labels: [Natural Earth 1:10m Populated Places](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/).
- [Public-domain terms](https://www.naturalearthdata.com/about/terms-of-use/).

Only local extracted vectors/places are bundled. Lucide icon notices are in the package SVG metadata and [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). No raster basemap or runtime network request is required.

## Build And Test

```powershell
npm install
npm run package
npm run test:visual
.\node_modules\.bin\tsc.cmd --noEmit --skipLibCheck
```

Use Node >=20.19. Browser regressions load the delivered archive's JS/CSS with a mocked Power BI host in Microsoft Edge. Confirm final behavior in your Power BI Desktop/report environment; this package is not AppSource-certified. Tenant policies may control custom visual imports. GitHub publication is not company-catalog deployment.

Never commit corporate or business data. All routes, station names, contractors, amounts and dates in these samples are fictional.
