export function helperA() {
  return helperB();
}

export function helperB() {
  return helperC();
}

export function helperC() {
  return 42;
}

export function orchestrator() {
  const a = helperA();
  const b = helperB();
  return a + b;
}

export function isolated() {
  return "I call nothing";
}
