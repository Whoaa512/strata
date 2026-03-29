import type { MetricPlugin } from "../plugin";
import { cyclomaticPlugin } from "./cyclomatic";
import { cognitivePlugin } from "./cognitive";
import { locPlugin } from "./loc";
import { nestingPlugin } from "./nesting";
import { paramsPlugin } from "./params";

export const defaultPlugins: MetricPlugin[] = [
  cyclomaticPlugin,
  cognitivePlugin,
  locPlugin,
  nestingPlugin,
  paramsPlugin,
];
