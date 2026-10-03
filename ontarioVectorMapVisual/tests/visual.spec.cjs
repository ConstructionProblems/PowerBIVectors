const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const JSZip = require("jszip");

const root = path.resolve(__dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(root, "pbiviz.json"), "utf8"));
const packagePath = path.join(root, "dist", `${config.visual.guid}.${config.visual.version}.pbiviz`);
const csvFields = {
    lineId: "LineID", fromLatitude: "FromLatitude", fromLongitude: "FromLongitude",
    toLatitude: "ToLatitude", toLongitude: "ToLongitude", voltageKv: "VoltageKV",
    status: "Status", plannedStart: "PlannedConstructionStart", plannedFinish: "PlannedConstructionFinish",
    outsourcingStrategy: "ConstructionOutsourcingStrategy", projectNumber: "ProjectNumber",
    projectName: "ProjectName", departmentResponsible: "DepartmentResponsible",
    contractor: "Contractor", contractValue: "ContractValue",
    towerType: "TowerType", circuitName: "CircuitName", projectStatus: "ProjectStatus",
    contractStatus: "ContractStatus", projectStage: "ProjectStage", rfpDate: "RFPDate",
    bestReleaseDate: "BESTReleaseDate", detlReleaseDate: "DETLReleaseDate",
    emppReleaseDate: "EMPPReleaseDate", isdDate: "ISDDate",
    featureId: "FeatureID", featureType: "FeatureType", stationId: "StationID", stationName: "StationName",
    contractId: "ContractID", projectGrossCapex: "ProjectGrossCapex",
    featurePlannedStart: "FeaturePlannedConstructionStart", featurePlannedFinish: "FeaturePlannedConstructionFinish",
    featureRfpDate: "FeatureRFPDate", featureBestReleaseDate: "FeatureBESTReleaseDate",
    featureDetlReleaseDate: "FeatureDETLReleaseDate", featureEmppReleaseDate: "FeatureEMPPReleaseDate", featureIsdDate: "FeatureISDDate",
};
let bundled;
let samples;
let expanded;

test.beforeAll(async () => {
    const archive = await JSZip.loadAsync(fs.readFileSync(packagePath));
    bundled = JSON.parse(await archive.file(`resources/${config.visual.guid}.pbiviz.json`).async("string"));
    const { csvParse } = await import("d3");
    expanded = csvParse(fs.readFileSync(path.join(root, "sample_data/transmission_lines_demo.csv"), "utf8"));
    samples = expanded.filter((row) => /^LINE_\d{3}$/.test(row.FeatureID));
    expect(bundled.visual.version).toBe(config.visual.version);
    expect(bundled.capabilities.privileges).toEqual([]);
});

function dataView(rows = samples, objects = {}, roles = Object.keys(csvFields)) {
    const columns = roles.map((role) => ({
        displayName: csvFields[role], queryName: csvFields[role], roles: { [role]: true },
    }));
    return {
        metadata: { columns, objects },
        table: { columns, rows: rows.map((row) => roles.map((role) => row[csvFields[role]] ?? null)) },
    };
}

async function update(page, view, width = 900, height = 650) {
    await page.evaluate(({ view, width, height }) => {
        const element = document.getElementById("visual");
        element.style.width = `${width}px`;
        element.style.height = `${height}px`;
        window.visual.update({ viewport: { width, height }, dataViews: [view], type: 2 });
    }, { view, width, height });
    expect(await page.evaluate(() => window.failures)).toEqual([]);
}

