/*
 * 用户名规则（前端表单、注册接口与登录接口共用同一份）。
 *
 * 2026-10 放宽：此前只收 ASCII 字母、数字、下划线、连字符，中文和 . @ 一律被拒；
 * 更糟的是注册接口在校验失败时不分字段，回的都是"密码至少 8 位"，用户按提示改密码
 * 也过不去，根本看不出是用户名的锅。现在规则和提示文案都收在这个文件里：前端表单
 * 与服务端 zod 校验读的是同一份，两边不会再有各写一套的漂移。
 */

// 注册的长度上限。数据库列是 varchar(32)，这里收窄到 20 位：给后台删除账号时生成的
// deleted_<id>_<随机串> 释放名留出余量，也避免用户名长到把界面撑破。
export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 20

// 登录只沿用字符集，长度上限放到数据库列宽：万一有历史账号超出当前的注册上限，
// 也要能登进来（登录接口不跟着收窄长度，免得把已有账号挡在门外）。
export const USERNAME_LOGIN_MAX_LENGTH = 32

// 汉字（含扩展区与兼容区，生僻姓氏也能用）、ASCII 字母数字、下划线、点、@、连字符
// （连字符放在字符类末尾，按字面量处理）。不放行空格与全角标点：它们在房间列表、聊天里
// 容易和分隔符混淆，也容易被连带复制进前后空白。Unicode 属性转义需要 u 标志，
// 浏览器与 Node 都原生支持。
export const USERNAME_PATTERN = /^[\p{Script=Han}A-Za-z0-9_@.-]+$/u

// 输入框占位符文案，与上面的规则保持一致。
export const USERNAME_RULE_HINT = '3-20 位，可用中文、字母、数字和 . @ _ -'

/**
 * 校验用户名，合规返回 null，否则返回一句给用户看的中文说明。
 * max 默认是注册上限；登录接口传 USERNAME_LOGIN_MAX_LENGTH。
 */
export function usernameProblem(value, { max = USERNAME_MAX_LENGTH } = {}) {
  const name = typeof value === 'string' ? value : ''
  if (name.length < USERNAME_MIN_LENGTH) return `用户名至少 ${USERNAME_MIN_LENGTH} 位`
  if (name.length > max) return `用户名最多 ${max} 位`
  if (!USERNAME_PATTERN.test(name)) return '用户名只能用中文、字母、数字和 . @ _ -，不能有空格或其它符号'
  return null
}
