export function simpleAdd(a: number, b: number): number {
  return a + b;
}

export function complexFunction(items: any[], filter: string): any[] {
  const results: any[] = [];
  for (const item of items) {
    if (item.type === filter) {
      if (item.active) {
        if (item.score > 10) {
          results.push(item);
        } else {
          if (item.fallback) {
            results.push(item.fallback);
          }
        }
      }
    }
  }
  return results;
}

export function withLogicalOps(a: boolean, b: boolean, c: boolean): boolean {
  return a && b || c ?? false;
}

export function withTernary(x: number): string {
  return x > 0 ? "positive" : x < 0 ? "negative" : "zero";
}

export function withSwitch(val: string): number {
  switch (val) {
    case "a":
      return 1;
    case "b":
      return 2;
    case "c":
      return 3;
    default:
      return 0;
  }
}

export function withTryCatch(fn: () => void): boolean {
  try {
    fn();
    return true;
  } catch (e) {
    if (e instanceof Error) {
      console.error(e.message);
    }
    return false;
  }
}

export const arrowFn = (x: number) => x * 2;

export const complexArrow = (items: any[]) => {
  return items.filter((i) => {
    if (i.active && i.visible) {
      return true;
    }
    return false;
  });
};