test.beforeEach(async ({ page }) => {
    // Exercise the delivered package, including its CSS cascade, without a live Power BI service.
    await page.setContent('<style>body { margin: 0; background: #fff; }</style><div id="visual"></div>');
    await page.addStyleTag({ content: bundled.content.css });
    await page.evaluate(() => {
        window.powerbi = { visuals: { plugins: {} } };
        window.failures = [];
        window.persisted = [];
    });
    await page.addScriptTag({ content: bundled.content.js });
    await page.evaluate((guid) => {
        window.visual = window.powerbi.visuals.plugins[guid].create({
            element: document.getElementById("visual"),
            host: { persistProperties(change) { window.persisted.push(change); }, eventService: {
                renderingStarted() {}, renderingFinished() {},
                renderingFailed(_options, error) { window.failures.push(error); },
            } },
        });
    }, config.visual.guid);
});

test("new metadata and milestone dates stay separate and stage drives line patterns", async ({ page }) => {
    const rows = [{ ...samples[0], Status: "In Service", ProjectStatus: "Active", ContractStatus: "Closed",
        ProjectStage: "Budgetary", RFPDate: "2026-02-02T00:00:00.000Z" }];
    await update(page, dataView(rows));
    await expect(page.locator(".transmission-line")).toHaveAttribute("stroke-dasharray", "6 4");
    await page.locator(".transmission-line").dispatchEvent("pointermove", { clientX: 400, clientY: 300 });
    const tooltip = page.locator(".map-tooltip");
    for (const value of ["Circuit: TB230-C1", "Tower type: Lattice Steel - Suspension", "Project status: Active",
        "Contract status: Closed", "Project stage: Budgetary", "RFP date: 2026-02-02", "BEST release: 2025-11-17",
        "DETL release: 2026-01-12", "EMPP release: 2026-04-06", "ISD date: 2027-12-15"]) {
        await expect(tooltip).toContainText(value);
    }
    await expect(tooltip).not.toContainText("T00:00");
    rows[0].ProjectStage = "Construction";
    await update(page, dataView(rows));
    await expect(page.locator(".transmission-line")).toHaveAttribute("stroke-dasharray", "10 4");
    await update(page, dataView(rows, {}, Object.keys(csvFields).filter((role) => !["projectStatus", "projectStage"].includes(role))));
    await expect(page.locator(".transmission-line")).toHaveAttribute("stroke-dasharray", "none");
});

