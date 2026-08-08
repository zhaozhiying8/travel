<script setup>
import { hasAmapKey } from '../config'
</script>

<template>
  <div v-if="!hasAmapKey" class="key-tip">
    <span class="tip-icon">🔑</span>
    <div class="tip-content">
      <p class="tip-title">未检测到高德地图 Key</p>
      <p class="tip-desc">
        地图导航、定位、路线规划、周边搜索等功能需要高德地图服务。
        请前往
        <a href="https://lbs.amap.com/" target="_blank">高德开放平台</a>
        创建「Web端(JS API)」应用,将 Key 与安全密钥填入项目根目录
        <code>.env</code> 文件(参考 <code>.env.example</code>),重启服务即可。
      </p>
    </div>
  </div>
</template>

<style scoped>
.key-tip {
  background: #fff7e6;
  border: 1px solid #ffd591;
  border-radius: 10px;
  padding: 14px 18px;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 16px;
}
.tip-icon { font-size: 24px; }
.tip-title { font-weight: 700; color: #d46b08; margin-bottom: 4px; }
.tip-desc { font-size: 13px; color: #874d00; line-height: 1.6; }
.tip-desc code {
  background: #fff;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 12px;
}
.tip-desc a { color: #d46b08; }
</style>
