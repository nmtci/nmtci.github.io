import { readdir } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";

const SCRIPT_DIR = import.meta.dir;
const PROJECT_ROOT = resolve(SCRIPT_DIR, "../..");

const CONFIG = {
    targetDir: join(PROJECT_ROOT, "translations"),
    outputFile: join(PROJECT_ROOT, "chapters.json"),
    chapterPattern: /^#{1,6}\s+Chapter\s+([\d\.]+)(?:\s*[:\-–])?\s*(.*)$/im,
    urlPrefix: "/translations",
} as const;

interface Chapter {
    id: number;
    title: string;
    url: string;
    fileName: string;
    filePath: string;
    content: string;
    date?: string;
}

async function parseChapterFile(fileName: string): Promise<Chapter | null> {
    const filePath = join(CONFIG.targetDir, fileName);

    try {
        const file = Bun.file(filePath);
        const content = await file.text();
        const match = content.match(CONFIG.chapterPattern);

        if (!match) {
            console.warn(
                `[WARN] Skipping "${fileName}": No valid chapter header found.`,
            );
            return null;
        }

        const [, idStr, rawTitle] = match;
        const cleanFileName = basename(fileName, extname(fileName));

        if (!idStr) {
            console.warn(
                `[WARN] Skipping "${fileName}": Match found but ID is missing.`,
            );
            return null;
        }

        return {
            id: parseFloat(idStr),
            title: (rawTitle || "").trim(),
            url: `${CONFIG.urlPrefix}/${cleanFileName}`,
            fileName: cleanFileName,
            filePath: filePath,
            content: content,
        };
    } catch (error) {
        console.error(`[ERROR] Failed to read file "${fileName}":`, error);
        return null;
    }
}

function parseFrontMatter(content: string): {
    fields: Record<string, string>;
    body: string;
} {
    const frontMatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
    const match = content.match(frontMatterRegex);

    if (!match) {
        return { fields: {}, body: content };
    }

    const [, rawFields, body] = match;
    const fields: Record<string, string> = {};

    for (const line of rawFields.split(/\r?\n/)) {
        const lineMatch = line.match(/^(\w+):\s*"?(.*?)"?\s*$/);
        if (lineMatch) {
            const [, key, value] = lineMatch;
            fields[key] = value;
        }
    }

    return { fields, body };
}

async function updateFileWithFrontMatter(
    chapter: Chapter,
    prev: Chapter | undefined,
    next: Chapter | undefined,
): Promise<void> {
    const { body } = parseFrontMatter(chapter.content);

    const safeTitle = chapter.title.replace(/"/g, '\\"');

    const frontMatter = `---
title: "${safeTitle}"
id: "${chapter.id}"
prev: "${prev ? prev.fileName : ""}"
next: "${next ? next.fileName : ""}"
---
`;

    await Bun.write(chapter.filePath, frontMatter + body);
}

async function writeIndexFile(chapters: Chapter[]): Promise<void> {
    const cleanChapters = chapters.map(({ id, title, url, date }) => ({
        id,
        title,
        url,
        date,
    }));

    // Workaround to make Jekyll access chapter.json without relying on symlinks.
    const jsonData = JSON.stringify(cleanChapters, null, 2);
    const jekyllDataDir = join(PROJECT_ROOT, "_data");
    const jekyllOutputFile = join(jekyllDataDir, "chapters.json");

    try {
        await Bun.write(CONFIG.outputFile, jsonData);
        await Bun.write(jekyllOutputFile, jsonData);

        console.log(`\nSuccess: Indexed ${chapters.length} chapters.`);
        console.log(` -> Saved to: ${CONFIG.outputFile}`);
        console.log(` -> Saved to: ${jekyllOutputFile}`);
    } catch (error) {
        throw new Error(
            `Failed to write output files: ${error instanceof Error ? error.message : error}`,
        );
    }
}

async function generateWebIndex() {
    console.log(`Script location: ${SCRIPT_DIR}`);
    console.log(`Resolved Root:   ${PROJECT_ROOT}`);
    console.log(`Scanning:        ${CONFIG.targetDir}...`);

    try {
        const allFiles = await readdir(CONFIG.targetDir);
        const mdFiles = allFiles.filter((file) => file.endsWith(".md"));

        if (mdFiles.length === 0) {
            console.warn("No markdown files found in the target directory.");
            return;
        }

        const results = await Promise.all(mdFiles.map(parseChapterFile));

        const validChapters = results
            .filter((c): c is Chapter => c !== null)
            .sort((a, b) => a.id - b.id);

        console.log(
            `Found ${validChapters.length} valid chapters. Resolving dates...`,
        );

        let existingIndex: any[] = [];
        const indexFile = Bun.file(CONFIG.outputFile);

        if (await indexFile.exists()) {
            try {
                existingIndex = await indexFile.json();
            } catch (e) {
                console.warn(
                    "[WARN] Could not parse existing chapters.json, treating as empty.",
                );
            }
        }

        const existingDates = new Map<number, string>();
        for (const item of existingIndex) {
            if (item.id !== undefined && item.date) {
                existingDates.set(item.id, item.date);
            }
        }

        const BASELINE_DATE = "2026-03-10";
        const TODAY = new Date().toISOString().split("T")[0];
        const isFirstRun = existingDates.size === 0;

        for (const chapter of validChapters) {
            if (existingDates.has(chapter.id)) {
                chapter.date = existingDates.get(chapter.id)!;
            } else {
                chapter.date = isFirstRun ? BASELINE_DATE : TODAY;
                console.log(
                    `  [date] Assigned new date "${chapter.date}" to Chapter ${chapter.id}`,
                );
            }
        }

        console.log("Injecting front matter...");

        for (let i = 0; i < validChapters.length; i++) {
            const current = validChapters[i];
            const prev = validChapters[i - 1];
            const next = validChapters[i + 1];

            await updateFileWithFrontMatter(current, prev, next);
        }
        console.log("Front matter injection complete.");

        await writeIndexFile(validChapters);
    } catch (error) {
        console.error("\nFatal Error:", error);
        process.exit(1);
    }
}

generateWebIndex();