test("legend editor persists selected fields, switches labels and scrolls without zooming", async ({ page }, testInfo) => {
    await update(page, dataView(samples, { projects: { show: true, sortBy: "projectNumber" } }));
    await page.getByRole("button", { name: "Legend settings", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Legend settings", exact: true });
    await expect(editor).toBeVisible();
    await editor.getByLabel("Line color key", { exact: true }).uncheck();
    await expect(page.locator(".map-legend")).toHaveCount(0);
    await editor.getByLabel("Tower type", { exact: true }).check();
    await editor.getByLabel("Project stage", { exact: true }).check();
    await editor.getByLabel("Contract status", { exact: true }).check();
    await editor.getByLabel("ISD date", { exact: true }).check();
    await editor.getByLabel("Primary legend label", { exact: true }).selectOption("circuitName");
    const firstProject = page.locator(".project-legend-row").first();
    await expect(firstProject.locator(".project-legend-name")).toHaveText("TB230-C1");
    await expect(firstProject).toContainText("Tower type: Lattice Steel - Suspension");
    await expect(firstProject).toContainText("Project stage: Construction");
    await expect(firstProject).toContainText("Contract status: Awarded");
    await expect(firstProject).toContainText("ISD date: 2027-12-15");
    expect(await page.evaluate(() => window.persisted.map((change) => change.merge[0].properties))).toContainEqual({ primaryLabel: "circuitName" });
    await page.screenshot({ path: testInfo.outputPath("legend-editor.png") });
    await editor.getByRole("button", { name: "Close legend settings" }).click();
    const outline = await page.locator(".ontario-shape").first().getAttribute("d");
    await page.locator(".project-legend").hover();
    await page.mouse.wheel(0, 300);
    expect(await page.locator(".ontario-shape").first().getAttribute("d")).toBe(outline);
    await page.screenshot({ path: testInfo.outputPath("legend-circuits.png") });
    await update(page, dataView(samples, { projects: { show: true }, legend: { showProjects: false } }));
    await expect(page.locator(".project-legend")).toBeHidden();
    await expect(page.locator(".project-marker")).toHaveCount(12);
});

test("project details list distinct values without summing duplicate contract values", async ({ page }) => {
    const rows = [samples[0], { ...samples[0], LineID: "SECOND", CircuitName: "TB230-C2", TowerType: "Steel H-frame" }];
    await update(page, dataView(rows, { projects: { show: true }, legend: {
        showCircuitName: true, showTowerType: true, showContractValue: true, showRfpDate: true,
    } }));
    await expect(page.locator(".transmission-line")).toHaveCount(2);
    await expect(page.locator(".project-legend-row")).toHaveCount(1);
    await expect(page.locator(".project-legend-row")).toContainText("Circuit name: TB230-C1; TB230-C2");
    await expect(page.locator(".project-legend-row")).toContainText("Contract value: 42,000,000");
    await expect(page.locator(".project-legend-row")).not.toContainText("84,000,000");
    await update(page, dataView([samples[0], { ...samples[1], FromLatitude: "   " }, { ...samples[2], ToLatitude: "91" }]));
    await expect(page.locator(".transmission-line")).toHaveCount(1);
    await expect(page.locator(".single-location")).toHaveCount(2);
});

test("layer colors and opacity apply to actual SVG styles without network requests", async ({ page }, testInfo) => {
    const requests = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.route("**/*", (route) => route.abort());
    await update(page, dataView());
    await expect(page.locator(".transmission-line")).toHaveCount(12);
    await expect(page.locator(".lake-shape")).toHaveCount(4);
    await expect(page.locator("image, img")).toHaveCount(0);
    for (const selector of [".map-background", ".ontario-shape", ".lake-shape"]) {
        await expect(page.locator(selector).first()).toHaveCSS("opacity", "1");
    }
    const colors = {
        canvas: { backgroundColor: { solid: { color: "#eeeeee" } } },
        mapLayer: { landColor: { solid: { color: "#c0dfb5" } }, lakesColor: { solid: { color: "#286dc0" } } },
    };
    await update(page, dataView(samples, colors));
    await expect(page.locator(".map-background")).toHaveCSS("fill", "rgb(238, 238, 238)");
    await expect(page.locator(".ontario-shape").first()).toHaveCSS("fill", "rgb(192, 223, 181)");
    await expect(page.locator(".lake-shape").first()).toHaveCSS("fill", "rgb(40, 109, 192)");
    await page.screenshot({ path: testInfo.outputPath("layer-colors.png") });
    colors.canvas.backgroundOpacity = 0;
    colors.mapLayer.landOpacity = 35;
    colors.mapLayer.lakesOpacity = 65;
    await update(page, dataView(samples, colors));
    await expect(page.locator(".map-background")).toHaveCSS("opacity", "0");
    await expect(page.locator(".ontario-shape").first()).toHaveCSS("opacity", "0.35");
    await expect(page.locator(".lake-shape").first()).toHaveCSS("opacity", "0.65");
    await expect(page.locator(".ontario-vector-map")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    expect(requests).toEqual([]);
});

test("uniform thickness respects scale, patterns and outsourcing colors", async ({ page }) => {
    await update(page, dataView());
    const widths = await page.locator(".transmission-line").evaluateAll((lines) => lines.map((line) => line.getAttribute("stroke-width")));
    expect(new Set(widths).size).toBe(4);
    const objects = { lines: { thicknessByVoltage: false, thicknessScale: 2, linePattern: "solid" } };
    await update(page, dataView(samples, objects));
    for (const line of await page.locator(".transmission-line").all()) {
        await expect(line).toHaveAttribute("stroke-width", "4.6");
        await expect(line).toHaveAttribute("stroke-dasharray", "none");
    }
    objects.lines.colorMode = "outsourcing";
    objects.lines.linePattern = "dashed";
    await update(page, dataView(samples, objects));
    await expect(page.locator(".transmission-line").nth(0)).toHaveAttribute("stroke", "#1f6fbe");
    await expect(page.locator(".transmission-line").nth(1)).toHaveAttribute("stroke", "#2e7d57");
    await expect(page.locator(".transmission-line").first()).toHaveAttribute("stroke-dasharray", "7 5");
    const model = await page.evaluate(() => window.visual.getFormattingModel());
    const descriptors = model.cards.flatMap((card) => card.groups.flatMap((group) => group.slices.map((slice) => slice.control.properties.descriptor)));
    for (const descriptor of descriptors) {
        expect(bundled.capabilities.objects[descriptor.objectName].properties).toHaveProperty(descriptor.propertyName);
    }
    expect(descriptors).toContainEqual({ objectName: "lines", propertyName: "thicknessByVoltage" });
    expect(descriptors).toContainEqual({ objectName: "projects", propertyName: "show" });
});

test("project badges match unique legend entries, preserve rows and filtered numbers", async ({ page }, testInfo) => {
    await update(page, dataView());
    await expect(page.locator(".project-legend")).toBeHidden();
    const objects = { projects: { show: true, sortBy: "projectNumber" } };
    await update(page, dataView(samples, objects));
    await expect(page.locator(".project-marker")).toHaveCount(12);
    await expect(page.locator(".project-legend-row")).toHaveCount(12);
    expect(await page.locator(".project-marker text").allTextContents()).toEqual(samples.map((row) => row.ProjectNumber));
    const badges = await page.locator(".project-marker").evaluateAll((markers) => markers.map((marker) => {
        const rect = marker.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }));
    for (let i = 0; i < badges.length; i++) {
        for (let j = i + 1; j < badges.length; j++) {
            expect(Math.hypot(badges[i].x - badges[j].x, badges[i].y - badges[j].y)).toBeGreaterThan(29);
        }
    }
    await page.screenshot({ path: testInfo.outputPath("projects-desktop.png") });
    const filtered = [samples[3], samples[9], { ...samples[3], LineID: "SECOND_SEGMENT" }];
    await update(page, dataView(filtered, objects));
    await expect(page.locator(".transmission-line")).toHaveCount(3);
    await expect(page.locator(".project-marker")).toHaveCount(3);
    await expect(page.locator(".project-legend-row")).toHaveCount(2);
    expect(await page.locator(".project-legend-number").allTextContents()).toEqual(["01004", "01010"]);
    await page.locator('.project-marker[data-project-number="01004"]').first().dispatchEvent("pointermove", { clientX: 400, clientY: 300 });
    await expect(page.locator(".map-tooltip")).toContainText("Southwest Reliability Project");
    await expect(page.locator(".map-tooltip")).toContainText("Department 2");
    await expect(page.locator(".map-tooltip")).toContainText("Demo Tower Services");
    await expect(page.locator(".map-tooltip")).toContainText("58,000,000");
    await update(page, dataView(filtered));
    await expect(page.locator(".project-marker")).toHaveCount(0);
    await expect(page.locator(".project-legend")).toBeHidden();
});

test("compact legend fits, map remains vector and pan/zoom still work", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 380, height: 550 });
    const objects = { projects: { show: true } };
    await update(page, dataView(samples, objects), 380, 550);
    await expect(page.locator(".project-marker")).toHaveCount(12);
    const panel = await page.locator(".project-legend").boundingBox();
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.y + panel.height).toBeLessThanOrEqual(550);
    expect(panel.x + panel.width).toBeLessThanOrEqual(380);
    expect(await page.locator(".project-legend").evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    const outline = await page.locator(".ontario-shape").first().getAttribute("d");
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    expect(await page.locator(".ontario-shape").first().getAttribute("d")).not.toBe(outline);
    await expect(page.locator(".legend-title")).toHaveText("Zoom 1.4x");
    await page.getByRole("button", { name: "Pan east", exact: true }).click();
    await page.getByRole("button", { name: "Reset view", exact: true }).click();
    expect(await page.locator(".ontario-shape").first().getAttribute("d")).toBe(outline);
    await page.screenshot({ path: testInfo.outputPath("projects-compact.png") });
});

