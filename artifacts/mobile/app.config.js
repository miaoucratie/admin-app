// Dynamic Expo config. Extends app.json (passed in as `config`).
// EXPO_BASE_URL is set only for the static web export so assets resolve
// under the hosting subfolder (e.g. "/indispo"). Left unset in dev so the
// Replit Expo preview keeps serving at "/".
module.exports = ({ config }) => {
  const baseUrl = process.env.EXPO_BASE_URL;
  return {
    ...config,
    experiments: {
      ...(config.experiments || {}),
      ...(baseUrl ? { baseUrl } : {}),
    },
  };
};
