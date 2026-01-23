import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface SessionFile {
	path: string;
	sessionId: string;
	projectName: string;
	modifiedAt: Date;
	size: number;
}

const CLAUDE_CODE_PROJECTS_PATH = join(homedir(), ".claude", "projects");

export interface SessionFileWithSummary extends SessionFile {
	title: string;
	preview: string;
	messageCount: number;
	content: string;
}

/**
 * Discover Claude Code sessions from ~/.claude/projects/
 * Returns sessions sorted by modification time (most recent first)
 * Filters out agent files, warmup sessions, and empty sessions
 */
export async function findClaudeCodeSessions(): Promise<
	SessionFileWithSummary[]
> {
	const sessions: SessionFileWithSummary[] = [];

	try {
		const projectDirs = await readdir(CLAUDE_CODE_PROJECTS_PATH);

		for (const projectDir of projectDirs) {
			const projectPath = join(CLAUDE_CODE_PROJECTS_PATH, projectDir);
			const projectStat = await stat(projectPath);

			if (!projectStat.isDirectory()) continue;

			const files = await readdir(projectPath);

			for (const file of files) {
				// Only process .jsonl files, skip agent files
				if (!file.endsWith(".jsonl")) continue;
				if (file.startsWith("_") || file.startsWith("agent-")) continue;

				const filePath = join(projectPath, file);
				const fileStat = await stat(filePath);

				// Skip empty files
				if (fileStat.size === 0) continue;

				const content = await readSessionContent(filePath);
				const { title, preview, messageCount } =
					extractSessionMetadata(content);

				if (
					title.toLowerCase() === "warmup" ||
					title === "No content available"
				) {
					continue;
				}

				sessions.push({
					path: filePath,
					sessionId: file.replace(".jsonl", ""),
					projectName: projectDir,
					modifiedAt: fileStat.mtime,
					size: fileStat.size,
					title,
					preview,
					messageCount,
					content,
				});
			}
		}
	} catch (error) {
		// If the directory doesn't exist, return empty array
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return [];
		}
		throw error;
	}

	// Sort by modification time, most recent first
	return sessions.sort(
		(a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime(),
	);
}

/**
 * Read raw JSONL content from a session file
 */
export async function readSessionContent(path: string): Promise<string> {
	const file = Bun.file(path);
	return file.text();
}

/**
 * Extract text from message content (handles both string and array formats)
 * Skips content starting with "<" to filter out HTML/XML-like markup
 */
function extractTextFromContent(content: unknown): string | null {
	if (typeof content === "string") {
		const trimmed = content.trim();
		// Skip HTML/XML-like content
		if (trimmed.startsWith("<")) return null;
		return trimmed;
	}

	if (Array.isArray(content)) {
		// Find text blocks, skip those starting with "<"
		for (const block of content) {
			if (block.type === "text" && block.text) {
				const trimmed = block.text.trim();
				if (!trimmed.startsWith("<")) {
					return trimmed;
				}
			}
		}
	}

	return null;
}

interface SessionMetadata {
	title: string;
	preview: string;
	messageCount: number;
}

const JUNK_PREFIXES = [
	"```",
	"$ ",
	"diff --git",
	"Traceback",
	"Error:",
	"npm ",
	"bun ",
	"git ",
	"pnpm ",
	"yarn ",
	"cd ",
	"mkdir ",
	"cat ",
	"ls ",
];

const ACTION_VERBS = [
	"fix",
	"add",
	"refactor",
	"implement",
	"explain",
	"create",
	"update",
	"remove",
	"debug",
	"help",
	"build",
	"write",
	"change",
	"modify",
	"improve",
];

function scoreCandidate(text: string): number {
	let score = 10;
	const lower = text.toLowerCase();

	for (const prefix of JUNK_PREFIXES) {
		if (lower.startsWith(prefix.toLowerCase())) {
			score -= 15;
		}
	}

	for (const verb of ACTION_VERBS) {
		if (lower.includes(verb)) {
			score += 5;
			break;
		}
	}

	if (text.includes("/") && text.match(/\.[a-z]{1,4}\b/i)) {
		score += 3;
	}

	if (text.length < 10) score -= 5;
	if (text.length > 200) score -= 3;

	const letterRatio = (text.match(/[a-zA-Z]/g)?.length || 0) / text.length;
	if (letterRatio < 0.5) score -= 10;

	return score;
}

