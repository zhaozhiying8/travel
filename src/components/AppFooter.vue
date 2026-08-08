<script setup>
// 底部信息
</script>

<template>
  <footer class="app-footer">
    <div class="footer-inner">
      <span>🧳 悠游 · 让每一次出行都从容有序</span>
      <span class="tip">地图服务由高德地图提供 · 数据仅供参考</span>
    </div>
  </footer>
</template>

<style scoped>
.app-footer {
  background: #2c3e50;
  color: #bdc3c7;
  padding: 18px 20px;
  margin-top: 40px;
}
.footer-inner {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  flex-wrap: wrap;
  gap: 8px;
}
.tip { opacity: 0.7; }
</style>
