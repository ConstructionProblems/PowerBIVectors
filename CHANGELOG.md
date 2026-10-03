# Changelog

## Unreleased

- Clarify the single-CSV demo versus separate Projects, MapFeatures and Contracts imports, with exact column ownership and MapInput setup.
- Keep only the current v1.4.0.0 package in `dist/`; remove obsolete v1.1, v1.2 and v1.3 binaries. Previous releases remain in Git history.

## 1.4.0.0

- Add normalized Projects, Map Features and Contracts samples and an offline Power Query left join.
- Support multiple segments/stations per project, shared station IDs, per-feature sourcing/contracts and date overrides.
- Preserve text project numbers and leading zeros; add independent project/map labels, circles, formatting and filtered sort/resequencing.
- Add project gross capex without deriving or summing repeated costs; deduplicate shared contract metadata.
- Draw single-location dots, shared station diamonds with split IN/OUT colors, and unique unlocated-project diagnostics.
- Add configurable line glow beneath sharp strokes, defaulting off and matching line colors when enabled.
- Expand samples to 15 fictional projects, 22 feature associations and 12 contracts; preserve one featureless project in the flat import.
- Verify packaged JavaScript/CSS with browser regressions and the Python renderer with offline smoke tests.

## 1.3.0.0

- Add tower type and circuit name fields, separate project and contract statuses, and project stage.
- Add RFP, BEST, DETL, EMPP, and ISD milestone date fields; display dates without timestamp noise.
- Add a legend editor on the map and matching native Format pane settings for visibility, labels, metadata, text size, and panel width.
- Keep one legend entry per project; list distinct circuit/contract metadata without merging segments or summing contract values.
- Use project stage for status-based line patterns, with project status and legacy Status fallbacks.
- Replace letter controls with bundled icons and prevent legend scrolling from zooming the map.
- Update the 12 fictional demo records in both CSVs and document all optional fields.
- Check the packaged visual with eight browser regressions and retain the offline Python demo.

## 1.2.0.0

- Fix background, land, and lake color/opacity settings.
- Add uniform/voltage-based thickness, project number badges, project-name legend, and department/contract metadata.
