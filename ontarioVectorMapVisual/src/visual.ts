"use strict";

import powerbi from "powerbi-visuals-api";
import { createElement, IconNode, ZoomIn, ZoomOut, RotateCcw, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ListFilter, X } from "lucide";
import "./../style/visual.less";
import ontarioGeojson from "./data/ontario.json";
import greatLakesGeojson from "./data/great_lakes.json";
import ontarioPlacesJson from "./data/ontario_places.json";
import iconLicenses from "./data/icon_licenses.json";
import { MapFeature as TransmissionLine, ProjectEntry, ParsedRows, ProjectSort, parseTransmissionLines, getProjects, getProjectValues, featureLocations, unlocatedProjects, projectContracts, DATE_FIELDS } from "./project_model";

import DataView = powerbi.DataView;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

type Bounds = [number, number, number, number];
type Position = number[];
type Ring = Position[];
type Polygon = Ring[];
type MultiPolygon = Polygon[];

interface GeoFeature {
    geometry: {
        type: "Polygon" | "MultiPolygon";
        coordinates: Polygon | MultiPolygon;
    };
    properties?: Record<string, unknown>;
}

interface FeatureCollection {
    type: "FeatureCollection";
    bbox?: Bounds;
    features: GeoFeature[];
}

interface Point {
    x: number;
    y: number;
    halfWidth?: number;
    halfHeight?: number;
}

interface MapTransform {
    cosLatitude: number;
    scale: number;
    project: (longitude: number, latitude: number) => Point;
}

interface ViewState {
    centerLongitude: number;
    centerLatitude: number;
    zoom: number;
}


interface Place {
    name: string;
    longitude: number;
    latitude: number;
    population: number;
    scaleRank: number;
}

interface PlacesCollection {
    places: Place[];
}

type ColorMode = "voltage" | "outsourcing";
type LinePattern = "status" | "solid" | "dashed";
type LegendLabel = "projectName" | "circuitName" | "lineId";

interface VisualSettings {
    canvas: {
        backgroundColor: string;
        backgroundOpacity: number;
    };
    mapLayer: {
        landColor: string;
        landOpacity: number;
        lakesColor: string;
        lakesOpacity: number;
    };
    placeLabels: {
        show: boolean;
        color: string;
        size: number;
        opacity: number;
    };
    lines: {
        colorMode: ColorMode;
        linePattern: LinePattern;
        thicknessScale: number;
        thicknessByVoltage: boolean;
        insourcedColor: string;
        outsourcedColor: string;
    };
    voltageColors: {
        voltage115Color: string;
        voltage230Color: string;
        voltage345Color: string;
        voltage500Color: string;
        defaultColor: string;
    };
    projects: {
        show: boolean;
        numberingMode: "project" | "map";
        sortBy: ProjectSort;
        sortDirection: "ascending" | "descending";
        mapCircles: boolean;
        projectCircles: boolean;
        fontSize: number;
        bold: boolean;
        color: string;
        opacity: number;
    };
    glow: {
        enabled: boolean;
        matchLineColor: boolean;
        color: string;
        intensity: number;
        blurRadius: number;
    };
    legend: {
        showColorKey: boolean;
        showProjects: boolean;
        primaryLabel: LegendLabel;
        textSize: number;
        panelWidth: number;
        details: Record<string, boolean>;
    };
}

interface GeoLayerStyle {
    className: string;
    fill: string;
    stroke: string;
    opacity: number;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const ONTARIO = ontarioGeojson as unknown as FeatureCollection;
const GREAT_LAKES = greatLakesGeojson as unknown as FeatureCollection;
const ONTARIO_PLACES = (ontarioPlacesJson as unknown as PlacesCollection).places;
const ONTARIO_BOUNDS = getGeojsonBounds(ONTARIO);
const BASE_BOUNDS = expandBounds(ONTARIO_BOUNDS, 0.04);
const MIN_ZOOM = 1;
const MAX_ZOOM = 40;
const ZOOM_STEP = 1.35;
const PAN_FRACTION = 0.28;
let nextVisualId = 0;
const DEFAULT_SETTINGS: VisualSettings = {
    canvas: {
        backgroundColor: "#f8fbff",
        backgroundOpacity: 100,
    },
    mapLayer: {
        landColor: "#edf3ec",
        landOpacity: 100,
        lakesColor: "#8fc7df",
        lakesOpacity: 100,
    },
    placeLabels: {
        show: true,
        color: "#263238",
        size: 10,
        opacity: 100,
    },
    lines: {
        colorMode: "voltage",
        linePattern: "status",
        thicknessScale: 1,
        thicknessByVoltage: true,
        insourcedColor: "#2e7d57",
        outsourcedColor: "#1f6fbe",
    },
    voltageColors: {
        voltage115Color: "#2e7d57",
        voltage230Color: "#1f6f8b",
        voltage345Color: "#7b4ab8",
        voltage500Color: "#b12a34",
        defaultColor: "#607d8b",
    },
    projects: { show: false, numberingMode: "project", sortBy: "isdDate", sortDirection: "ascending",
        mapCircles: true, projectCircles: false, fontSize: 12, bold: true, color: "#263238", opacity: 100 },
    glow: { enabled: false, matchLineColor: true, color: "#ffdd55", intensity: 60, blurRadius: 4 },
    legend: {
        showColorKey: true,
        showProjects: false,
        primaryLabel: "projectName",
        textSize: 11,
        panelWidth: 240,
        details: {},
    },
};
const COLOR_MODE_ITEMS: powerbi.IEnumMember[] = [
    { value: "voltage", displayName: "Voltage colors" },
    { value: "outsourcing", displayName: "Outsourcing colors" },
];
const LINE_PATTERN_ITEMS: powerbi.IEnumMember[] = [
    { value: "status", displayName: "Status based" },
    { value: "solid", displayName: "Solid" },
    { value: "dashed", displayName: "Dashed" },
];
const LEGEND_LABEL_ITEMS: powerbi.IEnumMember[] = [
    { value: "projectName", displayName: "Project name" },
    { value: "circuitName", displayName: "Circuit name" },
    { value: "lineId", displayName: "Line ID" },
];
const NUMBERING_ITEMS: powerbi.IEnumMember[] = [
    { value: "project", displayName: "Actual project number" }, { value: "map", displayName: "Sequential map number" },
];
const SORT_ITEMS: powerbi.IEnumMember[] = [
    { value: "isdDate", displayName: "Project ISD date" }, { value: "projectNumber", displayName: "Project number" },
    { value: "projectName", displayName: "Project name" }, { value: "projectGrossCapex", displayName: "Project gross capex" },
];
const DIRECTION_ITEMS: powerbi.IEnumMember[] = [
    { value: "ascending", displayName: "Ascending" }, { value: "descending", displayName: "Descending" },
];
const LEGEND_FIELDS: { propertyName: string; field: keyof TransmissionLine; label: string }[] = [
    { propertyName: "showProjectGrossCapex", field: "projectGrossCapex", label: "Project gross capex" },
    { propertyName: "showContractId", field: "contractId", label: "Contract ID" },
    { propertyName: "showStationName", field: "stationName", label: "Station name" },
    { propertyName: "showCircuitName", field: "circuitName", label: "Circuit name" },
    { propertyName: "showTowerType", field: "towerType", label: "Tower type" },
    { propertyName: "showProjectStatus", field: "projectStatus", label: "Project status" },
    { propertyName: "showContractStatus", field: "contractStatus", label: "Contract status" },
    { propertyName: "showProjectStage", field: "projectStage", label: "Project stage" },
    { propertyName: "showDepartment", field: "departmentResponsible", label: "Department" },
    { propertyName: "showContractor", field: "contractor", label: "Contractor" },
    { propertyName: "showContractValue", field: "contractValue", label: "Contract value" },
    { propertyName: "showPlannedStart", field: "plannedStart", label: "Planned start" },
    { propertyName: "showPlannedFinish", field: "plannedFinish", label: "Planned finish" },
    { propertyName: "showRfpDate", field: "rfpDate", label: "RFP date" },
    { propertyName: "showBestReleaseDate", field: "bestReleaseDate", label: "BEST release" },
    { propertyName: "showDetlReleaseDate", field: "detlReleaseDate", label: "DETL release" },
    { propertyName: "showEmppReleaseDate", field: "emppReleaseDate", label: "EMPP release" },
    { propertyName: "showIsdDate", field: "isdDate", label: "ISD date" },
];

export class Visual implements IVisual {
    private readonly clipId = `ontario-map-clip-${nextVisualId++}`;
    private readonly events: IVisualEventService;
    private readonly host: IVisualHost;
    private readonly root: HTMLDivElement;
    private readonly svg: SVGSVGElement;
    private readonly tooltip: HTMLDivElement;
    private readonly projectLegend: HTMLDivElement;
    private readonly legendEditor: HTMLDivElement;
    private width = 0;
    private height = 0;
    private mapWidth = 0;
    private mapHeight = 0;
    private viewState: ViewState = createDefaultViewState();
    private currentRows: ParsedRows = { lines: [], message: "Add transmission line fields." };
    private currentSettings: VisualSettings = parseSettings(undefined);
    private currentProjects: ProjectEntry[] = [];
    private currentTransform: MapTransform | null = null;
    private dragState: { x: number; y: number } | null = null;

