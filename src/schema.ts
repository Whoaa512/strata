import { z } from "zod";

export const MetricsSchema = z.object({
  cyclomatic: z.number().int().nonnegative(),
  cognitive: z.number().int().nonnegative(),
  loc: z.number().int().nonnegative(),
  maxNestingDepth: z.number().int().nonnegative(),
  parameterCount: z.number().int().nonnegative(),
});

export const EntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["function", "method", "class", "arrow", "getter", "setter"]),
  filePath: z.string(),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  metrics: MetricsSchema,
});

export const CallEdgeSchema = z.object({
  caller: z.string(),
  callee: z.string(),
});

export const ChurnEntrySchema = z.object({
  filePath: z.string(),
  commits: z.number().int().nonnegative(),
  linesAdded: z.number().int().nonnegative(),
  linesDeleted: z.number().int().nonnegative(),
});

export const TemporalCouplingSchema = z.object({
  fileA: z.string(),
  fileB: z.string(),
  cochangeCount: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
  hasStaticDependency: z.boolean(),
});

export const HotspotSchema = z.object({
  entityId: z.string(),
  score: z.number().nonnegative(),
  complexity: z.number().nonnegative(),
  churn: z.number().nonnegative(),
});

export const BlastRadiusSchema = z.object({
  entityId: z.string(),
  directCallers: z.array(z.string()),
  transitiveCallers: z.array(z.string()),
  radius: z.number().int().nonnegative(),
});

export const FileErrorSchema = z.object({
  filePath: z.string(),
  error: z.string(),
});

export const StrataDocSchema = z.object({
  version: z.literal("0.1.0"),
  analyzedAt: z.string().datetime(),
  rootDir: z.string(),
  entities: z.array(EntitySchema),
  callGraph: z.array(CallEdgeSchema),
  churn: z.array(ChurnEntrySchema),
  temporalCoupling: z.array(TemporalCouplingSchema),
  hotspots: z.array(HotspotSchema),
  blastRadius: z.array(BlastRadiusSchema),
  errors: z.array(FileErrorSchema),
});

export type Metrics = z.infer<typeof MetricsSchema>;
export type Entity = z.infer<typeof EntitySchema>;
export type CallEdge = z.infer<typeof CallEdgeSchema>;
export type ChurnEntry = z.infer<typeof ChurnEntrySchema>;
export type TemporalCoupling = z.infer<typeof TemporalCouplingSchema>;
export type Hotspot = z.infer<typeof HotspotSchema>;
export type BlastRadius = z.infer<typeof BlastRadiusSchema>;
export type FileError = z.infer<typeof FileErrorSchema>;
export type StrataDoc = z.infer<typeof StrataDocSchema>;
