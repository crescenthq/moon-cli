import { execSync } from "node:child_process";

/**
 * Get the git remote URL for the origin remote
 * Returns undefined if not a git repo or no origin remote configured
 */
export function getGitRemoteUrl(cwd: string): string | undefined {
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
export function parseRepoNameFromUrl(url: string): string | undefined {
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
