import { medusaIntegrationTestRunner } from "@medusajs/test-utils";

medusaIntegrationTestRunner({
  testSuite: ({ api }) => {
    describe("smoke", () => {
      it("boots and responds to /health", async () => {
        const res = await api.get("/health");
        expect(res.status).toEqual(200);
      });
    });
  },
});
