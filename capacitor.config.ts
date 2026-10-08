const config = {
  appId: "com.sevenx.anime",
  appName: "7xAnime",
  webDir: "out",
  server: {
    androidScheme: "https",
  },
  android: {
    // Allow the HTTPS-served Capacitor UI to call the loopback-only HTTP API.
    allowMixedContent: true,
  },
};

export default config;
