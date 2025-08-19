import { getTagsForImage } from "../../../utils/db";

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, "id"));
  return getTagsForImage(id);
});
