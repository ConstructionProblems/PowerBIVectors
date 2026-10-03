import powerbi from "powerbi-visuals-api";

export const ROLE_LABELS = {
    lineId: "Line ID (legacy)", featureId: "Feature ID", featureType: "Feature Type",
    fromLatitude: "From Latitude", fromLongitude: "From Longitude",
    toLatitude: "To Latitude", toLongitude: "To Longitude", voltageKv: "Voltage kV",
    status: "Status (legacy)", plannedStart: "Planned Start", plannedFinish: "Planned Finish",
    outsourcingStrategy: "Construction Outsourcing Strategy", projectNumber: "Project Number",
    projectName: "Project Name", departmentResponsible: "Department Responsible",
    contractor: "Contractor", contractId: "Contract ID", contractValue: "Contract Value",
    projectGrossCapex: "Project Gross Capex", towerType: "Tower Type", circuitName: "Circuit Name",
    stationId: "Station ID", stationName: "Station Name", projectStatus: "Project Status",
    contractStatus: "Contract Status", projectStage: "Project Stage", rfpDate: "RFP Date",
    bestReleaseDate: "BEST Release Date", detlReleaseDate: "DETL Release Date",
    emppReleaseDate: "EMPP Release Date", isdDate: "Project ISD Date",
    featurePlannedStart: "Feature Planned Start", featurePlannedFinish: "Feature Planned Finish",
    featureRfpDate: "Feature RFP Date", featureBestReleaseDate: "Feature BEST Release Date",
    featureDetlReleaseDate: "Feature DETL Release Date", featureEmppReleaseDate: "Feature EMPP Release Date",
    featureIsdDate: "Feature ISD Date",
};
export type RoleName = keyof typeof ROLE_LABELS;
export type MapFeature = Record<Exclude<RoleName, "fromLatitude" | "fromLongitude" | "toLatitude" | "toLongitude" |
    "voltageKv" | "contractValue" | "projectGrossCapex" | "projectNumber">, string> & {
    fromLatitude: number | null; fromLongitude: number | null;
    toLatitude: number | null; toLongitude: number | null;
    voltageKv: number; contractValue: number | null; projectGrossCapex: number | null;
    projectNumber: string | null;
};
export interface ProjectEntry { number: string; name: string; lines: MapFeature[]; label: string; }
export interface ParsedRows { lines: MapFeature[]; message: string | null; }
export type ProjectSort = "isdDate" | "projectNumber" | "projectName" | "projectGrossCapex";
export interface NumberingSettings { numberingMode: "project" | "map"; sortBy: ProjectSort; sortDirection: "ascending" | "descending"; }
export interface Location { longitude: number; latitude: number; }

export const DATE_FIELDS = [
    ["plannedStart", "featurePlannedStart", "Start"], ["plannedFinish", "featurePlannedFinish", "Finish"],
    ["rfpDate", "featureRfpDate", "RFP date"], ["bestReleaseDate", "featureBestReleaseDate", "BEST release"],
    ["detlReleaseDate", "featureDetlReleaseDate", "DETL release"], ["emppReleaseDate", "featureEmppReleaseDate", "EMPP release"],
    ["isdDate", "featureIsdDate", "ISD date"],
] as const;

export function toNumber(value: unknown): number | null {
    if (value === null || value === undefined || typeof value === "boolean" || String(value).trim() === "") return null;
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
}

export function toText(value: unknown, fallback = ""): string {
    if (value === null || value === undefined) return fallback;
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : fallback;
    return String(value).trim() || fallback;
}

function coordinate(value: unknown, limit: number): number | null {
    const result = toNumber(value);
    return result !== null && Math.abs(result) <= limit ? result : null;
}

export function featureLocations(row: MapFeature): Location[] {
    const points: Location[] = [];
    if (row.fromLatitude !== null && row.fromLongitude !== null) points.push({ longitude: row.fromLongitude, latitude: row.fromLatitude });
    if (row.toLatitude !== null && row.toLongitude !== null) points.push({ longitude: row.toLongitude, latitude: row.toLatitude });
    // Substations have one physical location. The end pair is a fallback, not another station.
    return row.featureType.toLowerCase() === "substation" ? points.slice(0, 1) : points;
}