test("empty filters, missing metadata and conflicting projects stay informative", async ({ page }) => {
    const objects = { projects: { show: true } };
    await update(page, dataView([], objects));
    await expect(page.locator(".transmission-line")).toHaveCount(0);
    await expect(page.locator(".map-message")).toContainText("No projects after filtering");
    await expect(page.locator(".project-legend")).toContainText("No projects");
    await update(page, dataView(samples, objects, Object.keys(csvFields).slice(0, 6)));
    await expect(page.locator(".transmission-line")).toHaveCount(12);
    await expect(page.locator(".project-marker")).toHaveCount(0);
    await expect(page.locator(".project-legend-note")).toContainText("Project Number");
    await update(page, dataView([samples[0], { ...samples[0], ProjectName: "Conflicting project" }], objects));
    await expect(page.locator(".transmission-line")).toHaveCount(2);
    await expect(page.locator(".project-marker")).toHaveCount(2);
    await expect(page.locator(".project-legend-row")).toHaveCount(1);
});

test("filtered map numbering sorts projects, ignores overrides and stays stable during navigation", async ({ page }) => {
    const rows = [
        { ...samples[0], ProjectNumber: "00003", ISDDate: "2029-01-01", FeatureISDDate: "2020-01-01", ProjectGrossCapex: "10" },
        { ...samples[1], ProjectNumber: "00002", ISDDate: "2028-01-01", ProjectGrossCapex: "30" },
        { ...samples[2], ProjectNumber: "00001", ISDDate: "2028-01-01", ProjectGrossCapex: "20" },
        { ...samples[3], ProjectNumber: "00004", ISDDate: "", ProjectGrossCapex: "" },
    ];
    const objects = { projects: { show: true, numberingMode: "map" } };
    const order = async () => page.locator(".project-legend-row").evaluateAll((items) => items.map((item) => [item.dataset.projectNumber, item.querySelector(".project-legend-number").textContent]));
    await update(page, dataView(rows, objects));
    expect(await order()).toEqual([["00001", "1"], ["00002", "2"], ["00003", "3"], ["00004", "4"]]);
    await expect(page.locator(".project-marker circle")).toHaveCount(4);
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await page.getByRole("button", { name: "Pan east", exact: true }).click();
    expect(await order()).toEqual([["00001", "1"], ["00002", "2"], ["00003", "3"], ["00004", "4"]]);
    await page.getByRole("button", { name: "Reset view", exact: true }).click();
    await update(page, dataView([rows[0], rows[1]], objects));
    expect(await order()).toEqual([["00002", "1"], ["00003", "2"]]);
    objects.projects.sortDirection = "descending";
    await update(page, dataView(rows, objects));
    expect((await order()).map(([id]) => id)).toEqual(["00003", "00001", "00002", "00004"]);
    objects.projects.sortBy = "projectGrossCapex";
    await update(page, dataView(rows, objects));
    expect((await order()).map(([id]) => id)).toEqual(["00002", "00001", "00003", "00004"]);
    for (const sortBy of ["projectNumber", "projectName"]) {
        objects.projects.sortBy = sortBy;
        await update(page, dataView(rows, objects));
        const expected = rows.slice().sort((a, b) => b[sortBy === "projectName" ? "ProjectName" : "ProjectNumber"].localeCompare(a[sortBy === "projectName" ? "ProjectName" : "ProjectNumber"]));
        expect((await order()).map(([id]) => id)).toEqual(expected.map((row) => row.ProjectNumber));
    }
    rows[0].ProjectName = "";
    await update(page, dataView(rows, objects));
    expect((await order()).at(-1)[0]).toBe("00003");
});

