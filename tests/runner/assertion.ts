export class AssertionError extends Error {
  constructor(
    public readonly expected: any,
    public readonly actual: any,
    message: string
  ) {
    super(message);
    this.name = "AssertionError";
  }
}

export const assert = {
  ok(value: any, message?: string) {
    if (!value) {
      throw new AssertionError(true, value, message || "Expected value to be truthy");
    }
  },

  equal(actual: any, expected: any, message?: string) {
    if (actual !== expected) {
      throw new AssertionError(expected, actual, message || `Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`);
    }
  },

  notEqual(actual: any, expected: any, message?: string) {
    if (actual === expected) {
      throw new AssertionError(`Not ${JSON.stringify(expected)}`, actual, message || `Expected actual to not equal ${JSON.stringify(expected)}`);
    }
  },

  deepEqual(actual: any, expected: any, message?: string) {
    const isObject = (object: any) => object != null && typeof object === 'object';
    const deepCompare = (obj1: any, obj2: any): boolean => {
      if (obj1 === obj2) return true;
      if (!isObject(obj1) || !isObject(obj2)) return false;
      const keys1 = Object.keys(obj1);
      const keys2 = Object.keys(obj2);
      if (keys1.length !== keys2.length) return false;
      for (const key of keys1) {
        if (!keys2.includes(key)) return false;
        if (!deepCompare(obj1[key], obj2[key])) return false;
      }
      return true;
    };

    if (!deepCompare(actual, expected)) {
      throw new AssertionError(expected, actual, message || `Expected deep equality of ${JSON.stringify(expected)} and ${JSON.stringify(actual)}`);
    }
  },

  throws(fn: () => void, expectedErrorSubstring?: string, message?: string) {
    let threw = false;
    let thrownError: any = null;
    try {
      fn();
    } catch (err) {
      threw = true;
      thrownError = err;
    }

    if (!threw) {
      throw new AssertionError("Function to throw", "Function did not throw", message || "Expected function to throw an error");
    }

    if (expectedErrorSubstring && thrownError) {
      const errMsg = thrownError.message || String(thrownError);
      if (!errMsg.includes(expectedErrorSubstring)) {
        throw new AssertionError(
          `Error matching substring: "${expectedErrorSubstring}"`,
          `Actual error: "${errMsg}"`,
          message || "Error thrown did not contain expected substring"
        );
      }
    }
  },

  async throwsAsync(fn: () => Promise<any>, expectedErrorSubstring?: string, message?: string) {
    let threw = false;
    let thrownError: any = null;
    try {
      await fn();
    } catch (err) {
      threw = true;
      thrownError = err;
    }

    if (!threw) {
      throw new AssertionError("Function to throw", "Function did not throw", message || "Expected async function to throw an error");
    }

    if (expectedErrorSubstring && thrownError) {
      const errMsg = thrownError.message || String(thrownError);
      if (!errMsg.includes(expectedErrorSubstring)) {
        throw new AssertionError(
          `Error matching substring: "${expectedErrorSubstring}"`,
          `Actual error: "${errMsg}"`,
          message || "Error thrown did not contain expected substring"
        );
      }
    }
  }
};
