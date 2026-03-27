function add(a, b) {
  return a + b;
}

function conditionalLogic(x) {
  if (x > 10) {
    if (x > 20) {
      return "very high";
    }
    return "high";
  } else {
    return "low";
  }
}

const multiply = (a, b) => a * b;

module.exports = { add, conditionalLogic, multiply };