test("shared substations merge pins, split strategies and deduplicate contracts and gross capex", async ({ page }, testInfo) => {
    const objects = { projects: { show: true, numberingMode: "map" }, lines: { colorMode: "outsourcing" },
        legend: { showProjectGrossCapex: true, showContractValue: true, showContractId: true } };
    await update(page, dataView(expanded, objects));
    await expect(page.locator(".station-marker")).toHaveCount(4);
    await expect(page.locator(".transmission-line")).toHaveCount(14);
    await expect(page.locator(".single-location")).toHaveCount(1);
    await expect(page.locator(".project-legend-row")).toHaveCount(13);
    await expect(page.locator(".location-diagnostic")).toHaveText("Projects without location: 2");
    const station = page.locator('.station-marker[data-station-id="ST_HAMILTON"]');
    expect(await station.locator('path[fill]').evaluateAll((paths) => paths.map((path) => path.getAttribute("fill")))).toEqual(["#2e7d57", "#1f6fbe", "none"]);
    await station.dispatchEvent("pointermove", { clientX: 400, clientY: 300 });
    const tooltip = page.locator(".map-tooltip");
    for (const text of ["Project 01002", "Project 01010", "C002", "C010", "Project gross capex", "feature override"]) await expect(tooltip).toContainText(text);
    const project = page.locator('.project-legend-row[data-project-number="01001"]');
    await expect(project).toContainText("Project gross capex: 54,000,000");
    await expect(project).toContainText("Contract value: 42,000,000");
    await expect(project).not.toContainText("126,000,000");
    await station.dispatchEvent("pointerleave");
    await page.screenshot({ path: testInfo.outputPath("shared-stations.png") });
    await update(page, dataView(expanded.filter((row) => row.ProjectNumber === "01002"), objects));
    await expect(page.locator(".station-marker")).toHaveCount(1);
    expect(await page.locator(".station-marker path").first().getAttribute("fill")).toBe("#2e7d57");
    await expect(page.locator(".project-marker text")).toHaveText(["1", "1", "1"]);
});

