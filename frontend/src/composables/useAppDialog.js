import { readonly, ref, shallowRef } from 'vue'

// 所有调用共用 App.vue 中的居中弹窗；排队展示，避免并发提示覆盖确认结果。
export function createAppDialog() {
  const activeDialog = shallowRef(null)
  const error = ref('')
  const queue = []
  let activeRequest = null
  let nextId = 0

  function openNext() {
    activeRequest = queue.shift() || null
    error.value = ''
    activeDialog.value = activeRequest?.dialog || null
  }

  function request(type, message, options = {}) {
    return new Promise((resolve) => {
      queue.push({
        dialog: {
          title: type === 'confirm' ? '请确认' : type === 'prompt' ? '请输入' : '提示',
          confirmText: type === 'alert' ? '知道了' : '确定',
          cancelText: '取消',
          ...options,
          id: ++nextId,
          type,
          message,
        },
        resolve,
      })
      if (!activeRequest) openNext()
    })
  }

  function finish(value) {
    const request = activeRequest
    if (!request) return
    openNext()
    request.resolve(value)
  }

  function submitDialog(value = '') {
    const dialog = activeDialog.value
    if (!dialog) return false
    if (dialog.type === 'prompt') {
      const input = String(value).trim()
      error.value = dialog.validate?.(input) || ''
      if (error.value) return false
      finish(input)
    } else {
      finish(true)
    }
    return true
  }

  function cancelDialog() {
    finish(activeDialog.value?.type === 'prompt' ? null : false)
  }

  // 路由切换或宿主卸载时取消所有等待中的操作，禁止旧页面的确认继续执行。
  function cancelAll() {
    const pending = [...(activeRequest ? [activeRequest] : []), ...queue]
    queue.length = 0
    activeRequest = null
    activeDialog.value = null
    error.value = ''
    for (const request of pending) {
      request.resolve(request.dialog.type === 'prompt' ? null : false)
    }
  }

  return {
    activeDialog: readonly(activeDialog),
    error: readonly(error),
    showConfirm: (message, options) => request('confirm', message, options),
    showPrompt: (message, options) => request('prompt', message, options),
    showAlert: (message, options) => request('alert', message, options),
    submitDialog,
    cancelDialog,
    cancelAll,
  }
}

const appDialog = createAppDialog()
export function useAppDialog() { return appDialog }