    constructor(options: VisualConstructorOptions) {
        this.events = options.host.eventService;
        this.host = options.host;

        this.root = document.createElement("div");
        this.root.className = "ontario-vector-map";

        this.svg = document.createElementNS(SVG_NS, "svg");
        this.svg.classList.add("map-canvas");
        this.svg.setAttribute("role", "img");
        this.svg.setAttribute("aria-label", "Ontario vector transmission map");

        this.tooltip = document.createElement("div");
        this.tooltip.className = "map-tooltip";
        this.tooltip.addEventListener("pointerleave", () => this.hideTooltip());

        this.projectLegend = document.createElement("div");
        this.projectLegend.className = "project-legend";
        this.projectLegend.setAttribute("aria-label", "Project legend");
        this.projectLegend.hidden = true;
        this.legendEditor = this.createLegendEditor();

        this.root.appendChild(this.svg);
        this.root.appendChild(this.createControls());
        this.root.appendChild(this.tooltip);
        this.root.appendChild(this.projectLegend);
        this.root.appendChild(this.legendEditor);
        options.element.appendChild(this.root);
        this.root.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                this.setLegendEditorOpen(false);
            }
        });
        this.root.addEventListener("pointerdown", (event) => {
            const element = event.target as Element;
            if (!element.closest(".legend-editor, .legend-settings-button")) {
                this.setLegendEditorOpen(false);
            }
        });

        this.attachViewportInteractions();
    }

    public update(options: VisualUpdateOptions): void {
        this.events.renderingStarted(options);

        try {
            this.width = Math.max(1, options.viewport.width);
            this.height = Math.max(1, options.viewport.height);
            const dataView = options.dataViews?.[0];
            this.currentSettings = parseSettings(dataView);
            this.currentRows = parseTransmissionLines(dataView);
            this.render();
            this.events.renderingFinished(options);
        } catch (error) {
            this.renderMessage(`Map render error: ${String(error)}`);
            this.events.renderingFailed(options, String(error));
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return buildFormattingModel(this.currentSettings);
    }

    private createControls(): HTMLDivElement {
        const controls = document.createElement("div");
        controls.className = "map-controls";

        const zoomIn = this.createButton(ZoomIn, "Zoom in", () => this.zoomBy(ZOOM_STEP));
        const zoomOut = this.createButton(ZoomOut, "Zoom out", () => this.zoomBy(1 / ZOOM_STEP));
        const reset = this.createButton(RotateCcw, "Reset view", () => this.resetView());
        const north = this.createButton(ArrowUp, "Pan north", () => this.pan(0, 1));
        const west = this.createButton(ArrowLeft, "Pan west", () => this.pan(-1, 0));
        const east = this.createButton(ArrowRight, "Pan east", () => this.pan(1, 0));
        const south = this.createButton(ArrowDown, "Pan south", () => this.pan(0, -1));
        const legend = this.createButton(ListFilter, "Legend settings", () => this.setLegendEditorOpen(this.legendEditor.hidden));
        legend.classList.add("legend-settings-button");
        legend.setAttribute("aria-expanded", "false");

        const rowOne = document.createElement("div");
        rowOne.className = "control-row";
        rowOne.append(zoomIn, zoomOut, reset, legend);

        const rowTwo = document.createElement("div");
        rowTwo.className = "control-row";
        rowTwo.append(north, west, east, south);

        controls.append(rowOne, rowTwo);
        return controls;
    }

    private createButton(icon: IconNode, title: string, action: () => void): HTMLButtonElement {
        const button = document.createElement("button");
        button.type = "button";
        button.appendChild(createElement(icon, { width: 16, height: 16, "aria-hidden": "true" }));
        button.title = title;
        button.setAttribute("aria-label", title);
        button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            action();
        });
        return button;
    }

    private createLegendEditor(): HTMLDivElement {
        const panel = document.createElement("div");
        panel.className = "legend-editor";
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-label", "Legend settings");
        panel.hidden = true;
        const heading = document.createElement("div");
        heading.className = "legend-editor-heading";
        const title = document.createElement("strong");
        title.textContent = "Legend";
        heading.append(title, this.createButton(X, "Close legend settings", () => this.setLegendEditorOpen(false)));
        panel.appendChild(heading);

        for (const item of [
            { propertyName: "showColorKey", label: "Line color key" },
            { propertyName: "showProjects", label: "Project list" },
            ...LEGEND_FIELDS,
        ]) {
            const label = document.createElement("label");
            const input = document.createElement("input");
            input.type = "checkbox";
            input.dataset.property = item.propertyName;
            input.addEventListener("change", () => this.changeLegendSetting(item.propertyName, input.checked));
            label.append(input, document.createTextNode(item.label));
            panel.appendChild(label);
        }
        const label = document.createElement("label");
        label.className = "legend-editor-select";
        label.appendChild(document.createTextNode("Primary label"));
        const select = document.createElement("select");
        select.setAttribute("aria-label", "Primary legend label");
        for (const item of LEGEND_LABEL_ITEMS) {
            const option = document.createElement("option");
            option.value = String(item.value);
            option.textContent = String(item.displayName);
            select.appendChild(option);
        }
        select.addEventListener("change", () => this.changeLegendSetting("primaryLabel", select.value));
        label.appendChild(select);
        panel.appendChild(label);
        return panel;
    }

    private setLegendEditorOpen(open: boolean): void {
        const hadFocus = this.legendEditor.contains(document.activeElement);
        this.legendEditor.hidden = !open;
        this.root.querySelector(".legend-settings-button")?.setAttribute("aria-expanded", String(open));
        if (open) {
            this.syncLegendEditor();
            this.legendEditor.querySelector("button")?.focus();
        } else if (hadFocus) {
            this.root.querySelector<HTMLButtonElement>(".legend-settings-button")?.focus();
        }
    }

    private syncLegendEditor(): void {
        for (const input of Array.from(this.legendEditor.querySelectorAll<HTMLInputElement>("input"))) {
            const property = input.dataset.property!;
            input.checked = property === "showColorKey" ? this.currentSettings.legend.showColorKey
                : property === "showProjects" ? this.currentSettings.legend.showProjects
                : Boolean(this.currentSettings.legend.details[property]);
        }
        this.legendEditor.querySelector("select")!.value = this.currentSettings.legend.primaryLabel;
    }

    private changeLegendSetting(propertyName: string, value: boolean | string): void {
        const legend = this.currentSettings.legend;
        if (LEGEND_FIELDS.some((field) => field.propertyName === propertyName)) {
            legend.details[propertyName] = Boolean(value);
        } else if (propertyName === "primaryLabel") {
            legend.primaryLabel = value as LegendLabel;
        } else if (propertyName === "showProjects") {
            legend.showProjects = Boolean(value);
        } else if (propertyName === "showColorKey") {
            legend.showColorKey = Boolean(value);
        }
        this.render();
        // Persist the same properties used by the native Format pane.
        this.host.persistProperties({ merge: [{ objectName: "legend", selector: null, properties: { [propertyName]: value } }] });
    }

    private attachViewportInteractions(): void {
        this.svg.addEventListener(
            "wheel",
            (event) => {
                event.preventDefault();
                this.zoomBy(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
            },
            { passive: false }
        );

        this.svg.addEventListener("pointerdown", (event) => {
            this.dragState = { x: event.clientX, y: event.clientY };
            this.svg.setPointerCapture(event.pointerId);
            this.svg.classList.add("is-dragging");
        });

        this.svg.addEventListener("pointermove", (event) => {
            if (!this.dragState || !this.currentTransform) {
                return;
            }

            const deltaX = event.clientX - this.dragState.x;
            const deltaY = event.clientY - this.dragState.y;
            this.dragState = { x: event.clientX, y: event.clientY };

            this.viewState.centerLongitude -= deltaX / (this.currentTransform.scale * this.currentTransform.cosLatitude);
            this.viewState.centerLatitude += deltaY / this.currentTransform.scale;
            this.render();
        });

        const clearDrag = (event: PointerEvent) => {
            if (this.dragState) {
                this.dragState = null;
                if (this.svg.hasPointerCapture(event.pointerId)) {
                    this.svg.releasePointerCapture(event.pointerId);
                }
                this.svg.classList.remove("is-dragging");
            }
        };

        this.svg.addEventListener("pointerup", clearDrag);
        this.svg.addEventListener("pointercancel", clearDrag);
        this.svg.addEventListener("pointerleave", clearDrag);
    }

    private zoomBy(factor: number): void {
        this.viewState.zoom = clamp(this.viewState.zoom * factor, MIN_ZOOM, MAX_ZOOM);
        this.render();
    }

    private pan(xDirection: number, yDirection: number): void {
        const extent = getViewExtent(this.viewState);
        const longitudeStep = (extent[2] - extent[0]) * PAN_FRACTION;
        const latitudeStep = (extent[3] - extent[1]) * PAN_FRACTION;

        this.viewState.centerLongitude += longitudeStep * xDirection;
        this.viewState.centerLatitude += latitudeStep * yDirection;
        this.render();
    }

    private resetView(): void {
        this.viewState = createDefaultViewState();
        this.render();
    }

    private render(): void {
        this.hideTooltip();
        this.syncLegendEditor();
        // Numbering depends on filtered data and formatting, never the current viewport.
        this.currentProjects = getProjects(this.currentRows.lines, this.currentSettings.projects);
        this.layoutProjectLegend();
        this.svg.setAttribute("width", String(this.width));
        this.svg.setAttribute("height", String(this.height));
        this.svg.setAttribute("viewBox", `0 0 ${this.width} ${this.height}`);
        removeChildren(this.svg);
        const metadata = createSvgElement("metadata");
        metadata.textContent = iconLicenses.notices.join("\n\n");
        this.svg.appendChild(metadata);

        const background = createSvgElement("rect");
        background.setAttribute("width", String(this.width));
        background.setAttribute("height", String(this.height));
        background.setAttribute("class", "map-background");
        background.setAttribute("fill", this.currentSettings.canvas.backgroundColor);
        background.setAttribute("opacity", opacityValue(this.currentSettings.canvas.backgroundOpacity));
        this.svg.appendChild(background);

        const clip = createSvgElement("clipPath");
        clip.setAttribute("id", this.clipId);
        const clipRect = createSvgElement("rect");
        clipRect.setAttribute("width", String(this.mapWidth));
        clipRect.setAttribute("height", String(this.mapHeight));
        clip.appendChild(clipRect);
        this.svg.appendChild(clip);

        const transform = createMapTransform(this.mapWidth, this.mapHeight, getViewExtent(this.viewState));
        this.currentTransform = transform;

        const mapLayer = createSvgElement("g");
        mapLayer.setAttribute("class", "map-layer");
        mapLayer.setAttribute("clip-path", `url(#${this.clipId})`);
        this.svg.appendChild(mapLayer);

        this.drawGeojsonLayer(mapLayer, ONTARIO, {
            className: "ontario-shape",
            fill: this.currentSettings.mapLayer.landColor,
            stroke: "#4f6353",
            opacity: this.currentSettings.mapLayer.landOpacity,
        }, transform);
        this.drawGeojsonLayer(mapLayer, GREAT_LAKES, {
            className: "lake-shape",
            fill: this.currentSettings.mapLayer.lakesColor,
            stroke: this.currentSettings.mapLayer.lakesColor,
            opacity: this.currentSettings.mapLayer.lakesOpacity,
        }, transform);
        this.drawTransmissionLines(mapLayer, transform);
        const markerPoints = this.drawProjectMarkers(mapLayer, transform);
        this.drawPlaceLabels(mapLayer, transform, markerPoints);
        this.drawLegend();
        this.drawLocationDiagnostic();

        if (this.currentRows.message) {
            this.drawSvgMessage(this.currentRows.message);
        }
    }

    private layoutProjectLegend(): void {
        this.mapWidth = this.width;
        this.mapHeight = this.height;
        this.projectLegend.hidden = !this.currentSettings.legend.showProjects;
        this.projectLegend.style.fontSize = `${this.currentSettings.legend.textSize}px`;
        removeChildren(this.projectLegend);
        if (this.projectLegend.hidden) {
            return;
        }

        // Reserve map space for the scrollable legend, including in narrow visuals.
        const compact = this.width < 480;
        this.projectLegend.classList.toggle("is-compact", compact);
        if (compact) {
            const panelHeight = Math.min(180, this.height * 0.32);
            this.mapHeight = Math.max(1, this.height - panelHeight - 16);
            this.projectLegend.style.height = `${panelHeight}px`;
            this.projectLegend.style.width = "";
        } else {
            const panelWidth = Math.min(this.currentSettings.legend.panelWidth, this.width * 0.42);
            this.mapWidth = this.width - panelWidth - 16;
            this.projectLegend.style.width = `${panelWidth}px`;
            this.projectLegend.style.height = "";
        }

        const title = document.createElement("div");
        title.className = "project-legend-title";
        title.textContent = this.currentSettings.legend.primaryLabel === "circuitName" ? "Circuits"
            : this.currentSettings.legend.primaryLabel === "lineId" ? "Lines" : "Projects";
        this.projectLegend.appendChild(title);

        const projects = this.currentProjects;
        for (const project of projects) {
            const row = document.createElement("div");
            row.className = "project-legend-row";
            row.dataset.projectNumber = String(project.number);
            const number = document.createElement("span");
            number.className = "project-legend-number";
            const labelStyle = this.projectLabelStyle(project.label);
            row.style.gridTemplateColumns = `${labelStyle.width}px minmax(0, 1fr)`;
            number.classList.toggle("has-circle", labelStyle.circle);
            number.style.width = `${labelStyle.width}px`;
            number.style.height = `${labelStyle.height}px`;
            number.style.fontSize = `${labelStyle.size}px`;
            number.style.fontWeight = this.currentSettings.projects.bold ? "700" : "400";
            number.style.color = this.currentSettings.projects.color;
            number.style.borderColor = this.currentSettings.projects.color;
            number.style.opacity = opacityValue(this.currentSettings.projects.opacity);
            number.textContent = project.label;
            number.title = `Project ${project.number}`;
            const content = document.createElement("div");
            content.className = "project-legend-content";
            const name = document.createElement("div");
            name.className = "project-legend-name";
            name.textContent = this.currentSettings.legend.primaryLabel === "projectName" ? project.name
                : getProjectValues(project, this.currentSettings.legend.primaryLabel) || project.name;
            content.appendChild(name);
            for (const field of LEGEND_FIELDS) {
                if (!this.currentSettings.legend.details[field.propertyName] || field.field === this.currentSettings.legend.primaryLabel) {
                    continue;
                }
                const value = getProjectValues(project, field.field);
                if (value) {
                    const detail = document.createElement("div");
                    detail.className = "project-legend-detail";
                    detail.textContent = `${field.label}: ${value}`;
                    content.appendChild(detail);
                }
            }
            row.append(number, content);
            this.projectLegend.appendChild(row);
        }

        const missingProjects = this.currentRows.lines.filter((line) =>
            line.projectNumber === null
        ).length;
        if (projects.length === 0 || missingProjects > 0) {
            const note = document.createElement("div");
            note.className = "project-legend-note";
            note.textContent = this.currentRows.lines.length === 0
                ? "No projects in the filtered data."
                : "No located projects, or some rows lack Project Number. Unlocated projects are counted on the map.";
            this.projectLegend.appendChild(note);
        }
    }

    private drawProjectMarkers(parent: SVGElement, transform: MapTransform): Point[] {
        if (!this.currentSettings.projects.show) {
            return [];
        }

        const projects = new Map(this.currentProjects.map((project) => [project.number, project]));
        const stationLabels = new Set<string>();
        const points: Point[] = [];
        const markerLayer = createSvgElement("g");
        markerLayer.setAttribute("class", "project-marker-layer");
        parent.appendChild(markerLayer);
        const controlsBox = this.root.querySelector(".map-controls")?.getBoundingClientRect();
        const controlsWidth = (controlsBox?.width || 130) + 16;
        const controlsHeight = (controlsBox?.height || 100) + 16;
        const keyCount = getLegendItems(this.currentRows.lines, this.currentSettings).length;
        const legendTop = keyCount ? this.mapHeight - 44 - keyCount * 18 : Infinity;

        for (const line of this.currentRows.lines) {
            const project = line.projectNumber === null ? undefined : projects.get(line.projectNumber);
            const locations = featureLocations(line);
            if (!project || !locations.length) {
                continue;
            }
            if (line.featureType.toLowerCase() === "substation") {
                const key = `${project.number}:${stationKey(line)}`;
                if (stationLabels.has(key)) continue;
                stationLabels.add(key);
            }
            const labelStyle = this.projectLabelStyle(project.label);
            const halfWidth = labelStyle.width / 2 + 3, halfHeight = labelStyle.height / 2 + 3;
            const midpoint = transform.project(
                locations.reduce((sum, point) => sum + point.longitude, 0) / locations.length,
                locations.reduce((sum, point) => sum + point.latitude, 0) / locations.length
            );
            if (midpoint.x < 0 || midpoint.x > this.mapWidth || midpoint.y < 0 || midpoint.y > this.mapHeight) {
                continue;
            }

            // Move crowded badges slightly and keep a leader to their segment midpoint.
            let point = midpoint;
            let placed = false;
            for (let radius = 0; radius <= Math.max(this.mapWidth, this.mapHeight); radius += 30) {
                const count = radius === 0 ? 1 : Math.ceil(2 * Math.PI * radius / 30);
                for (let step = 0; step < count; step++) {
                    const angle = step * 2 * Math.PI / count;
                    const candidate = { x: midpoint.x + radius * Math.cos(angle), y: midpoint.y + radius * Math.sin(angle) };
                    if (candidate.x < halfWidth || candidate.x > this.mapWidth - halfWidth || candidate.y < halfHeight || candidate.y > this.mapHeight - halfHeight) {
                        continue;
                    }
                    if ((candidate.x - halfWidth < controlsWidth && candidate.y - halfHeight < controlsHeight) ||
                        (candidate.x - halfWidth < 150 && candidate.y + halfHeight > legendTop) ||
                        (candidate.x + halfWidth > this.mapWidth - 190 && candidate.y + halfHeight > this.mapHeight - 26) ||
                        points.some((other) => Math.abs(candidate.x - other.x) < halfWidth + (other.halfWidth || 16) &&
                            Math.abs(candidate.y - other.y) < halfHeight + (other.halfHeight || 16))) {
                        continue;
                    }
                    point = candidate;
                    placed = true;
                    break;
                }
                if (placed) {
                    break;
                }
            }
            if (!placed) {
                continue;
            }
            points.push({ ...point, halfWidth, halfHeight });
            const leader = createSvgElement("line");
            leader.setAttribute("class", "project-leader");
            leader.setAttribute("x1", formatNumber(midpoint.x));
            leader.setAttribute("y1", formatNumber(midpoint.y));
            leader.setAttribute("x2", formatNumber(point.x));
            leader.setAttribute("y2", formatNumber(point.y));
            markerLayer.appendChild(leader);

            const badge = createSvgElement("g");
            badge.setAttribute("class", "project-marker");
            badge.setAttribute("transform", `translate(${formatNumber(point.x)} ${formatNumber(point.y)})`);
            badge.dataset.projectNumber = String(line.projectNumber);
            badge.dataset.mapLabel = project.label;
            badge.setAttribute("opacity", opacityValue(this.currentSettings.projects.opacity));
            if (labelStyle.circle) {
                const circle = createSvgElement("circle");
                circle.setAttribute("r", String(labelStyle.width / 2));
                circle.style.stroke = this.currentSettings.projects.color;
                badge.appendChild(circle);
            }
            const text = createSvgElement("text");
            text.setAttribute("font-size", String(labelStyle.size));
            text.style.fill = this.currentSettings.projects.color;
            text.style.fontWeight = this.currentSettings.projects.bold ? "700" : "400";
            text.textContent = project.label;
            const title = createSvgElement("title");
            title.textContent = `${line.projectNumber}: ${line.projectName}`;
            badge.append(text, title);
            this.attachTooltip(badge, line);
            markerLayer.appendChild(badge);
        }
        return points;
    }

    private projectLabelStyle(label: string): { width: number; height: number; size: number; circle: boolean } {
        const settings = this.currentSettings.projects;
        const circle = settings.numberingMode === "map" ? settings.mapCircles : settings.projectCircles;
        const size = Math.min(settings.fontSize, Math.max(6, (this.mapWidth - 12) / (label.length * 0.65)));
        const width = Math.max(28, label.length * size * 0.65 + 10);
        return { width, height: circle ? width : Math.max(24, size + 8), size, circle };
    }

    private drawGeojsonLayer(
        parent: SVGElement,
        collection: FeatureCollection,
        style: GeoLayerStyle,
        transform: MapTransform
    ): void {
        for (const feature of collection.features) {
            for (const polygon of iterPolygons(feature.geometry)) {
                const pathData = polygonToPath(polygon, transform);
                if (!pathData) {
                    continue;
                }

                const path = createSvgElement("path");
                path.setAttribute("d", pathData);
                path.setAttribute("class", style.className);
                path.setAttribute("fill", style.fill);
                path.setAttribute("stroke", style.stroke);
                path.setAttribute("opacity", opacityValue(style.opacity));
                path.setAttribute("fill-rule", "evenodd");
                parent.appendChild(path);
            }
        }
    }

    private drawTransmissionLines(parent: SVGElement, transform: MapTransform): void {
        const glow = this.currentSettings.glow;
        const glowLayer = createSvgElement("g");
        glowLayer.setAttribute("class", "line-glow-layer");
        glowLayer.setAttribute("pointer-events", "none");
        parent.appendChild(glowLayer);
        if (glow.enabled) {
            const filter = createSvgElement("filter");
            filter.id = `${this.clipId}-glow`;
            filter.setAttribute("filterUnits", "userSpaceOnUse");
            filter.setAttribute("x", String(-glow.blurRadius * 4 - 30));
            filter.setAttribute("y", String(-glow.blurRadius * 4 - 30));
            filter.setAttribute("width", String(this.mapWidth + glow.blurRadius * 8 + 60));
            filter.setAttribute("height", String(this.mapHeight + glow.blurRadius * 8 + 60));
            const blur = createSvgElement("feGaussianBlur");
            blur.setAttribute("stdDeviation", String(glow.blurRadius));
            filter.appendChild(blur);
            this.svg.appendChild(filter);
            glowLayer.setAttribute("filter", `url(#${filter.id})`);
        }
        const lineLayer = createSvgElement("g");
        lineLayer.setAttribute("class", "line-layer");
        parent.appendChild(lineLayer);

        for (const line of this.currentRows.lines) {
            const locations = featureLocations(line);
            if (!locations.length || line.featureType.toLowerCase() === "substation") continue;
            const from = transform.project(locations[0].longitude, locations[0].latitude);
            const style = getLineStyle(line, this.currentSettings);
            if (locations.length === 1) {
                this.drawNode(lineLayer, from, line, true);
                continue;
            }
            const to = transform.project(locations[1].longitude, locations[1].latitude);

            const segment = createSvgElement("line");
            segment.setAttribute("x1", formatNumber(from.x));
            segment.setAttribute("y1", formatNumber(from.y));
            segment.setAttribute("x2", formatNumber(to.x));
            segment.setAttribute("y2", formatNumber(to.y));
            segment.setAttribute("class", `transmission-line ${style.statusClass}`);
            segment.setAttribute("stroke", style.color);
            segment.setAttribute("stroke-width", String(style.width));
            segment.setAttribute("stroke-dasharray", style.dashArray);
            segment.dataset.featureId = line.featureId;
            if (glow.enabled) {
                const halo = segment.cloneNode(true) as SVGElement;
                halo.setAttribute("class", "line-glow");
                halo.setAttribute("stroke", glow.matchLineColor ? style.color : glow.color);
                halo.setAttribute("stroke-width", String(style.width + glow.blurRadius * 2));
                halo.setAttribute("opacity", opacityValue(glow.intensity));
                halo.setAttribute("stroke-linecap", "round");
                glowLayer.appendChild(halo);
            }
            this.attachTooltip(segment, line);
            lineLayer.appendChild(segment);

            this.drawNode(lineLayer, from, line);
            this.drawNode(lineLayer, to, line);
        }
        this.drawStations(lineLayer, transform);
    }

    private drawNode(parent: SVGElement, point: Point, line: TransmissionLine, single = false): void {
        const node = createSvgElement("circle");
        node.setAttribute("cx", formatNumber(point.x));
        node.setAttribute("cy", formatNumber(point.y));
        node.setAttribute("r", single ? "5" : "3.5");
        node.setAttribute("class", single ? "line-node single-location" : "line-node");
        node.setAttribute("fill", getLineStyle(line, this.currentSettings).color);
        node.dataset.featureId = line.featureId;
        this.attachTooltip(node, line);
        parent.appendChild(node);
    }

    private drawStations(parent: SVGElement, transform: MapTransform): void {
        const stations = new Map<string, TransmissionLine[]>();
        for (const row of this.currentRows.lines) {
            if (row.featureType.toLowerCase() !== "substation" || !featureLocations(row).length) continue;
            const key = stationKey(row);
            stations.set(key, [...(stations.get(key) || []), row]);
        }
        for (const [key, rows] of stations) {
            const location = featureLocations(rows[0])[0];
            const point = transform.project(location.longitude, location.latitude);
            const pin = createSvgElement("g");
            pin.setAttribute("class", "station-marker");
            pin.dataset.stationId = key;
            pin.setAttribute("transform", `translate(${formatNumber(point.x)} ${formatNumber(point.y)})`);
            const colors = Array.from(new Set(rows.map((row) => getLineStyle(row, this.currentSettings).color)));
            const mixed = this.currentSettings.lines.colorMode === "outsourcing" &&
                rows.some((row) => row.outsourcingStrategy.toUpperCase() === "IN") &&
                rows.some((row) => row.outsourcingStrategy.toUpperCase() === "OUT");
            for (let i = 0; i < (mixed ? 2 : 1); i++) {
                const shape = createSvgElement("path");
                shape.setAttribute("d", mixed ? (i === 0 ? "M0,-7 L-7,0 L0,7 Z" : "M0,-7 L7,0 L0,7 Z") : "M0,-7 L7,0 L0,7 L-7,0 Z");
                shape.setAttribute("fill", mixed ? (i === 0 ? this.currentSettings.lines.insourcedColor : this.currentSettings.lines.outsourcedColor) : colors[0]);
                pin.appendChild(shape);
            }
            const outline = createSvgElement("path");
            outline.setAttribute("d", "M0,-7 L7,0 L0,7 L-7,0 Z");
            outline.setAttribute("fill", "none");
            outline.setAttribute("stroke", "white");
            outline.setAttribute("stroke-width", "1.3");
            pin.appendChild(outline);
            pin.addEventListener("pointermove", (event) => {
                const details = [`Substation: ${rows[0].stationName || key}`, `Station ID: ${key}`];
                const projects = new Map<string, TransmissionLine[]>();
                for (const row of rows) {
                    const id = row.projectNumber || row.lineId;
                    projects.set(id, [...(projects.get(id) || []), row]);
                }
                for (const [id, associations] of projects) {
                    const project = { number: id, name: associations[0].projectName, lines: associations, label: id };
                    details.push(`Project ${id}: ${project.name || associations[0].lineId}`,
                        `Project gross capex: ${getProjectValues(project, "projectGrossCapex") || "Not supplied"}`,
                        `Department: ${getProjectValues(project, "departmentResponsible") || "Not supplied"}`,
                        `Project status: ${getProjectValues(project, "projectStatus") || "Not supplied"}`,
                        `Project stage: ${getProjectValues(project, "projectStage") || "Not supplied"}`,
                        `${id} contracts: ${getProjectValues(project, "contractId") || "Not supplied"}`,
                        `${id} strategies: ${getProjectValues(project, "outsourcingStrategy") || "Not supplied"}`);
                }
                details.push(`Strategies: ${Array.from(new Set(rows.map((row) => row.outsourcingStrategy || "Not supplied"))).join(" / ")}`);
                for (const contract of projectContracts(rows)) details.push(`Contract ${contract.contractId || "Not supplied"}: ${contract.contractor || "Not supplied"}; ${contract.contractStatus || "Not supplied"}; ${formatAmount(contract.contractValue)}`);
                for (const row of rows) details.push(...effectiveDateDetails(row).map((date) => `${row.projectNumber || row.lineId}: ${date}`));
                this.renderTooltip(event, Array.from(new Set(details)));
            });
            pin.addEventListener("pointerleave", (event) => {
                if (!(event.relatedTarget instanceof Node) || !this.tooltip.contains(event.relatedTarget)) this.hideTooltip();
            });
            parent.appendChild(pin);
        }
    }

    private drawPlaceLabels(parent: SVGElement, transform: MapTransform, markerPoints: Point[]): void {
        if (!this.currentSettings.placeLabels.show) {
            return;
        }

        const labelLayer = createSvgElement("g");
        labelLayer.setAttribute("class", "place-label-layer");
        labelLayer.setAttribute("opacity", opacityValue(this.currentSettings.placeLabels.opacity));
        parent.appendChild(labelLayer);

        const visiblePlaces = getVisiblePlaces(this.viewState.zoom);
        const labelBoxes: { left: number; right: number; top: number; bottom: number }[] = [];
        for (const place of visiblePlaces) {
            const point = transform.project(place.longitude, place.latitude);
            const labelWidth = place.name.length * this.currentSettings.placeLabels.size * 0.6;
            const box = { left: point.x + 4, right: point.x + 4 + labelWidth,
                top: point.y - 4 - this.currentSettings.placeLabels.size, bottom: point.y };
            if (box.left < 0 || box.right > this.mapWidth || box.top < 0 || box.bottom > this.mapHeight ||
                labelBoxes.some((other) => box.left < other.right + 3 && box.right > other.left - 3 &&
                    box.top < other.bottom + 3 && box.bottom > other.top - 3)) {
                continue;
            }
            if (markerPoints.some((marker) => marker.x + (marker.halfWidth || 16) > point.x + 4 && marker.x - (marker.halfWidth || 16) < point.x + 4 + labelWidth &&
                marker.y + (marker.halfHeight || 16) > point.y - 4 - this.currentSettings.placeLabels.size && marker.y - (marker.halfHeight || 16) < point.y)) {
                continue;
            }
            labelBoxes.push(box);
            const halo = createSvgElement("text");
            halo.setAttribute("x", formatNumber(point.x + 4));
            halo.setAttribute("y", formatNumber(point.y - 4));
            halo.setAttribute("class", "place-label-halo");
            halo.setAttribute("font-size", String(this.currentSettings.placeLabels.size));
            halo.textContent = place.name;
            labelLayer.appendChild(halo);

            const text = createSvgElement("text");
            text.setAttribute("x", formatNumber(point.x + 4));
            text.setAttribute("y", formatNumber(point.y - 4));
            text.setAttribute("class", "place-label");
            text.setAttribute("fill", this.currentSettings.placeLabels.color);
            text.setAttribute("font-size", String(this.currentSettings.placeLabels.size));
            text.textContent = place.name;
            labelLayer.appendChild(text);
        }
    }

    private drawLegend(): void {
        const legendItems = getLegendItems(this.currentRows.lines, this.currentSettings);

        if (legendItems.length === 0) {
            return;
        }

        const legend = createSvgElement("g");
        legend.setAttribute("class", "map-legend");
        const x = 14;
        const y = Math.max(50, this.mapHeight - 24 - legendItems.length * 18);

        const background = createSvgElement("rect");
        background.setAttribute("x", String(x - 8));
        background.setAttribute("y", String(y - 12));
        background.setAttribute("width", "126");
        background.setAttribute("height", String(legendItems.length * 18 + 22));
        background.setAttribute("rx", "4");
        background.setAttribute("class", "legend-background");
        legend.appendChild(background);

        const title = createSvgElement("text");
        title.setAttribute("x", String(x));
        title.setAttribute("y", String(y));
        title.setAttribute("class", "legend-title");
        title.textContent = `Zoom ${this.viewState.zoom.toFixed(1)}x`;
        legend.appendChild(title);

        legendItems.forEach((item, index) => {
            const rowY = y + 16 + index * 18;
            const sample = createSvgElement("line");
            sample.setAttribute("x1", String(x));
            sample.setAttribute("y1", String(rowY));
            sample.setAttribute("x2", String(x + 28));
            sample.setAttribute("y2", String(rowY));
            sample.setAttribute("stroke", item.color);
            sample.setAttribute("stroke-width", String(item.width));
            sample.setAttribute("stroke-linecap", "round");
            sample.setAttribute("stroke-dasharray", item.dashArray);
            legend.appendChild(sample);

            const label = createSvgElement("text");
            label.setAttribute("x", String(x + 38));
            label.setAttribute("y", String(rowY + 4));
            label.setAttribute("class", "legend-label");
            label.textContent = item.label;
            legend.appendChild(label);
        });

        this.svg.appendChild(legend);
    }

    private attachTooltip(element: SVGElement, line: TransmissionLine): void {
        element.addEventListener("pointermove", (event) => {
            this.showTooltip(event, line);
        });
        element.addEventListener("pointerleave", (event) => {
            if (!(event.relatedTarget instanceof Node) || !this.tooltip.contains(event.relatedTarget)) {
                this.hideTooltip();
            }
        });
    }

    private showTooltip(event: PointerEvent, line: TransmissionLine): void {
        const details = [
            line.lineId,
            `Feature type: ${line.featureType}`,
            ...(line.projectNumber === null ? [] : [`Project ${line.projectNumber}: ${line.projectName || "Not supplied"}`]),
            `Project gross capex: ${formatAmount(line.projectGrossCapex)}`,
            `Department: ${line.departmentResponsible}`,
            `Contract ID: ${line.contractId || "Not supplied"}`,
            `Contractor: ${line.contractor}`,
            `Contract value: ${line.contractValue === null ? "Not supplied" : line.contractValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
            `${line.voltageKv} kV`,
            `Circuit: ${line.circuitName || "Not supplied"}`,
            `Tower type: ${line.towerType || "Not supplied"}`,
            `Project status: ${line.projectStatus || "Not supplied"}`,
            `Contract status: ${line.contractStatus || "Not supplied"}`,
            `Project stage: ${line.projectStage || "Not supplied"}`,
            `Strategy: ${line.outsourcingStrategy}`,
            ...effectiveDateDetails(line),
        ];
        this.renderTooltip(event, details);
    }

    private renderTooltip(event: PointerEvent, details: string[]): void {
        removeChildren(this.tooltip);
        for (const value of details) {
            const row = document.createElement("div");
            row.textContent = value;
            this.tooltip.appendChild(row);
        }

        const rootBox = this.root.getBoundingClientRect();
        this.tooltip.classList.add("is-visible");
        this.tooltip.style.left = `${clamp(event.clientX - rootBox.left + 12, 0, Math.max(0, this.width - this.tooltip.offsetWidth))}px`;
        this.tooltip.style.top = `${clamp(event.clientY - rootBox.top + 12, 0, Math.max(0, this.height - this.tooltip.offsetHeight))}px`;
    }

    private hideTooltip(): void {
        this.tooltip.classList.remove("is-visible");
    }

    private drawLocationDiagnostic(): void {
        const text = createSvgElement("text");
        text.setAttribute("class", "location-diagnostic");
        text.setAttribute("x", String(Math.max(8, this.mapWidth - 8)));
        text.setAttribute("y", String(Math.max(12, this.mapHeight - 8)));
        text.setAttribute("text-anchor", "end");
        text.textContent = `Projects without location: ${unlocatedProjects(this.currentRows.lines)}`;
        this.svg.appendChild(text);
    }

    private drawSvgMessage(message: string): void {
        const group = createSvgElement("g");
        group.setAttribute("class", "map-message");

        const text = createSvgElement("text");
        text.setAttribute("x", String(this.mapWidth / 2));
        text.setAttribute("y", String(Math.max(32, this.mapHeight - 24)));
        text.setAttribute("text-anchor", "middle");
        text.textContent = message;
        group.appendChild(text);
        this.svg.appendChild(group);
    }

    private renderMessage(message: string): void {
        removeChildren(this.svg);
        this.svg.setAttribute("width", String(this.width));
        this.svg.setAttribute("height", String(this.height));
        this.drawSvgMessage(message);
    }
}


function parseSettings(dataView: DataView | undefined): VisualSettings {
    const objects = dataView?.metadata?.objects;

    return {
        canvas: {
            backgroundColor: getColor(objects, "canvas", "backgroundColor", DEFAULT_SETTINGS.canvas.backgroundColor),
            backgroundOpacity: getNumber(objects, "canvas", "backgroundOpacity", DEFAULT_SETTINGS.canvas.backgroundOpacity),
        },
        mapLayer: {
            landColor: getColor(objects, "mapLayer", "landColor", DEFAULT_SETTINGS.mapLayer.landColor),
            landOpacity: getNumber(objects, "mapLayer", "landOpacity", DEFAULT_SETTINGS.mapLayer.landOpacity),
            lakesColor: getColor(objects, "mapLayer", "lakesColor", DEFAULT_SETTINGS.mapLayer.lakesColor),
            lakesOpacity: getNumber(objects, "mapLayer", "lakesOpacity", DEFAULT_SETTINGS.mapLayer.lakesOpacity),
        },
        placeLabels: {
            show: getBoolean(objects, "placeLabels", "show", DEFAULT_SETTINGS.placeLabels.show),
            color: getColor(objects, "placeLabels", "color", DEFAULT_SETTINGS.placeLabels.color),
            size: clamp(getNumber(objects, "placeLabels", "size", DEFAULT_SETTINGS.placeLabels.size), 6, 24),
            opacity: getNumber(objects, "placeLabels", "opacity", DEFAULT_SETTINGS.placeLabels.opacity),
        },
        lines: {
            colorMode: getEnum(objects, "lines", "colorMode", DEFAULT_SETTINGS.lines.colorMode) as ColorMode,
            linePattern: getEnum(objects, "lines", "linePattern", DEFAULT_SETTINGS.lines.linePattern) as LinePattern,
            thicknessScale: clamp(getNumber(objects, "lines", "thicknessScale", DEFAULT_SETTINGS.lines.thicknessScale), 0.25, 5),
            thicknessByVoltage: getBoolean(objects, "lines", "thicknessByVoltage", DEFAULT_SETTINGS.lines.thicknessByVoltage),
            insourcedColor: getColor(objects, "lines", "insourcedColor", DEFAULT_SETTINGS.lines.insourcedColor),
            outsourcedColor: getColor(objects, "lines", "outsourcedColor", DEFAULT_SETTINGS.lines.outsourcedColor),
        },
        voltageColors: {
            voltage115Color: getColor(objects, "voltageColors", "voltage115Color", DEFAULT_SETTINGS.voltageColors.voltage115Color),
            voltage230Color: getColor(objects, "voltageColors", "voltage230Color", DEFAULT_SETTINGS.voltageColors.voltage230Color),
            voltage345Color: getColor(objects, "voltageColors", "voltage345Color", DEFAULT_SETTINGS.voltageColors.voltage345Color),
            voltage500Color: getColor(objects, "voltageColors", "voltage500Color", DEFAULT_SETTINGS.voltageColors.voltage500Color),
            defaultColor: getColor(objects, "voltageColors", "defaultColor", DEFAULT_SETTINGS.voltageColors.defaultColor),
        },
        projects: {
            show: getBoolean(objects, "projects", "show", DEFAULT_SETTINGS.projects.show),
            numberingMode: getChoice(objects, "projects", "numberingMode", "project", NUMBERING_ITEMS) as "project" | "map",
            sortBy: getChoice(objects, "projects", "sortBy", "isdDate", SORT_ITEMS) as ProjectSort,
            sortDirection: getChoice(objects, "projects", "sortDirection", "ascending", DIRECTION_ITEMS) as "ascending" | "descending",
            mapCircles: getBoolean(objects, "projects", "mapCircles", true),
            projectCircles: getBoolean(objects, "projects", "projectCircles", false),
            fontSize: clamp(getNumber(objects, "projects", "fontSize", 12), 6, 24),
            bold: getBoolean(objects, "projects", "bold", true),
            color: getColor(objects, "projects", "color", "#263238"),
            opacity: getNumber(objects, "projects", "opacity", 100),
        },
        glow: {
            enabled: getBoolean(objects, "glow", "enabled", false),
            matchLineColor: getBoolean(objects, "glow", "matchLineColor", true),
            color: getColor(objects, "glow", "color", DEFAULT_SETTINGS.glow.color),
            intensity: clamp(getNumber(objects, "glow", "intensity", 60), 0, 100),
            blurRadius: clamp(getNumber(objects, "glow", "blurRadius", 4), 0, 20),
        },
        legend: {
            showColorKey: getBoolean(objects, "legend", "showColorKey", DEFAULT_SETTINGS.legend.showColorKey),
            // Preserve the paired badge/legend behavior of reports built with version 1.2.
            showProjects: getBoolean(objects, "legend", "showProjects",
                getBoolean(objects, "projects", "show", DEFAULT_SETTINGS.projects.show)),
            primaryLabel: getEnum(objects, "legend", "primaryLabel", DEFAULT_SETTINGS.legend.primaryLabel) as LegendLabel,
            textSize: clamp(getNumber(objects, "legend", "textSize", DEFAULT_SETTINGS.legend.textSize), 8, 18),
            panelWidth: clamp(getNumber(objects, "legend", "panelWidth", DEFAULT_SETTINGS.legend.panelWidth), 160, 400),
            details: Object.fromEntries(LEGEND_FIELDS.map((field) => [field.propertyName,
                getBoolean(objects, "legend", field.propertyName, false)])),
        },
    };
}

function buildFormattingModel(settings: VisualSettings): powerbi.visuals.FormattingModel {
    return {
        cards: [
            createFormattingCard("canvas", "Canvas", [
                colorSlice("canvas", "backgroundColor", "Background color", settings.canvas.backgroundColor),
                numberSlice("canvas", "backgroundOpacity", "Background opacity", settings.canvas.backgroundOpacity, 0, 100, "%"),
            ]),
            createFormattingCard("mapLayer", "Map layers", [
                colorSlice("mapLayer", "landColor", "Ontario color", settings.mapLayer.landColor),
                numberSlice("mapLayer", "landOpacity", "Ontario opacity", settings.mapLayer.landOpacity, 0, 100, "%"),
                colorSlice("mapLayer", "lakesColor", "Lakes color", settings.mapLayer.lakesColor),
                numberSlice("mapLayer", "lakesOpacity", "Lakes opacity", settings.mapLayer.lakesOpacity, 0, 100, "%"),
            ]),
            createFormattingCard("placeLabels", "City and town labels", [
                toggleSlice("placeLabels", "show", "Show labels", settings.placeLabels.show),
                colorSlice("placeLabels", "color", "Label color", settings.placeLabels.color),
                numberSlice("placeLabels", "size", "Label size", settings.placeLabels.size, 6, 24, "px"),
                numberSlice("placeLabels", "opacity", "Label opacity", settings.placeLabels.opacity, 0, 100, "%"),
            ]),
            createFormattingCard("lines", "Transmission lines", [
                dropdownSlice("lines", "colorMode", "Color mode", settings.lines.colorMode, COLOR_MODE_ITEMS),
                dropdownSlice("lines", "linePattern", "Line pattern", settings.lines.linePattern, LINE_PATTERN_ITEMS),
                numberSlice("lines", "thicknessScale", "Thickness scale", settings.lines.thicknessScale, 0.25, 5, "x"),
                toggleSlice("lines", "thicknessByVoltage", "Thickness by voltage", settings.lines.thicknessByVoltage),
                colorSlice("lines", "insourcedColor", "Insourced color", settings.lines.insourcedColor),
                colorSlice("lines", "outsourcedColor", "Outsourced color", settings.lines.outsourcedColor),
            ]),
            createFormattingCard("voltageColors", "Voltage colors", [
                colorSlice("voltageColors", "voltage115Color", "115 kV", settings.voltageColors.voltage115Color),
                colorSlice("voltageColors", "voltage230Color", "230 kV", settings.voltageColors.voltage230Color),
                colorSlice("voltageColors", "voltage345Color", "345 kV", settings.voltageColors.voltage345Color),
                colorSlice("voltageColors", "voltage500Color", "500 kV", settings.voltageColors.voltage500Color),
                colorSlice("voltageColors", "defaultColor", "Other voltage", settings.voltageColors.defaultColor),
            ]),
            createFormattingCard("projects", "Projects", [
                toggleSlice("projects", "show", "Show project numbers", settings.projects.show),
                dropdownSlice("projects", "numberingMode", "Numbering mode", settings.projects.numberingMode, NUMBERING_ITEMS),
                dropdownSlice("projects", "sortBy", "Sort projects by", settings.projects.sortBy, SORT_ITEMS),
                dropdownSlice("projects", "sortDirection", "Sort direction", settings.projects.sortDirection, DIRECTION_ITEMS),
                toggleSlice("projects", "mapCircles", "Circles for map numbers", settings.projects.mapCircles),
                toggleSlice("projects", "projectCircles", "Circles for project numbers", settings.projects.projectCircles),
                numberSlice("projects", "fontSize", "Label size", settings.projects.fontSize, 6, 24, "px"),
                toggleSlice("projects", "bold", "Bold labels", settings.projects.bold),
                colorSlice("projects", "color", "Label color", settings.projects.color),
                numberSlice("projects", "opacity", "Label opacity", settings.projects.opacity, 0, 100, "%"),
            ]),
            createFormattingCard("glow", "Line glow", [
                toggleSlice("glow", "enabled", "Enable glow", settings.glow.enabled),
                toggleSlice("glow", "matchLineColor", "Match line color", settings.glow.matchLineColor),
                colorSlice("glow", "color", "Custom glow color", settings.glow.color),
                numberSlice("glow", "intensity", "Intensity", settings.glow.intensity, 0, 100, "%"),
                numberSlice("glow", "blurRadius", "Blur radius", settings.glow.blurRadius, 0, 20, "px"),
            ]),
            createFormattingCard("legend", "Legend", [
                toggleSlice("legend", "showColorKey", "Show line color key", settings.legend.showColorKey),
                toggleSlice("legend", "showProjects", "Show project list", settings.legend.showProjects),
                dropdownSlice("legend", "primaryLabel", "Primary label", settings.legend.primaryLabel, LEGEND_LABEL_ITEMS),
                numberSlice("legend", "textSize", "Text size", settings.legend.textSize, 8, 18, "px"),
                numberSlice("legend", "panelWidth", "Panel width", settings.legend.panelWidth, 160, 400, "px"),
                ...LEGEND_FIELDS.map((field) => toggleSlice("legend", field.propertyName,
                    `Show ${field.label.toLowerCase()}`, settings.legend.details[field.propertyName])),
            ]),
        ],
    };
}

function createFormattingCard(
    objectName: string,
    displayName: string,
    slices: powerbi.visuals.FormattingSlice[]
): powerbi.visuals.FormattingCard {
    return {
        uid: `${objectName}Card`,
        displayName,
        groups: [
            {
                uid: `${objectName}Group`,
                displayName: "Options",
                slices,
            },
        ],
        revertToDefaultDescriptors: slices.map((slice) => {
            const control = slice.control as powerbi.visuals.FormattingSimpleControl;
            return control.properties.descriptor;
        }),
    };
}

function colorSlice(
    objectName: string,
    propertyName: string,
    displayName: string,
    color: string
): powerbi.visuals.FormattingSlice {
    return {
        uid: `${objectName}_${propertyName}`,
        displayName,
        control: {
            type: "ColorPicker",
            properties: {
                descriptor: { objectName, propertyName },
                value: { value: color },
            },
        },
    } as powerbi.visuals.FormattingSlice;
}

function numberSlice(
    objectName: string,
    propertyName: string,
    displayName: string,
    value: number,
    min: number,
    max: number,
    unitSymbol?: string
): powerbi.visuals.FormattingSlice {
    return {
        uid: `${objectName}_${propertyName}`,
        displayName,
        control: {
            type: "NumUpDown",
            properties: {
                descriptor: { objectName, propertyName },
                value,
                options: {
                    minValue: { type: powerbi.visuals.ValidatorType.Min, value: min },
                    maxValue: { type: powerbi.visuals.ValidatorType.Max, value: max },
                    unitSymbol,
                    unitSymbolAfterInput: true,
                },
            },
        },
    } as powerbi.visuals.FormattingSlice;
}

function toggleSlice(
    objectName: string,
    propertyName: string,
    displayName: string,
    value: boolean
): powerbi.visuals.FormattingSlice {
    return {
        uid: `${objectName}_${propertyName}`,
        displayName,
        control: {
            type: "ToggleSwitch",
            properties: {
                descriptor: { objectName, propertyName },
                value,
            },
        },
    } as powerbi.visuals.FormattingSlice;
}

function dropdownSlice(
    objectName: string,
    propertyName: string,
    displayName: string,
    value: string,
    items: powerbi.IEnumMember[]
): powerbi.visuals.FormattingSlice {
    return {
        uid: `${objectName}_${propertyName}`,
        displayName,
        control: {
            type: "Dropdown",
            properties: {
                descriptor: { objectName, propertyName },
                value: items.find((item) => item.value === value) || items[0],
                items,
            },
        },
    } as powerbi.visuals.FormattingSlice;
}

function getObjectValue(
    objects: powerbi.DataViewObjects | undefined,
    objectName: string,
    propertyName: string
): powerbi.DataViewPropertyValue | undefined {
    return objects?.[objectName]?.[propertyName];
}

function getColor(
    objects: powerbi.DataViewObjects | undefined,
    objectName: string,
    propertyName: string,
    fallback: string
): string {
    const value = getObjectValue(objects, objectName, propertyName) as { solid?: { color?: string } } | undefined;
    return value?.solid?.color || fallback;
}

function getNumber(
    objects: powerbi.DataViewObjects | undefined,
    objectName: string,
    propertyName: string,
    fallback: number
): number {
    const value = getObjectValue(objects, objectName, propertyName);
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getBoolean(
    objects: powerbi.DataViewObjects | undefined,
    objectName: string,
    propertyName: string,
    fallback: boolean
): boolean {
    const value = getObjectValue(objects, objectName, propertyName);
    return typeof value === "boolean" ? value : fallback;
}

function getEnum(
    objects: powerbi.DataViewObjects | undefined,
    objectName: string,
    propertyName: string,
    fallback: string
): string {
    const value = getObjectValue(objects, objectName, propertyName);
    return typeof value === "string" ? value : fallback;
}

function getChoice(objects: powerbi.DataViewObjects | undefined, object: string, property: string, fallback: string, items: powerbi.IEnumMember[]): string {
    const value = getEnum(objects, object, property, fallback);
    return items.some((item) => item.value === value) ? value : fallback;
}

function stationKey(row: TransmissionLine): string {
    const point = featureLocations(row)[0];
    return row.stationId || `${point.longitude},${point.latitude}`;
}

function formatAmount(value: number | null): string {
    return value === null ? "Not supplied" : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function effectiveDateDetails(row: TransmissionLine): string[] {
    return DATE_FIELDS.map(([projectField, featureField, label]) => {
        const override = row[featureField];
        const value = override || row[projectField];
        return value ? `${label}: ${value}${override ? ` (feature override; project: ${row[projectField] || "not supplied"})` : ""}` : "";
    }).filter(Boolean);
}


function createDefaultViewState(): ViewState {
    return {
        centerLongitude: (BASE_BOUNDS[0] + BASE_BOUNDS[2]) / 2,
        centerLatitude: (BASE_BOUNDS[1] + BASE_BOUNDS[3]) / 2,
        zoom: 1,
    };
}

function getViewExtent(viewState: ViewState): Bounds {
    const width = (BASE_BOUNDS[2] - BASE_BOUNDS[0]) / viewState.zoom;
    const height = (BASE_BOUNDS[3] - BASE_BOUNDS[1]) / viewState.zoom;

    return [
        viewState.centerLongitude - width / 2,
        viewState.centerLatitude - height / 2,
        viewState.centerLongitude + width / 2,
        viewState.centerLatitude + height / 2,
    ];
}

function createMapTransform(width: number, height: number, extent: Bounds): MapTransform {
    const [west, south, east, north] = extent;
    const padding = Math.max(10, Math.min(width, height) * 0.025);
    const availableWidth = Math.max(1, width - padding * 2);
    const availableHeight = Math.max(1, height - padding * 2);
    const meanLatitude = (south + north) / 2;
    const cosLatitude = Math.max(0.2, Math.cos(degreesToRadians(meanLatitude)));
    const projectedWidth = Math.max(0.0001, (east - west) * cosLatitude);
    const projectedHeight = Math.max(0.0001, north - south);
    const scale = Math.min(availableWidth / projectedWidth, availableHeight / projectedHeight);
    const renderedWidth = projectedWidth * scale;
    const renderedHeight = projectedHeight * scale;
    const offsetX = (width - renderedWidth) / 2;
    const offsetY = (height - renderedHeight) / 2;

    return {
        cosLatitude,
        scale,
        project: (longitude: number, latitude: number) => ({
            x: offsetX + (longitude - west) * cosLatitude * scale,
            y: offsetY + (north - latitude) * scale,
        }),
    };
}

function iterPolygons(geometry: GeoFeature["geometry"]): Polygon[] {
    if (geometry.type === "Polygon") {
        return [geometry.coordinates as Polygon];
    }

    return geometry.coordinates as MultiPolygon;
}

function polygonToPath(polygon: Polygon, transform: MapTransform): string {
    const commands: string[] = [];

    for (const ring of polygon) {
        if (ring.length < 3) {
            continue;
        }

        ring.forEach((position, index) => {
            const point = transform.project(position[0], position[1]);
            commands.push(`${index === 0 ? "M" : "L"}${formatNumber(point.x)} ${formatNumber(point.y)}`);
        });
        commands.push("Z");
    }

    return commands.join(" ");
}

function getGeojsonBounds(collection: FeatureCollection): Bounds {
    if (collection.bbox && collection.bbox.length === 4) {
        return collection.bbox;
    }

    const longitudes: number[] = [];
    const latitudes: number[] = [];

    for (const feature of collection.features) {
        for (const polygon of iterPolygons(feature.geometry)) {
            for (const ring of polygon) {
                for (const position of ring) {
                    longitudes.push(position[0]);
                    latitudes.push(position[1]);
                }
            }
        }
    }

    return [
        Math.min(...longitudes),
        Math.min(...latitudes),
        Math.max(...longitudes),
        Math.max(...latitudes),
    ];
}

function expandBounds(bounds: Bounds, fraction: number): Bounds {
    const [west, south, east, north] = bounds;
    const longitudeMargin = (east - west) * fraction;
    const latitudeMargin = (north - south) * fraction;

    return [
        west - longitudeMargin,
        south - latitudeMargin,
        east + longitudeMargin,
        north + latitudeMargin,
    ];
}

function getVisiblePlaces(zoom: number): Place[] {
    if (zoom < 1.6) {
        return ONTARIO_PLACES.slice(0, 12);
    }

    if (zoom < 3) {
        return ONTARIO_PLACES.slice(0, 24);
    }

    return ONTARIO_PLACES;
}

function getLegendItems(
    lines: TransmissionLine[],
    settings: VisualSettings
): { label: string; color: string; width: number; dashArray: string }[] {
    lines = lines.filter((row) => featureLocations(row).length > 0);
    if (!settings.legend.showColorKey || lines.length === 0) {
        return [];
    }
    if (settings.lines.colorMode === "outsourcing") {
        const baseWidth = 2.3 * settings.lines.thicknessScale;
        return [
            {
                label: "IN strategy",
                color: settings.lines.insourcedColor,
                width: baseWidth,
                dashArray: getLineDashArray("Legend", settings),
            },
            {
                label: "OUT strategy",
                color: settings.lines.outsourcedColor,
                width: baseWidth,
                dashArray: getLineDashArray("Legend", settings),
            },
        ];
    }

    return Array.from(new Set(lines.map((line) => line.voltageKv)))
        .filter((voltage) => Number.isFinite(voltage))
        .sort((a, b) => a - b)
        .map((voltage) => {
            const style = getLineStyle(
                {
                    voltageKv: voltage,
                    status: "Legend",
                    outsourcingStrategy: "IN",
                } as TransmissionLine,
                settings
            );
            return {
                label: voltage ? `${voltage} kV` : "Unknown kV",
                color: style.color,
                width: style.width,
                dashArray: style.dashArray,
            };
        });
}

function getLineStyle(line: Pick<TransmissionLine, "voltageKv" | "status" | "outsourcingStrategy"> & Partial<Pick<TransmissionLine, "projectStage" | "projectStatus">>, settings: VisualSettings): {
    color: string;
    width: number;
    dashArray: string;
    statusClass: string;
} {
    const voltage = Math.round(line.voltageKv);
    const color = settings.lines.colorMode === "outsourcing"
        ? getOutsourcingColor(line.outsourcingStrategy, settings)
        : getVoltageColor(voltage, settings);
    let width = 2 * settings.lines.thicknessScale;

    if (!settings.lines.thicknessByVoltage) {
        width = 2.3 * settings.lines.thicknessScale;
    } else if (voltage >= 500) {
        width = 3.4 * settings.lines.thicknessScale;
    } else if (voltage >= 345) {
        width = 2.8 * settings.lines.thicknessScale;
    } else if (voltage >= 230) {
        width = 2.3 * settings.lines.thicknessScale;
    } else if (voltage >= 115) {
        width = 1.9 * settings.lines.thicknessScale;
    }

    const phase = line.projectStage || line.projectStatus || line.status;
    const dashArray = getLineDashArray(phase, settings);

    return {
        color,
        width,
        dashArray,
        statusClass: getPhaseClass(phase),
    };
}

function getVoltageColor(voltage: number, settings: VisualSettings): string {
    if (voltage >= 500) {
        return settings.voltageColors.voltage500Color;
    }
    if (voltage >= 345) {
        return settings.voltageColors.voltage345Color;
    }
    if (voltage >= 230) {
        return settings.voltageColors.voltage230Color;
    }
    if (voltage >= 115) {
        return settings.voltageColors.voltage115Color;
    }
    return settings.voltageColors.defaultColor;
}

function getOutsourcingColor(strategy: string, settings: VisualSettings): string {
    const value = normalized(strategy);
    if (value === "out" || value.includes("outsourced")) {
        return settings.lines.outsourcedColor;
    }
    if (value === "in" || value.includes("insourced")) {
        return settings.lines.insourcedColor;
    }
    return settings.voltageColors.defaultColor;
}

function getLineDashArray(status: string, settings: VisualSettings): string {
    if (settings.lines.linePattern === "solid") {
        return "none";
    }
    if (settings.lines.linePattern === "dashed") {
        return "7 5";
    }

    const phase = getPhaseClass(status);
    return phase === "is-planned" ? "6 4" : phase === "is-construction" ? "10 4" : "none";
}

function getPhaseClass(value: string): string {
    const status = normalized(value);
    if (["construction", "build"].some((word) => status.includes(word))) {
        return "is-construction";
    }
    return ["planned", "design", "permitting", "feasibility", "scheduled", "initialized", "budgetary", "proposed"]
        .some((word) => status.includes(word)) ? "is-planned" : "is-solid";
}

function normalized(value: string): string {
    return value.trim().toLowerCase();
}

function createSvgElement<K extends keyof SVGElementTagNameMap>(tagName: K): SVGElementTagNameMap[K] {
    return document.createElementNS(SVG_NS, tagName);
}

function removeChildren(element: Element): void {
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

function degreesToRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
}

function formatNumber(value: number): string {
    return value.toFixed(2);
}

function opacityValue(percent: number): string {
    return String(clamp(percent, 0, 100) / 100);
}
