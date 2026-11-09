// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // Alert.alert is a no-op on react-native-web: use `alert` from '@/lib/alert' instead.
    files: ["src/**/*.{ts,tsx,js,jsx}"],
    ignores: ["src/lib/alert.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='Alert'][property.name='alert']",
          message: "Use alert() from '@/lib/alert' (Alert.alert does not work on web).",
        },
      ],
    },
  },
]);
