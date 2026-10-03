"""Rebuild fictional flat imports from the three local normalized demo tables."""

import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT / "ontarioVectorMapVisual" / "sample_data"


def read_table(name, key):
    with (SAMPLES / name).open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        fields = reader.fieldnames
    keys = [key] if isinstance(key, str) else key
    if len({tuple(row[column] for column in keys) for row in rows}) != len(rows) or any(
        not row[column] for row in rows for column in keys
    ):
        raise ValueError(f"{name}: {key} must be populated and unique")
    return rows, fields


def build_demo_data():
    projects, project_fields = read_table("projects_demo.csv", "ProjectNumber")
    features, feature_fields = read_table("map_features_demo.csv", ["ProjectNumber", "FeatureID"])
    contracts, contract_fields = read_table("contracts_demo.csv", "ContractID")
    contract_lookup = {row["ContractID"]: row for row in contracts}
    project_lookup = {row["ProjectNumber"]: [] for row in projects}
    for feature in features:
        if feature["ProjectNumber"] not in project_lookup:
            raise ValueError(f"Unknown project: {feature['ProjectNumber']}")
        project_lookup[feature["ProjectNumber"]].append(feature)
        if feature["ContractID"] and feature["ContractID"] not in contract_lookup:
            raise ValueError(f"Unknown contract: {feature['ContractID']}")

    fields = ["LineID", *project_fields, *[field for field in feature_fields if field != "ProjectNumber"],
              *[field for field in contract_fields if field != "ContractID"], "Status"]
    rows = []
    # Left join, not inner join: projects with no features still reach the visual.
    for project in projects:
        for feature in project_lookup[project["ProjectNumber"]] or [{}]:
            contract = contract_lookup.get(feature.get("ContractID"), {})
            rows.append({**project, **feature, **contract, "LineID": feature.get("FeatureID", ""),
                         "Status": project["ProjectStatus"]})
    for path in [SAMPLES / "transmission_lines_demo.csv",
                 ROOT / "powerbi_ontario_vector_map" / "data" / "sample_transmission_lines.csv"]:
        with path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)
    print(f"Built {len(rows)} associations for {len(projects)} fictional projects.")


if __name__ == "__main__":
    build_demo_data()
