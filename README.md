# PowerBIVectors

Offline Ontario vector maps for Power BI. No tiles, web APIs, runtime downloads or raster basemaps. All samples are fictional; never commit business or operational data.

## Test v1.4

Package: [Ontario Vector Map v1.4.0.0](ontarioVectorMapVisual/dist/ontarioVectorMapVisual5EA53A093588421AA3963F21BE38F37D.1.4.0.0.pbiviz)

1. In Power BI Desktop, choose **Visualizations > ... > Import a visual from a file** and select the package. Accept replacement of the older visual.
2. Import [transmission_lines_demo.csv](ontarioVectorMapVisual/sample_data/transmission_lines_demo.csv). Set `ProjectNumber` to **Text before automatic numeric conversion**; remove/rework the automatic Changed Type step. Already-lost zeros cannot be reconstructed by the visual.
3. Add the visual and assign `ProjectNumber`, `ProjectName`, `FeatureID`, `FeatureType`, the four coordinate fields and `VoltageKV` to matching wells.
4. Add `StationID` / `StationName` for stations, plus sourcing, contracts, capex, statuses, stage and dates as needed. Use **Don't summarize**, plain dates, not date hierarchies.
5. Open **Format visual > Visual > Projects**. Enable labels, choose actual project IDs or sequential map numbers, select the sort and circle/text formatting.
6. Use **Line glow** for the halo and the on-map legend tool to select details such as gross capex. Slicers filter input rows and resequence map numbers; panning and zooming do not.

The sample contains 15 projects, 22 feature associations, 12 contracts and 23 flattened rows. There are 14 complete line segments, one start-only dot, four physical stations (six associations), and two unlocated projects. Two stations have mixed IN/OUT associations. Costs are fictional CAD amounts; the visual does not assume a currency for your data.

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
