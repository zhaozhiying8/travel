// 全局配置
// 高德地图 key 与安全密钥,从 .env 读取;未配置时地图相关功能会提示去配置
export const AMAP_KEY = import.meta.env.VITE_AMAP_KEY || ''
export const AMAP_SECURITY_CODE = import.meta.env.VITE_AMAP_SECURITY_CODE || ''
// Web服务Key(用于REST API景点搜索,需要在控制台创建Web服务类型Key)
export const AMAP_REST_KEY = import.meta.env.VITE_AMAP_REST_KEY || ''

// 是否已配置高德 key
export const hasAmapKey = !!AMAP_KEY

// 景点数据缓存key
export const ATTRACTION_CACHE_KEY = 'travel_attractions_cache'
export const ATTRACTION_CACHE_DURATION = 24 * 60 * 60 * 1000 // 24小时缓存
