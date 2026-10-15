/*
 * ESLint 扁平配置（2026-10 审计 L-10）。
 *
 * 目标很具体：拦住"改完没注意"的那类问题——拼错/未使用的变量、忘了 await 的
 * 写法、在 .vue 里引用了不存在的组件。不做风格检查（缩进、引号交给编辑器），
 * 免得把噪音混进 CI 信号里。
 *
 * 规则刻意保持在"能修就修、不该报的不报"的范围：如果以后加规则，请一次加一条
 * 并当场清干净，别让 lint 变成永远红灯。
 */
import js from '@eslint/js'
import vue from 'eslint-plugin-vue'

export default [
  {
    ignores: [
      'node_modules/**',
      'frontend/dist/**',
      // 内置的 J2meJS 运行时是上游产物（外加我们的补丁），不按本站代码规范检查。
      'frontend/public/**',
      'data/**',
      'rom-upload-php/**',
    ],
  },
  js.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    files: ['**/*.js', '**/*.mjs', '**/*.vue'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        // 服务端（Node 24）
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        fetch: 'readonly',
        AbortController: 'readonly',
        CompressionStream: 'readonly',
        DecompressionStream: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        crypto: 'readonly',
        structuredClone: 'readonly',
        // 浏览器
        window: 'readonly',
        document: 'readonly',
        location: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        indexedDB: 'readonly',
        XMLHttpRequest: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        PointerEvent: 'readonly',
        TouchEvent: 'readonly',
        EventTarget: 'readonly',
        AbortSignal: 'readonly',
        ReadableStream: 'readonly',
        WritableStream: 'readonly',
        TransformStream: 'readonly',
        WebAssembly: 'readonly',
        btoa: 'readonly',
        atob: 'readonly',
        queueMicrotask: 'readonly',
        requestIdleCallback: 'readonly',
        cancelIdleCallback: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        Headers: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FormData: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        Image: 'readonly',
        performance: 'readonly',
        history: 'readonly',
        getComputedStyle: 'readonly',
        ResizeObserver: 'readonly',
        MutationObserver: 'readonly',
        IntersectionObserver: 'readonly',
        MediaStream: 'readonly',
        RTCPeerConnection: 'readonly',
        RTCSessionDescription: 'readonly',
        RTCIceCandidate: 'readonly',
        AudioContext: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        prompt: 'readonly',
        matchMedia: 'readonly',
        HTMLCanvasElement: 'readonly',
        HTMLElement: 'readonly',
        Element: 'readonly',
        Node: 'readonly',
        EventSource: 'readonly',
        WebSocket: 'readonly',
        BroadcastChannel: 'readonly',
        CSS: 'readonly',
        screen: 'readonly',
      },
    },
    rules: {
      // 未使用的变量是真信号（多半是重构漏掉的），但允许以 _ 开头的占位参数。
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      // 调试遗留
      'no-console': 'off',
      // 允许 `if (x) return` 这类单行写法
      curly: 'off',
      // 空 catch 是本站刻意的写法（清理失败不该影响主流程），保持允许
      'no-empty': ['error', { allowEmptyCatch: true }],
      // 正则里的连续空格是刻意的（测试要按原样匹配模板里的缩进），不做风格要求
      'no-regex-spaces': 'off',
    },
  },
  {
    // 路由视图是单个词的页面名（Auth / Rooms / Player …），不是可复用组件。
    files: ['frontend/src/views/**/*.vue'],
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: { globals: { process: 'readonly' } },
  },
  {
    files: ['frontend/**/*.{js,vue}'],
    languageOptions: {
      globals: { __APP_VERSION__: 'readonly' },
    },
  },
]
