import { execSync } from "node:child_process";

export type ProjectInfo = {
	projectName: string;
	gitRemoteUrl?: string;
};

// Cache project info by cwd to avoid repeated git commands
const projectInfoCache = new Map<string, ProjectInfo>();

/**
 * Get project info (name and git remote URL) for a directory
 * Results are cached by cwd to avoid repeated git commands
 *
 * Strategy:
 * 1. Try to get project name from git remote URL
 * 2. Fall back to directory name if not a git repo
 */
export function getProjectInfo(cwd: string): ProjectInfo {
	const cached = projectInfoCache.get(cwd);
	if (cached) {
		return cached;
	}

	const gitRemoteUrl = getGitRemoteUrl(cwd);
	let projectName: string | undefined;

	if (gitRemoteUrl) {
		projectName = parseRepoNameFromUrl(gitRemoteUrl);
	}

	// Fallback to directory name
	if (!projectName) {
		const cwdParts = cwd.split("/").filter(Boolean);
		projectName = cwdParts[cwdParts.length - 1] || "unknown";
	}

	const info: ProjectInfo = { projectName, gitRemoteUrl };
	projectInfoCache.set(cwd, info);
	return info;
}

/**
 * Get the git remote URL for the origin remote
 * Returns undefined if not a git repo or no origin remote configured
 */
function getGitRemoteUrl(cwd: string): string | undefined {
	try {
		const result = execSync("git remote get-url origin", {
			cwd,
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});
		return result.trim() || undefined;
	} catch {
		return undefined;
	}
}

/**
 * Parse repository name from a git URL
 * Handles both SSH and HTTPS formats:
 * - git@github.com:user/moon-cli.git -> moon-cli
 * - https://github.com/user/moon-cli.git -> moon-cli
 * - https://github.com/user/moon-cli -> moon-cli
 */
function parseRepoNameFromUrl(url: string): string | undefined {
	// Remove trailing .git if present
	const cleaned = url.replace(/\.git$/, "");

	// Handle SSH format: git@github.com:user/repo
	const sshMatch = cleaned.match(/:([^/]+\/[^/]+)$/);
	if (sshMatch) {
		const repoPath = sshMatch[1];
		return repoPath?.split("/").pop();
	}

	// Handle HTTPS format: https://github.com/user/repo
	const httpsMatch = cleaned.match(/\/([^/]+)$/);
	if (httpsMatch) {
		return httpsMatch[1];
	}

	return undefined;
}
