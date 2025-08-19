import type { H3Event } from "h3";

export default defineEventHandler(async (event: H3Event) => {
  const config = useRuntimeConfig();
  const auth = getRequestHeader(event, "authorization");
  if (!auth?.startsWith("Basic ")) return deny(event);
  const decoded = Buffer.from(auth.slice(6), "base64").toString();
  const [user, pass] = decoded.split(":");
  if (user !== config.authUser) return deny(event);
  const stored = config.authPasswordHash;
  if (stored.startsWith("plain:")) {
    if (pass !== stored.slice(6)) return deny(event);
  } else if (stored) {
    // TODO: bcrypt compare (未実装時は拒否)
    return deny(event);
  } else {
    return deny(event);
  }
});

function deny(event: H3Event) {
  setResponseHeader(event, "WWW-Authenticate", 'Basic realm="NAS Gallery"');
  throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
}
