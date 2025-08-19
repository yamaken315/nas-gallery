import { getImageById } from "../../utils/db";

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, "id"));
  return getImageById(id);
});
