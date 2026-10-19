import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";

/** Read project-local defaults without changing the process environment. */
export function readLocalConfig(project) {
  try {
    return parseEnv(readFileSync(join(project, ".env.local"), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}
