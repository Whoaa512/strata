export { initParser, parseSource, parseFile, detectLang } from "./src/parser";
export { extractFunctions } from "./src/complexity";
export { computeChurn, getCommitFileSets } from "./src/churn";
export { extractCallEdges, buildCallGraph, computeForwardSlice, computeBlastRadii } from "./src/callgraph";
export { computeHotspots } from "./src/hotspots";
export { computeTemporalCoupling } from "./src/coupling";
export { buildReport } from "./src/report";
export type * from "./src/types";
