// eslint.config.js
import js from "@eslint/js";

export default [
  // Cấu hình mặc định cho JS
  js.configs.recommended,

  {
    files: ["**/*.js"],
    ignores: ["node_modules/**", "dist/**"],

    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },

    rules: {
      // Quy tắc cơ bản
      "no-unused-vars": "warn",        // Cảnh báo biến khai báo nhưng không dùng
      "no-console": "off",             // Cho phép console.log (nếu muốn cấm thì để "warn" hoặc "error")
      "eqeqeq": ["error", "always"],   // Bắt buộc dùng === thay vì ==
      "semi": ["error", "always"],     // Bắt buộc có dấu chấm phẩy
      "quotes": ["error", "double"],   // Bắt buộc dùng nháy kép
    },
  },
];
