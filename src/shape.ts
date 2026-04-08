import type { StrataDoc } from "./schema";
import { getPackageBoundaries } from "./ripple";

type SafetyRating = "red" | "yellow" | "green";
type RiskMix = Record<SafetyRating, number>;

export interface PackageShape {
  name: string;
  fileCount: number;
  entityCount: number;
  risk: RiskMix;
  maxRipple: number;
  contextCost: number;
  topRiskFiles: string[];
}

export interface HiddenCouplingShape {
  fromPackage: string;
  toPackage: string;
  fileA: string;
  fileB: string;
  confidence: number;
}

export interface CodebaseShape {
  entityCount: number;
  fileCount: number;
  packageCount: number;
  packages: PackageShape[];
  hiddenCouplings: HiddenCouplingShape[];
}

export function buildCodebaseShape(doc: StrataDoc): CodebaseShape {
  const pkgByFile = doc.rootDir ? getPackageBoundaries(doc.entities, doc.rootDir) : new Map<string, string>();
  const riskByEntity = new Map(doc.agentRisk.map(r => [r.entityId, r]));
  const rippleByEntity = new Map(doc.changeRipple.map(r => [r.entityId, r]));
  const packages = new Map<string, PackageShape>();
  const files = new Set<string>();
  const filesByPackage = new Map<string, Set<string>>();

  for (const entity of doc.entities) {
    files.add(entity.filePath);
    const pkg = pkgByFile.get(entity.filePath) ?? ".";
    const pkgFiles = filesByPackage.get(pkg) ?? new Set<string>();
    pkgFiles.add(entity.filePath);
    filesByPackage.set(pkg, pkgFiles);

    const shape = getPackageShape(packages, pkg);
    shape.entityCount += 1;

    const risk = riskByEntity.get(entity.id);
    if (risk) {
      shape.risk[risk.safetyRating] += 1;
      shape.contextCost = Math.max(shape.contextCost, risk.contextCost);
      if (risk.safetyRating !== "green") shape.topRiskFiles.push(entity.filePath);
    }

    const ripple = rippleByEntity.get(entity.id);
    if (ripple) shape.maxRipple = Math.max(shape.maxRipple, ripple.rippleScore);
  }

  for (const shape of packages.values()) {
    shape.fileCount = filesByPackage.get(shape.name)?.size ?? 0;
    shape.topRiskFiles = Array.from(new Set(shape.topRiskFiles)).slice(0, 5);
  }

  const hiddenCouplings = doc.temporalCoupling
    .filter(c => !c.hasStaticDependency && c.confidence >= 0.3)
    .map(c => ({
      fromPackage: pkgByFile.get(c.fileA) ?? ".",
      toPackage: pkgByFile.get(c.fileB) ?? ".",
      fileA: c.fileA,
      fileB: c.fileB,
      confidence: c.confidence,
    }))
    .filter(c => c.fromPackage !== c.toPackage)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 20);

  return {
    entityCount: doc.entities.length,
    fileCount: files.size,
    packageCount: packages.size,
    packages: Array.from(packages.values()).sort(comparePackageShape),
    hiddenCouplings,
  };
}

function getPackageShape(packages: Map<string, PackageShape>, name: string): PackageShape {
  const existing = packages.get(name);
  if (existing) return existing;

  const shape: PackageShape = {
    name,
    fileCount: 0,
    entityCount: 0,
    risk: { red: 0, yellow: 0, green: 0 },
    maxRipple: 0,
    contextCost: 0,
    topRiskFiles: [],
  };
  packages.set(name, shape);
  return shape;
}

function comparePackageShape(a: PackageShape, b: PackageShape): number {
  const riskDelta = b.risk.red - a.risk.red || b.risk.yellow - a.risk.yellow;
  if (riskDelta !== 0) return riskDelta;
  return a.name.localeCompare(b.name);
}
