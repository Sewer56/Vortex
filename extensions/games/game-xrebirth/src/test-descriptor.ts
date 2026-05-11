/**
 * Per-game test harness descriptor. Consumed by `@vortex/game-extension-test`.
 *
 * The shape is mirrored from `IGameExtensionTestDescriptor` in
 * `@vortex/game-extension-test` to avoid the import dependency cycle during
 * normalization. Once the harness package is a devDep, the import can be
 * restored.
 */
export const testDescriptor = {
  gameId: "xrebirth",
  nexusGameDomain: "xrebirth",
  fixtures: {
    mostPopular: 0,
    mostRecent: 0,
    oldest: 0,
    allCollections: false,
    all: true,
  } as const,
  syntheticContent: {
    "content.xml": ({ manifestId }: { manifestId: string }) =>
      `<content id="mod-${manifestId}" name="Test ${manifestId}" version="1.0" author="harness"/>`,
  },
};