export function parseTransmissionLines(dataView: powerbi.DataView | undefined): ParsedRows {
    const table = dataView?.table;
    if (!table?.columns || !table.rows) return { lines: [], message: "Add project and map feature fields." };
    const indexes = Object.fromEntries(Object.keys(ROLE_LABELS).map((role) => [role,
        table.columns.findIndex((column) => column.roles?.[role])])) as Record<RoleName, number>;
    if (indexes.projectNumber < 0 && indexes.lineId < 0 && indexes.featureId < 0) {
        return { lines: [], message: "Add Project Number, Feature ID or legacy Line ID." };
    }
    const lines = table.rows.map((row): MapFeature => {
        const result = {} as MapFeature;
        for (const role of Object.keys(ROLE_LABELS) as RoleName[]) {
            (result as unknown as Record<string, unknown>)[role] = toText(row[indexes[role]]);
        }
        result.projectNumber = toText(row[indexes.projectNumber]) || null;
        result.fromLatitude = coordinate(row[indexes.fromLatitude], 90);
        result.fromLongitude = coordinate(row[indexes.fromLongitude], 180);
        result.toLatitude = coordinate(row[indexes.toLatitude], 90);
        result.toLongitude = coordinate(row[indexes.toLongitude], 180);
        result.voltageKv = toNumber(row[indexes.voltageKv]) ?? 0;
        result.contractValue = toNumber(row[indexes.contractValue]);
        result.projectGrossCapex = toNumber(row[indexes.projectGrossCapex]);
        result.featureId = result.featureId || result.lineId;
        result.lineId = result.lineId || result.featureId || "Unnamed feature";
        result.featureType = result.featureType || "Line";
        result.projectStatus = result.projectStatus || result.status;
        for (const [projectField, featureField] of DATE_FIELDS) {
            for (const field of [projectField, featureField]) {
                const value = result[field];
                if (/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) result[field] = value.slice(0, 10);
            }
        }
        return result;
    });
    const located = lines.some((row) => featureLocations(row).length > 0);
    return { lines, message: lines.length === 0 ? "No projects after filtering."
        : located ? null : "No drawable features after filtering." };
}

export function getProjects(lines: MapFeature[], settings: NumberingSettings): ProjectEntry[] {
    const projects = new Map<string, ProjectEntry>();
    for (const line of lines) {
        if (!line.projectNumber) continue;
        let project = projects.get(line.projectNumber);
        if (!project) {
            project = { number: line.projectNumber, name: line.projectName || line.projectNumber, lines: [], label: "" };
            projects.set(project.number, project);
        }
        project.lines.push(line);
    }
    const sortValue = (project: ProjectEntry): string | number | null => {
        if (settings.sortBy === "projectNumber") return project.number;
        if (settings.sortBy === "projectName") return project.lines.find((row) => row.projectName)?.projectName ?? null;
        if (settings.sortBy === "projectGrossCapex") return project.lines.find((row) => row.projectGrossCapex !== null)?.projectGrossCapex ?? null;
        const date = project.lines.find((row) => row.isdDate)?.isdDate;
        const timestamp = date ? Date.parse(date) : NaN;
        return Number.isFinite(timestamp) ? timestamp : null;
    };
    const result = Array.from(projects.values()).filter((project) => project.lines.some((row) => featureLocations(row).length));
    result.sort((a, b) => {
        const av = sortValue(a), bv = sortValue(b);
        if (av === null && bv !== null) return 1;
        if (bv === null && av !== null) return -1;
        const order = av === null || bv === null ? 0 : typeof av === "number" && typeof bv === "number" ? av - bv
            : String(av).localeCompare(String(bv), undefined, { numeric: true });
        return order * (settings.sortDirection === "descending" ? -1 : 1)
            || a.number.localeCompare(b.number, undefined, { numeric: true }) || a.number.localeCompare(b.number);
    });
    result.forEach((project, index) => { project.label = settings.numberingMode === "map" ? String(index + 1) : project.number; });
    return result;
}

export function unlocatedProjects(lines: MapFeature[]): number {
    const locations = new Map<string, boolean>();
    for (const row of lines) {
        // Legacy rows without project IDs cannot be counted reliably as projects.
        if (row.projectNumber) locations.set(row.projectNumber, Boolean(locations.get(row.projectNumber)) || featureLocations(row).length > 0);
    }
    return Array.from(locations.values()).filter((located) => !located).length;
}

export function projectContracts(lines: MapFeature[]): MapFeature[] {
    const contracts = new Map<string, MapFeature>();
    for (const row of lines) {
        if (row.contractId || row.contractor || row.contractValue !== null || row.contractStatus) {
            const key = row.contractId || JSON.stringify([row.contractor, row.contractStatus, row.contractValue]);
            if (!contracts.has(key)) contracts.set(key, row);
        }
    }
    return Array.from(contracts.values());
}

export function getProjectValues(project: ProjectEntry, field: keyof MapFeature): string {
    // Costs are supplied amounts, not measures to sum across the flattened feature rows.
    const rows = ["contractValue", "contractor", "contractStatus", "contractId"].includes(field)
        ? projectContracts(project.lines) : project.lines;
    const values = rows.map((row) => row[field]).filter((value) => value !== null && value !== "" && value !== "Not supplied" && value !== "Unknown");
    if (field === "projectGrossCapex") {
        const distinct = Array.from(new Set(values));
        return distinct.length > 1 ? "Conflicting project amounts" : distinct.length ? Number(distinct[0]).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "";
    }
    return Array.from(new Set(values)).map((value) => typeof value === "number"
        ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(value)).join("; ");
}
