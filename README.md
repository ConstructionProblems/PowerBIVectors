# PowerBIVectors

Offline Ontario vector maps for Power BI. No tiles, web APIs, runtime downloads or raster basemaps. All samples are fictional; never commit business or operational data.

## Quick Start

Package: [Ontario Vector Map v1.4.0.0](ontarioVectorMapVisual/dist/ontarioVectorMapVisual5EA53A093588421AA3963F21BE38F37D.1.4.0.0.pbiviz)

1. In Power BI Desktop, choose **Visualizations > ... > Import a visual from a file** and select the package. Accept replacement of the older visual.
2. Choose one [demo import option](#demo-data) below. For a quick test, import the ready-made `transmission_lines_demo.csv` as `MapInput`.
3. Add the visual and assign **MapInput's columns**: `ProjectNumber`, `ProjectName`, `FeatureID`, `FeatureType`, the four coordinate fields and `VoltageKV` to matching wells.
4. Add `StationID` / `StationName` for stations, plus sourcing, contracts, capex, statuses, stage and dates as needed. Use **Don't summarize**, plain dates, not date hierarchies.
5. Open **Format visual > Visual > Projects**. Enable labels, choose actual project IDs or sequential map numbers, select the sort and circle/text formatting.
6. Use **Line glow** for the halo and the on-map legend tool to select details such as gross capex. Slicers filter input rows and resequence map numbers; panning and zooming do not.

The sample contains 15 projects, 22 feature associations, 12 contracts and 23 flattened rows. There are 14 complete line segments, one start-only dot, four physical stations (six associations), and two unlocated projects. Two stations have mixed IN/OUT associations. Costs are fictional CAD amounts; the visual does not assume a currency for your data.

Only the current package is kept in `dist/`. Older releases remain in Git history.

## Demo Data

All custom-visual demo files are in [ontarioVectorMapVisual/sample_data](ontarioVectorMapVisual/sample_data). Choose **one** approach; do not append the ready-made flat CSV to the normalized tables.

### Option A: Quick Demo

Import [transmission_lines_demo.csv](ontarioVectorMapVisual/sample_data/transmission_lines_demo.csv) as a single table named `MapInput`. It already combines all project, feature and contract columns. Use this table's columns in the map visual. No merges are needed.

### Option B: Separate Tables

Import the following files as separate tables:

| Power BI table | CSV | Contents |
| --- | --- | --- |
| Projects | [projects_demo.csv](ontarioVectorMapVisual/sample_data/projects_demo.csv) | Project number/name, gross capex, department, project status/stage, overall ISD and default dates |
| MapFeatures | [map_features_demo.csv](ontarioVectorMapVisual/sample_data/map_features_demo.csv) | Project/feature IDs, line or substation geometry, station names, circuit/tower, IN/OUT strategy, contract ID and feature date overrides |
| Contracts | [contracts_demo.csv](ontarioVectorMapVisual/sample_data/contracts_demo.csv) | Contract ID, contractor, contract status and contract value |

In Power Query, create a fourth query named `MapInput`: start with **Merge Queries as New** from Projects, left-join MapFeatures by `ProjectNumber`, expand its columns except `ProjectNumber`, then left-join Contracts by `ContractID` and expand its columns except `ContractID`. Use **MapInput's columns in the map visual**, not a mixture of columns from the three source tables.

Alternatively, paste [flatten_demo.pq](ontarioVectorMapVisual/sample_data/flatten_demo.pq) into a blank query's Advanced Editor, edit `SampleFolder`, and name the query `MapInput`. This script reads all three files directly; it does not reference existing Power Query queries. Import Projects and Contracts separately only if you also want their lookup tables for financial reporting.

See the [column-to-table guide](ontarioVectorMapVisual/README.md#demo-files-and-columns) for exact ownership of every field. Calculate project costs from Projects and contract costs from Contracts, not from repeated amounts in MapInput.

For either approach, keep `ProjectNumber`, `FeatureID`, `StationID` and `ContractID` as **Text**. Set ProjectNumber to Text before automatic numeric conversion; remove or edit the automatic Changed Type step. Already-lost leading zeros cannot be reconstructed by the visual. Set coordinates, voltage and cost columns to numbers, and use plain date columns instead of date hierarchies.

## Project Model

Keep Projects and Contracts as unique lookup tables. Map Features holds one project-feature association per row. A project can contain many lines and stations, each with its own strategy and optional contract. A stable StationID combines shared physical stations into one pin.

Use the supplied [Power Query left join](ontarioVectorMapVisual/sample_data/flatten_demo.pq), or follow the [field and model guide](ontarioVectorMapVisual/README.md). Projects with no features must remain in the flattened input for missing-location diagnostics. Gross capex is a supplied project amount, not a sum of construction contracts.

## Folders

- `ontarioVectorMapVisual/`: TypeScript custom visual, bundled Ontario/lakes/place vectors, native formatting, interactive controls, tests and packaged visual.
- `powerbi_ontario_vector_map/`: local Python/Matplotlib renderer and demo. Python visuals are static, not interactive widgets.
- `build_tools/`: reproducible sample join, Python smoke tests and Windows packaging helper.

## Build And Verify

```powershell
cd ontarioVectorMapVisual
npm install
npm run package
npm run test:visual
.\node_modules\.bin\tsc.cmd --noEmit --skipLibCheck
cd ..
python -m pip install -r powerbi_ontario_vector_map/requirements.txt
python build_tools/prepare_demo_data.py
python build_tools/test_python_map.py
python powerbi_ontario_vector_map/demo.py
```

Use Node >=20.19 for the current visual build tooling. On Windows, the package command includes a PowerShell compatibility helper. Browser tests inspect the actual packaged JavaScript/CSS in Microsoft Edge with a mocked Power BI host; they are not a Power BI Service certification test. This repository publication does not install the visual in a company catalog or submit it to AppSource.

Source code is MIT-licensed. Natural Earth geometry and populated places are public domain. See [LICENSE](LICENSE), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the subproject READMEs for attribution.