function truncateCleanly(text: string, maxLength: number): string {
	const cleaned = text
		.replace(/^#+\s+/, "")
		.replace(/\s+/g, " ")
		.trim();

	if (cleaned.length <= maxLength) return cleaned;

	const truncated = cleaned.slice(0, maxLength);
	const lastSpace = truncated.lastIndexOf(" ");
	if (lastSpace > maxLength * 0.7) {
		return `${truncated.slice(0, lastSpace)}...`;
	}
	return `${truncated}...`;
}

export function extractSessionMetadata(content: string): SessionMetadata {
	const lines = content.trim().split("\n");

	interface ParsedEntry {
		type?: string;
		isMeta?: boolean;
		message?: { content?: unknown };
	}

	const candidates: Array<{ text: string; score: number; source: string }> = [];
	let messageCount = 0;

	for (const line of lines) {
		let entry: ParsedEntry;
		try {
			entry = JSON.parse(line);
		} catch {
			continue;
		}

		if (entry.type === "user" || entry.type === "assistant") {
			messageCount++;
		}

		if (entry.type === "summary" && entry.message?.content) {
			const text = extractTextFromContent(entry.message.content);
			if (text) {
				candidates.push({ text, score: 100, source: "summary" });
			}
		}

		if (entry.type === "user" && !entry.isMeta && entry.message?.content) {
			const text = extractTextFromContent(entry.message.content);
			if (text) {
				const score = scoreCandidate(text);
				candidates.push({ text, score, source: "user" });
			}
		}
	}

	candidates.sort((a, b) => b.score - a.score);

	const best = candidates[0];
	if (!best) {
		return {
			title: "No content available",
			preview: "No preview available",
			messageCount,
		};
	}

	return {
		title: truncateCleanly(best.text, 70),
		preview: truncateCleanly(best.text, 120),
		messageCount,
	};
}

/** @deprecated Use extractSessionMetadata instead */
export function getSessionSummary(content: string, maxLength = 50): string {
	const { title } = extractSessionMetadata(content);
	return title.length > maxLength ? `${title.slice(0, maxLength)}...` : title;
}

/**
 * Format relative time for display (e.g., "2 min ago", "1 hour ago")
 */
export function formatRelativeTime(date: Date): string {
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffSecs = Math.floor(diffMs / 1000);
	const diffMins = Math.floor(diffSecs / 60);
	const diffHours = Math.floor(diffMins / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (diffSecs < 60) return "just now";
	if (diffMins < 60) return `${diffMins} min ago`;
	if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
	if (diffDays === 1) return "yesterday";
	return `${diffDays} days ago`;
}

/**
 * Format project name for display
 * Converts encoded paths like "-Users-kamal-workspace-moon" to "moon"
 * or "-Users-kamal-workspace-claude-plugins-packages-cli" to "claude-plugins/packages/cli"
 */
export function formatProjectName(encodedName: string): string {
	// Decode the path: "-Users-kamal-workspace-moon" -> "/Users/kamal/workspace/moon"
	// The encoding replaces "/" with "-" and the path starts with "-"
	const decoded = encodedName.replace(/^-/, "/").replace(/-/g, "/");

	// Find common base paths to strip
	const basePaths = [
		`${homedir()}/workspace/`,
		`${homedir()}/projects/`,
		`${homedir()}/code/`,
		`${homedir()}/dev/`,
		`${homedir()}/`,
	];

	for (const basePath of basePaths) {
		if (decoded.startsWith(basePath)) {
			return decoded.slice(basePath.length);
		}
	}

	// Fallback: return last segment
	const segments = decoded.split("/").filter(Boolean);
	return segments[segments.length - 1] || encodedName;
}