test("geometry fallbacks count unique wholly unlocated projects, including projects without features", async ({ page }) => {
    const start = { ...samples[0], ProjectNumber: "00001", ToLatitude: null, ToLongitude: null };
    const end = { ...samples[1], ProjectNumber: "00002", FromLatitude: "bad", FromLongitude: null };
    const invalid = { ...samples[2], ProjectNumber: "00003", FromLatitude: "91", ToLongitude: "Infinity" };
    const none = { ...invalid, ProjectNumber: "00004", FeatureID: null, FeatureType: null };
    await update(page, dataView([start, end, invalid, none, { ...invalid }, { ...invalid, ProjectNumber: "00001" }]));
    await expect(page.locator(".transmission-line")).toHaveCount(0);
    await expect(page.locator(".single-location")).toHaveCount(2);
    await expect(page.locator(".location-diagnostic")).toHaveText("Projects without location: 2");
    await update(page, dataView([none], {}, ["projectNumber", "projectName", "projectGrossCapex"]));
    await expect(page.locator(".location-diagnostic")).toHaveText("Projects without location: 1");
    await expect(page.locator(".map-message")).toContainText("No drawable features");
    await update(page, dataView([]));
    await expect(page.locator(".location-diagnostic")).toHaveText("Projects without location: 0");
});

