export default defineEventHandler(() => {
  const { listAllTags } =
    require("../../utils/db") as typeof import("../../utils/db");
  return listAllTags();
});
