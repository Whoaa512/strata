import { z } from "zod/v4";

export const EntityKind = z.enum([
  "function",
  "class",
  "method",
  "module",
  "file",
]);
export type EntityKind = z.infer<typeof EntityKind>;

export const EdgeKind = z.enum([
  "calls",
  "depends_on",
  "contains",
  "co_changes_with",
]);
export type EdgeKind = z.infer<typeof EdgeKind>;

export const LocationSchema = z.object({
  file: z.string(),
  startLine: z.number().int().nonnegative(),
  endLine: z.number().int().nonnegative(),
});
export type Location = z.infer<typeof LocationSchema>;

export const MetricsSchema = z.object({
  cognitiveComplexity: z.number().nonnegative(),
  cyclomaticComplexity: z.number().int().nonnegative().optional(),
  nestingDepth: z.number().int().nonnegative(),
  parameterCount: z.number().int().nonnegative().optional(),
  lineCount: z.number().int().positive(),
  fanIn: z.number().int().nonnegative(),
  fanOut: z.number().int().nonnegative(),
});
export type Metrics = z.infer<typeof MetricsSchema>;

export const ChurnDataSchema = z.object({
  commits: z.number().int().nonnegative(),
  authors: z.number().int().nonnegative(),
  lastModified: z.string(),
  linesAdded: z.number().int().nonnegative(),
  linesDeleted: z.number().int().nonnegative(),
});
export type ChurnData = z.infer<typeof ChurnDataSchema>;

export const EntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: EntityKind,
  location: LocationSchema,
  metrics: MetricsSchema,
  churn: ChurnDataSchema.optional(),
});
export type Entity = z.infer<typeof EntitySchema>;

export const EdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  kind: EdgeKind,
  weight: z.number().nonnegative().optional(),
});
export type Edge = z.infer<typeof EdgeSchema>;

export const HotspotSchema = z.object({
  entityId: z.string(),
  score: z.number().nonnegative(),
  complexity: z.number().nonnegative(),
  churn: z.number().int().nonnegative(),
});
export type Hotspot = z.infer<typeof HotspotSchema>;

export const BlastRadiusSchema = z.object({
  entityId: z.string(),
  forwardSlice: z.array(z.string()),
  testCoverage: z.number().min(0).max(1),
  changeCoupling: z.array(z.string()),
  contributorCount: z.number().int().nonnegative(),
  riskScore: z.number().nonnegative(),
});
export type BlastRadius = z.infer<typeof BlastRadiusSchema>;

export const TemporalCouplingSchema = z.object({
  fileA: z.string(),
  fileB: z.string(),
  coChangeCount: z.number().int().positive(),
  totalCommits: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
  hasStaticDependency: z.boolean(),
});
export type TemporalCoupling = z.infer<typeof TemporalCouplingSchema>;

export const StrataDocumentSchema = z.object({
  version: z.literal("0.1.0"),
  repository: z.string(),
  analyzedAt: z.string(),
  entities: z.array(EntitySchema),
  edges: z.array(EdgeSchema),
  hotspots: z.array(HotspotSchema),
  blastRadii: z.array(BlastRadiusSchema),
  temporalCouplings: z.array(TemporalCouplingSchema),
});
export type StrataDocument = z.infer<typeof StrataDocumentSchema>;
