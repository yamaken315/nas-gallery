export default defineEventHandler(async () => {
  const { listAllTags } = await import("../../utils/db");
  return listAllTags();
});
