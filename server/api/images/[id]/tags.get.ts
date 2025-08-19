export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, "id"));
  const { getTagsForImage } =
    require("../../../utils/db") as typeof import("../../../utils/db");
  return getTagsForImage(id);
});
