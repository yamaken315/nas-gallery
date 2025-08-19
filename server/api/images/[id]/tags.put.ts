export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, "id"));
  const body = await readBody<{ tags: string[] }>(event);
  const tags = (body?.tags || []).map((t) => t.trim()).filter(Boolean);
  const { setTagsForImage } = await import("../../../utils/db");
  setTagsForImage(id, tags);
  return { ok: true, tags };
});
