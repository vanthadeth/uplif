/** Small wrappers so a blocked or full browser store never breaks the app. */
export const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch {} },
};

export const deviceId = () => {
  let id = store.get("uplif.sales.device");
  if (!id) { id = crypto.randomUUID(); store.set("uplif.sales.device", id); }
  return id;
};
