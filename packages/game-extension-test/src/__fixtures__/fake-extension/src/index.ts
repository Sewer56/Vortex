function main(context: any): boolean {
  context.registerGame({ id: "fake", name: "Fake" });
  context.registerInstaller(
    "fake",
    50,
    async () => ({ supported: true, requiredFiles: [] }),
    async () => ({ instructions: [] }),
  );
  return true;
}
export default main;
