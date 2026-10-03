const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
    testDir: "./tests",
    workers: 1,
    reporter: "list",
    outputDir: ".tmp/browser-tests",
    use: {
        channel: "msedge",
        headless: true,
        viewport: { width: 900, height: 650 },
    },
});
