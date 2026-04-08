import { existsSync, statSync } from "fs";
import path from "path";

export interface BriefArgs {
  briefTarget: string;
  briefFile?: string;
}

export function resolveBriefArgs(args: string[], cwd = process.cwd()): BriefArgs {
  const firstArg = args[0];
  const briefFile = args[1];

  if (!firstArg) return { briefTarget: "." };
  if (briefFile) return { briefTarget: firstArg, briefFile };

  const firstPath = path.resolve(cwd, firstArg);
  if (existsSync(firstPath) && statSync(firstPath).isFile()) {
    return { briefTarget: ".", briefFile: firstArg };
  }

  return { briefTarget: firstArg };
}
