const enterprise = [
  // Saucer, neck and engineering hull.
  "M12 2C8.4 2 5.5 3.5 5.5 5.4c0 1.7 2.3 3 5.3 3.3v2.6",
  "l-1.1 2.2v5.1L12 22l2.3-3.4v-5.1l-1.1-2.2V8.7c3-.3 5.3-1.6 5.3-3.3C18.5 3.5 15.6 2 12 2Z",
  // Port and starboard nacelles with swept pylons.
  "M3.5 9a1.5 1.5 0 0 0-1.5 1.5V20h3v-5.1l4 2.6v-2.3l-4-2.6v-2.1A1.5 1.5 0 0 0 3.5 9Z",
  "M20.5 9A1.5 1.5 0 0 0 19 10.5v2.1l-4 2.6v2.3l4-2.6V20h3v-9.5A1.5 1.5 0 0 0 20.5 9Z",
].join(" ");

(window.customIcons ??= {}).haus_ops = {
  async getIcon(name) {
    return name === "enterprise" ? { path: enterprise } : undefined;
  },
  async getIconList() {
    return [{ name: "enterprise", keywords: ["raumschiff", "star trek"] }];
  },
};
