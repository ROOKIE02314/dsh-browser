/** Browser details-tab namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'browser'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'tab.browser': '浏览器',
  'dashboard.title': 'Playwright 实时浏览器',
  'dashboard.unavailable': '浏览器实时面板不可用',
  'dashboard.replay': '实时视图不可回放',
  'feed.title': '动作流',
  'feed.empty': '尚未发生浏览器动作',
  'feed.truncated': '较早动作已省略',
  'feed.running': '运行中',
  'feed.ok': '完成',
  'feed.error': '失败',
  'feed.args': '参数',
  'feed.result': '结果',
} satisfies Record<string, string>

/** English dictionary with the same keys. */
export const en = {
  'tab.browser': 'Browser',
  'dashboard.title': 'Playwright live browser',
  'dashboard.unavailable': 'Live browser panel unavailable',
  'dashboard.replay': 'Live view is not replayable',
  'feed.title': 'Action feed',
  'feed.empty': 'No browser actions yet',
  'feed.truncated': 'Older actions were omitted',
  'feed.running': 'Running',
  'feed.ok': 'Done',
  'feed.error': 'Failed',
  'feed.args': 'Args',
  'feed.result': 'Result',
} satisfies Record<BrowserKey, string>

/** Browser namespace key union. */
export type BrowserKey = keyof typeof zh