test("number labels format independently and line glow follows color, dashes and viewport bounds", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 380, height: 550 });
    const objects = { projects: { show: true, color: { solid: { color: "#aa2266" } }, fontSize: 18, bold: false, opacity: 65 },
        glow: { enabled: true, intensity: 80, blurRadius: 8 }, lines: { linePattern: "dashed" } };
    await update(page, dataView(samples.slice(0, 2), objects));
    await expect(page.locator(".project-marker circle")).toHaveCount(0);
    await expect(page.locator(".project-marker text").first()).toHaveCSS("fill", "rgb(170, 34, 102)");
    await expect(page.locator(".project-marker text").first()).toHaveCSS("font-size", "18px");
    await expect(page.locator(".project-marker text").first()).toHaveCSS("font-weight", "400");
    await expect(page.locator(".project-marker").first()).toHaveCSS("opacity", "0.65");
    await expect(page.locator(".line-glow")).toHaveCount(2);
    await expect(page.locator(".line-glow").first()).toHaveAttribute("stroke", "#1f6f8b");
    await expect(page.locator(".line-glow").first()).toHaveAttribute("stroke-dasharray", "7 5");
    await expect(page.locator(".line-glow").first()).toHaveAttribute("opacity", "0.8");
    await expect(page.locator("filter")).toHaveAttribute("filterUnits", "userSpaceOnUse");
    expect(Number(await page.locator("filter").getAttribute("x"))).toBeLessThan(-24);
    objects.glow.matchLineColor = false;
    objects.glow.color = { solid: { color: "#ffbb11" } };
    objects.projects.projectCircles = true;
    await update(page, dataView(samples.slice(0, 2), objects));
    await expect(page.locator(".line-glow").first()).toHaveAttribute("stroke", "#ffbb11");
    await expect(page.locator(".project-marker circle")).toHaveCount(2);
    objects.projects.numberingMode = "map";
    objects.projects.mapCircles = false;
    await update(page, dataView(expanded, objects), 380, 550);
    await expect(page.locator(".project-marker circle")).toHaveCount(0);
    const boxes = await page.locator(".project-marker text").evaluateAll((items) => items.map((item) => { const r = item.getBoundingClientRect(); return [r.x, r.y, r.right, r.bottom]; }));
    for (const [x, y, right, bottom] of boxes) { expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0); expect(right).toBeLessThanOrEqual(380); expect(bottom).toBeLessThan(550); }
    await page.screenshot({ path: testInfo.outputPath("labels-glow-narrow.png") });
});

test("glow renders pixels at viewport edges without runtime web requests", async ({ page }, testInfo) => {
    const requests = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.route("**/*", (route) => route.abort());
    // These valid WGS84 features cross the full Ontario viewport and its padding.
    const edge = { ...samples[0], FromLongitude: "-120", FromLatitude: "48", ToLongitude: "-60", ToLatitude: "48" };
    const objects = { glow: { enabled: false, matchLineColor: false, color: { solid: { color: "#ff0000" } }, intensity: 100, blurRadius: 6 },
        placeLabels: { show: false }, legend: { showColorKey: false } };
    const redPixels = async () => {
        const png = await page.locator("#visual").screenshot();
        return page.evaluate(async (bytes) => {
            const bitmap = await createImageBitmap(new Blob([Uint8Array.from(bytes)], { type: "image/png" }));
            const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
            const ctx = canvas.getContext("2d"); ctx.drawImage(bitmap, 0, 0);
            const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            const counts = [0, 0];
            for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
                const i = (y * canvas.width + x) * 4;
                if (pixels[i] > pixels[i + 1] + 25 && pixels[i] > pixels[i + 2] + 25) {
                    counts[0]++; if (x < 8 || x >= canvas.width - 8) counts[1]++;
                }
            }
            bitmap.close(); return counts;
        }, Array.from(png));
    };
    await update(page, dataView([edge], objects));
    const before = await redPixels();
    objects.glow.enabled = true;
    await update(page, dataView([edge], objects));
    const after = await redPixels();
    expect(after[0]).toBeGreaterThan(before[0] + 100);
    expect(after[1]).toBeGreaterThan(before[1] + 10);
    await page.screenshot({ path: testInfo.outputPath("glow-viewport-edges.png") });
    await update(page, dataView(expanded, objects));
    expect(requests).toEqual([]);
});
