const ENV = {
    DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL,
    PAGE_URL: process.env.PAGE_URL,
    PREVIOUS_CHAPTERS_PATH: process.env.PREVIOUS_CHAPTERS_PATH || "previous_state/chapters.json",
    CURRENT_CHAPTERS_PATH: process.env.CURRENT_CHAPTERS_PATH || "chapters.json",
} as const;

const MAX_DISCORD_FIELDS = 25;

interface Chapter {
    id: number;
    title: string;
    url: string;
}

async function loadChapters(path: string): Promise<Chapter[]> {
    const file = Bun.file(path);
    if (!(await file.exists())) {
        console.warn(`[WARN] File not found: ${path}. Assuming empty state.`);
        return [];
    }
    try {
        return await file.json();
    } catch (error) {
        console.error(`[ERROR] Failed to parse JSON from ${path}:`, error);
        return [];
    }
}

async function sendDiscordNotification(newChapters: Chapter[]) {
    if (!ENV.DISCORD_WEBHOOK_URL) {
        console.error("[ERROR] DISCORD_WEBHOOK_URL is missing. Skipping notification.");
        return;
    }

    if (!ENV.PAGE_URL) {
        console.warn("[WARN] PAGE_URL is missing. Links might not resolve correctly.");
    }

    const sortedChapters = newChapters.sort((a, b) => a.id - b.id);
    const chapterCount = newChapters.length;

    const fields = sortedChapters.slice(0, MAX_DISCORD_FIELDS).map((chapter) => {
        let fullUrl = chapter.url;
        try {
            if (ENV.PAGE_URL) {
                fullUrl = new URL(chapter.url, ENV.PAGE_URL).href;
            }
        } catch (e) {
            console.error("Invalid URL construction", e);
        }

        return {
            name: `Chapter ${chapter.id}`,
            value: `> [**${chapter.title}**](${fullUrl})`,
            inline: true,
        };
    });

    const titleChapter = chapterCount > 1 ? "Chapters" : "Chapter";

    const embed = {
        title: `📄 New ${titleChapter} Available`,
        description: "",
        url: ENV.PAGE_URL,
        color: 0xFFA500,
        fields: fields,
        footer: {
            text: chapterCount > MAX_DISCORD_FIELDS
                ? `...plus ${chapterCount - MAX_DISCORD_FIELDS} more awaiting you!`
                : "Happy Reading! ☕",
        },
        timestamp: new Date().toISOString(),
    };

    try {
        const response = await fetch(ENV.DISCORD_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                content: "<@&1454911310985822358>",
                embeds: [embed]
            }),
        });

        if (!response.ok) {
            console.error(`[ERROR] Discord API responded with ${response.status}: ${await response.text()}`);
        } else {
            console.log("[SUCCESS] Discord notification sent.");
        }
    } catch (error) {
        console.error("[ERROR] Failed to send webhook:", error);
    }
}

async function main() {
    console.log("Checking for new chapters...");

    const [previousChapters, currentChapters] = await Promise.all([
        loadChapters(ENV.PREVIOUS_CHAPTERS_PATH),
        loadChapters(ENV.CURRENT_CHAPTERS_PATH),
    ]);

    if (previousChapters.length === 0) {
        console.log("Previous chapter list found.");
        return;
    }

    if (currentChapters.length === 0) {
        console.log("No current chapters found. Exiting.");
        return;
    }

    const previousIds = new Set(previousChapters.map((c) => c.id));
    const newChapters = currentChapters.filter((c) => !previousIds.has(c.id));

    if (newChapters.length === 0) {
        console.log("No new chapters detected since the last build.");
        return;
    }

    console.log(`Found ${newChapters.length} new chapter(s). Sending notification...`);
    await sendDiscordNotification(newChapters);
}

main();