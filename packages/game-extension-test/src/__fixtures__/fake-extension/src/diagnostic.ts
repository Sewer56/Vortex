export const healthChecks = [
  {
    id: "fake-check",
    checkMod: async () => ({
      checkId: "fake-check",
      status: "passed",
      severity: "info",
      message: "ok",
      executionTime: 0,
      timestamp: new Date(0),
    }),
  },
];
