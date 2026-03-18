import { glob } from "glob";
import { minify } from "html-minifier-terser";
import { transform } from "lightningcss";
import { minify as minifyJs } from "terser";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";

const SCRIPT_DIR = import.meta.dir;
const PROJECT_ROOT = resolve(SCRIPT_DIR, "../..");
const SITE_DIR = join(PROJECT_ROOT, "_site");

const CONFIG = {
    siteDir: SITE_DIR,
    html: {
        collapseWhitespace: true,
        removeComments: true,
        minifyCSS: true,
        minifyJS: true,
        ignoreCustomFragments: [/{%[\s\S]*?%}/, /{{[\s\S]*?}}/],
        continueOnParseError: true,
    },
    css: {
        level: 1,
    },
    js: {
        compress: true,
        mangle: true,
        toplevel: false,
    },
};

async function processHtml(filePath: string): Promise<boolean> {
    try {
        const file = Bun.file(filePath);
        const content = await file.text();
        const minified = await minify(content, CONFIG.html);
        await Bun.write(filePath, minified);
        return true;
    } catch (e) {
        console.warn(`[WARN] HTML Minification failed for "${filePath}":`, e);
        return false;
    }
}

async function processJson(filePath: string): Promise<boolean> {
    try {
        const file = Bun.file(filePath);
        const content = await file.text();
        const minified = JSON.stringify(JSON.parse(content));
        await Bun.write(filePath, minified);
        return true;
    } catch (e) {
        console.warn(`[WARN] JSON Minification failed for "${filePath}":`, e);
        return false;
    }
}

async function processCss(filePath: string): Promise<boolean> {
    try {
        const file = Bun.file(filePath);
        const content = await file.text();

        let { code } = transform({
            filename: file.name || "unknown.css",
            code: await file.bytes(),
            minify: true,
            sourceMap: false,
        });

        await Bun.write(filePath, code);
        return true;
    } catch (error) {
        console.warn(
            `[WARN] CSS Minification failed for "${filePath}":`,
            error,
        );
        return false;
    }
}

async function processJs(filePath: string): Promise<boolean> {
    try {
        const file = Bun.file(filePath);
        const content = await file.text();

        const result = await minifyJs(content, CONFIG.js);

        if (result.code) {
            await Bun.write(filePath, result.code);
            return true;
        }
        return false;
    } catch (error) {
        console.warn(`[WARN] JS Minification failed for "${filePath}":`, error);
        return false;
    }
}

async function minifyAll() {
    console.log(`Script location: ${SCRIPT_DIR}`);
    console.log(`Resolved Root:   ${PROJECT_ROOT}`);
    console.log(`Target Site Dir: ${CONFIG.siteDir}`);

    if (!existsSync(CONFIG.siteDir)) {
        console.error(
            `\n[FATAL] Site directory not found at: ${CONFIG.siteDir}`,
        );
        console.error("Did Jekyll build fail?");
        process.exit(1);
    }

    const startTime = performance.now();

    try {
        const globOptions = {
            cwd: CONFIG.siteDir,
            absolute: true,
            nodir: true,
        };

        const [htmlFiles, jsonFiles, cssFiles, jsFiles] = await Promise.all([
            glob("**/*.html", globOptions),
            glob("**/*.json", globOptions),
            glob("**/*.css", globOptions),
            glob("**/*.js", globOptions),
        ]);

        console.log(
            `\nFound: ${htmlFiles.length} HTML, ${jsonFiles.length} JSON, ${cssFiles.length} CSS files, ${jsFiles.length} JS files.`,
        );

        const results = await Promise.all([
            ...htmlFiles.map((f) => processHtml(f)),
            ...jsonFiles.map((f) => processJson(f)),
            ...cssFiles.map((f) => processCss(f)),
            ...jsFiles.map((f) => processJs(f)),
        ]);

        const successCount = results.filter(Boolean).length;
        const duration = ((performance.now() - startTime) / 1000).toFixed(2);

        console.log(`\nMinification Complete in ${duration}s`);
        console.log(
            `   Processed: ${successCount}/${results.length} files successfully.`,
        );

        if (successCount < results.length) {
            console.warn(
                `   [WARN] ${results.length - successCount} files failed to minify (check logs above).`,
            );
        }
    } catch (error) {
        console.error("\n[FATAL] Script execution crashed:", error);
        process.exit(1);
    }
}

minifyAll();
