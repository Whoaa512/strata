import type { ExtractionResult } from "./extract";

export interface LanguageExtractor {
  extensions: string[];
  extract(rootDir: string, filePaths: string[]): ExtractionResult;
}
