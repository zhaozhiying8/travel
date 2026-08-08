<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useTripStore } from '../store/trip'
import { formatDate, getAttractionImage } from '../utils/format'
import { ElMessage, ElMessageBox } from 'element-plus'

const router = useRouter()
const trip = useTripStore()

const showAdd = ref(false)
const addForm = ref({
  title: '',
  type: 'attraction',
  date: trip.startDate || '',
  time: '',
  note: ''
})

// 类型选项
const typeOptions = [
  { value: 'attraction', label: '景点', icon: '🎯' },
  { value: 'hotel', label: '住宿', icon: '🏨' },
  { value: 'food', label: '美食', icon: '🍜' },
  { value: 'transport', label: '交通', icon: '🚗' },
  { value: 'other', label: '其他', icon: '📌' }
]

// 按日期分组行程
const groupedPlans = computed(() => {
  const groups = {}
  trip.plans.forEach(p => {
    const key = p.date || '未安排日期'
    if (!groups[key]) groups[key] = []
    groups[key].push(p)
  })
  // 按日期排序
  return Object.keys(groups).sort().map(key => ({
    date: key,
    items: groups[key].sort((a, b) => (a.time || '').localeCompare(b.time || ''))
  }))
})

// 已安排日期数
const plannedDays = computed(() => groupedPlans.value.filter(g => g.date !== '未安排日期').length)

// 行程概览
const hasTrip = computed(() => trip.destination && trip.startDate)

function typeIcon(type) {
  return typeOptions.find(t => t.value === type)?.icon || '📌'
}

function typeLabel(type) {
  return typeOptions.find(t => t.value === type)?.label || '其他'
}

// 添加自定义行程项
function handleAdd() {
  if (!addForm.value.title) return ElMessage.warning('请填写行程标题')
  trip.addPlan({
    ...addForm.value,
    destination: trip.destination?.city || trip.destination?.name || ''
  })
  ElMessage.success('已添加到行程')
  showAdd.value = false
  addForm.value = { title: '', type: 'attraction', date: trip.startDate || '', time: '', note: '' }
}

// 删除
function removePlan(id, name) {
  ElMessageBox.confirm(`确定删除「${name}」吗?`, '提示', { type: 'warning' })
    .then(() => {
      trip.removePlan(id)
      ElMessage.success('已删除')
    })
    .catch(() => {})
}

// 去导航
function goToNav(plan) {
  if (plan.attraction && plan.attraction.lng) {
    trip.selectAttraction(plan.attraction)
    router.push('/map')
  } else {
    ElMessage.info('该项没有位置信息,无法导航')
  }
}

// 去附近
function goNearby(plan) {
  if (plan.attraction && plan.attraction.lng) {
    trip.selectAttraction(plan.attraction)
    router.push('/nearby')
  } else {
    ElMessage.info('该项没有位置信息')
  }
}

// 清空行程
function clearAll() {
  ElMessageBox.confirm('确定清空所有行程吗?此操作不可恢复', '清空行程', { type: 'warning' })
    .then(() => {
      trip.plans.forEach(p => trip.removePlan(p.id))
      ElMessage.success('已清空')
    })
    .catch(() => {})
}

// 打印行程单
function printItinerary() {
  window.print()
}

// 分享行程
function shareItinerary() {
  if (!trip.planCount) return ElMessage.warning('还没有行程可分享')
  
  // 生成行程文本
  let text = `🧳 我的旅行计划\n`
  text += `━━━━━━━━━━━━\n`
  if (trip.destination) {
    text += `🏷️ 目的地：${trip.destination.city || trip.destination.name}\n`
  }
  if (trip.startDate && trip.endDate) {
    text += `📅 日期：${formatDate(trip.startDate)} ~ ${formatDate(trip.endDate)}（${trip.tripDays}天）\n`
  }
  if (trip.travelers) {
    text += `👥 人数：${trip.travelers}人\n`
  }
  text += `\n📋 行程安排：\n`
  
  groupedPlans.value.forEach(group => {
    text += `\n📅 ${group.date === '未安排日期' ? '未安排日期' : group.date}（${group.items.length}项）\n`
    group.items.forEach((item, idx) => {
      text += `  ${idx + 1}. ${item.time ? '⏰' + item.time + ' ' : ''}${item.title}（${typeLabel(item.type)}）\n`
      if (item.note) text += `     📝 ${item.note}\n`
    })
  })
  
  text += `\n——来自「悠游」旅游规划平台——`
  
  // 尝试使用 Web Share API
  if (navigator.share) {
    navigator.share({
      title: '我的旅行计划',
      text: text
    }).catch(() => {
      // 用户取消或失败，回退到复制
      copyToClipboard(text)
    })
  } else {
    // 回退到复制到剪贴板
    copyToClipboard(text)
  }
}

// 复制到剪贴板
function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      ElMessage.success('行程已复制到剪贴板，可粘贴分享给朋友')
    }).catch(() => {
      fallbackCopy(text)
    })
  } else {
    fallbackCopy(text)
  }
}

// 兼容旧浏览器的复制方式
function fallbackCopy(text) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    document.execCommand('copy')
    ElMessage.success('行程已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败，请手动选择文本复制')
  }
  document.body.removeChild(textarea)
}

// 日期格式化友好
function friendlyDate(date) {
  if (date === '未安排日期') return date
  const d = new Date(date)
  const week = ['日','一','二','三','四','五','六'][d.getDay()]
  return `${formatDate(date)} 周${week}`
}
</script>

<template>
  <div class="page">
    <!-- 行程概览 -->
    <div class="overview card">
      <div class="ov-left">
        <h2 class="ov-title">📋 我的行程</h2>
        <div v-if="hasTrip" class="ov-info">
          <div class="ov-item">
            <span class="ov-label">出发地</span>
            <span class="ov-value">{{ trip.origin?.name || '-' }}</span>
          </div>
          <span class="ov-arrow">→</span>
          <div class="ov-item">
            <span class="ov-label">目的地</span>
            <span class="ov-value">{{ trip.destination?.city || trip.destination?.name }}</span>
          </div>
          <div class="ov-item">
            <span class="ov-label">日期</span>
            <span class="ov-value">{{ formatDate(trip.startDate) }} ~ {{ formatDate(trip.endDate) }}</span>
          </div>
          <div class="ov-item">
            <span class="ov-label">天数</span>
            <span class="ov-value">{{ trip.tripDays }} 天</span>
          </div>
          <div class="ov-item">
            <span class="ov-label">人数</span>
            <span class="ov-value">{{ trip.travelers }} 人</span>
          </div>
        </div>
        <div v-else class="ov-empty">
          还未设置行程,去
          <a @click="$router.push('/')">首页</a>
          开始规划吧
        </div>
      </div>
      <div class="ov-stats">
        <div class="stat">
          <div class="stat-num">{{ trip.planCount }}</div>
          <div class="stat-label">行程项</div>
        </div>
        <div class="stat">
          <div class="stat-num">{{ plannedDays }}</div>
          <div class="stat-label">已安排天</div>
        </div>
        <div class="stat">
          <div class="stat-num">{{ trip.favorites.length }}</div>
          <div class="stat-label">收藏景点</div>
        </div>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="actions">
      <button class="btn-primary" @click="showAdd = true">＋ 添加行程项</button>
      <button class="btn-ghost" @click="$router.push('/destination')">🎯 去选景点</button>
      <button class="btn-ghost" :disabled="!trip.planCount" @click="shareItinerary">📤 分享行程</button>
      <button class="btn-ghost" :disabled="!trip.planCount" @click="printItinerary">🖨️ 打印行程单</button>
      <button class="btn-danger" :disabled="!trip.planCount" @click="clearAll">🗑️ 清空</button>
    </div>

    <!-- 行程列表(按日分组) -->
    <div v-if="trip.planCount" class="plans">
      <div v-for="group in groupedPlans" :key="group.date" class="day-group card">
        <div class="day-head">
          <span class="day-badge">📅</span>
          <span class="day-date">{{ friendlyDate(group.date) }}</span>
          <span class="day-count">{{ group.items.length }} 项安排</span>
        </div>
        <div class="day-items">
          <div v-for="plan in group.items" :key="plan.id" class="plan-item">
            <div v-if="plan.attraction" class="plan-thumb">
              <img :src="getAttractionImage(plan.attraction) || ''" :alt="plan.title" loading="lazy" @error="$event.target.style.display='none'" />
            </div>
            <div class="plan-time">
              <span class="time">{{ plan.time || '--:--' }}</span>
              <span class="type-icon">{{ typeIcon(plan.type) }}</span>
            </div>
            <div class="plan-body">
              <div class="plan-title">{{ plan.title }}</div>
              <div class="plan-meta">
                <span class="meta-type">{{ typeLabel(plan.type) }}</span>
                <span v-if="plan.destination" class="meta-dest">📍 {{ plan.destination }}</span>
              </div>
              <div v-if="plan.note" class="plan-note">{{ plan.note }}</div>
              <div class="plan-ops">
                <button v-if="plan.attraction" class="op-btn" @click="goToNav(plan)">🗺️ 导航</button>
                <button v-if="plan.attraction" class="op-btn" @click="goNearby(plan)">🏨 附近</button>
                <button class="op-btn danger" @click="removePlan(plan.id, plan.title)">🗑️ 删除</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="empty-tip card">
      <div class="icon">📝</div>
      <p>还没有行程安排</p>
      <p class="sub">从「目的地」添加景点,或点击上方「添加行程项」手动创建</p>
      <button class="btn-primary" @click="$router.push('/destination')">去浏览景点</button>
    </div>

    <!-- 收藏的景点 -->
    <div v-if="trip.favorites.length" class="favorites">
      <h2 class="section-title">❤️ 我的收藏</h2>
      <div class="fav-grid">
        <div v-for="(fav, i) in trip.favorites" :key="i" class="fav-card card">
          <img :src="getAttractionImage(fav) || ''" :alt="fav.name" loading="lazy" @error="$event.target.style.display='none'" />
          <div class="fav-body">
            <div class="fav-name">{{ fav.name }}</div>
            <div class="fav-desc">{{ fav.desc }}</div>
            <div class="fav-ops">
              <button class="op-btn" @click="trip.selectAttraction(fav); $router.push('/map')">导航</button>
              <button class="op-btn" @click="trip.selectAttraction(fav); $router.push('/nearby')">附近</button>
              <button class="op-btn" @click="trip.addPlan({ title: fav.name, type: 'attraction', attraction: fav, destination: fav.city || '', date: trip.startDate || '', note: fav.desc }); ElMessage.success('已加入行程')">＋行程</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 添加行程对话框 -->
    <el-dialog v-model="showAdd" title="添加行程项" width="460px">
      <el-form :model="addForm" label-width="80px">
        <el-form-item label="标题">
          <el-input v-model="addForm.title" placeholder="如:游览西湖" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="addForm.type" style="width:100%">
            <el-option v-for="t in typeOptions" :key="t.value" :label="`${t.icon} ${t.label}`" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker v-model="addForm.date" type="date" placeholder="选择日期" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="时间">
          <el-time-picker v-model="addForm.time" format="HH:mm" value-format="HH:mm" placeholder="选择时间" style="width:100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="addForm.note" type="textarea" :rows="2" placeholder="可选备注信息" />
        </el-form-item>
      </el-form>
      <template #footer>
        <button class="btn-ghost" @click="showAdd = false">取消</button>
        <button class="btn-primary" style="margin-left:8px" @click="handleAdd">添加</button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.overview {
  padding: 24px;
  margin-bottom: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}
.ov-title { font-size: 22px; font-weight: 800; margin-bottom: 14px; }
.ov-info { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.ov-item { display: flex; flex-direction: column; }
.ov-label { font-size: 11px; color: var(--text-light); }
.ov-value { font-size: 15px; font-weight: 600; }
.ov-arrow { color: var(--text-light); font-size: 18px; }
.ov-empty { color: var(--text-light); }
.ov-empty a { color: var(--primary); cursor: pointer; }
.ov-stats { display: flex; gap: 20px; }
.stat { text-align: center; }
.stat-num { font-size: 28px; font-weight: 800; color: var(--primary); }
.stat-label { font-size: 12px; color: var(--text-light); }

.actions {
  display: flex;
  gap: 10px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}
.btn-ghost {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 18px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text);
}
.btn-ghost:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
.btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-danger {
  background: #fff;
  border: 1px solid #ffccc7;
  color: #ff4d4f;
  border-radius: 8px;
  padding: 10px 18px;
  cursor: pointer;
  font-size: 14px;
}
.btn-danger:hover:not(:disabled) { background: #fff1f0; }
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }

.plans { display: flex; flex-direction: column; gap: 16px; }
.day-group { overflow: hidden; }
.day-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 20px;
  background: linear-gradient(90deg, #fff3ee, #fff);
  border-bottom: 1px solid var(--border);
}
.day-badge { font-size: 18px; }
.day-date { font-size: 16px; font-weight: 700; }
.day-count { margin-left: auto; font-size: 13px; color: var(--text-light); }

.day-items { padding: 8px 20px; }
.plan-item {
  display: flex;
  gap: 16px;
  padding: 16px 0;
  border-bottom: 1px dashed var(--border);
}
.plan-item:last-child { border-bottom: none; }
.plan-thumb {
  width: 80px;
  height: 80px;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(0,0,0,0.1);
}
.plan-thumb img { width: 100%; height: 100%; object-fit: cover; }
.plan-time {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 60px;
  flex-shrink: 0;
}
.time { font-size: 14px; font-weight: 700; color: var(--primary); }
.type-icon { font-size: 24px; margin-top: 6px; }
.plan-body { flex: 1; min-width: 0; }
.plan-title { font-size: 16px; font-weight: 600; margin-bottom: 6px; }
.plan-meta { display: flex; gap: 12px; font-size: 12px; color: var(--text-light); margin-bottom: 6px; }
.meta-type { background: #f0f2f5; padding: 1px 8px; border-radius: 4px; }
.plan-note { font-size: 13px; color: var(--text-light); margin-bottom: 8px; }
.plan-ops { display: flex; gap: 8px; }
.op-btn {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text);
}
.op-btn:hover { border-color: var(--primary); color: var(--primary); }
.op-btn.danger { border-color: #ffccc7; color: #ff4d4f; }
.op-btn.danger:hover { background: #fff1f0; }

.empty-tip { padding: 60px 20px; }
.empty-tip .icon { font-size: 56px; margin-bottom: 12px; }
.empty-tip .sub { font-size: 13px; color: var(--text-light); margin: 8px 0 16px; }

.favorites { margin-top: 32px; }
.section-title { font-size: 20px; font-weight: 800; margin-bottom: 16px; }
.fav-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}
.fav-card { overflow: hidden; }
.fav-card img { width: 100%; height: 130px; object-fit: cover; }
.fav-body { padding: 12px; }
.fav-name { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
.fav-desc { font-size: 12px; color: var(--text-light); margin-bottom: 8px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.fav-ops { display: flex; gap: 6px; }

@media print {
  .app-header, .app-footer, .actions, .plan-ops, .fav-ops { display: none !important; }
  .overview, .day-group { box-shadow: none !important; border: 1px solid #ddd !important; }
}
@media (max-width: 640px) {
  .overview { flex-direction: column; align-items: flex-start; padding: 16px; gap: 16px; }
  .ov-title { font-size: 18px; margin-bottom: 10px; }
  .ov-info { flex-direction: column; align-items: flex-start; gap: 10px; }
  .ov-arrow { display: none; }
  .ov-stats { width: 100%; justify-content: space-around; }
  .stat-num { font-size: 24px; }
  .actions { gap: 8px; }
  .actions .btn-primary,
  .actions .btn-ghost,
  .actions .btn-danger {
    flex: 1 1 calc(50% - 4px);
    padding: 10px 12px;
    font-size: 13px;
    text-align: center;
    min-height: 44px;
  }
  .day-head { padding: 12px 16px; }
  .day-date { font-size: 14px; }
  .day-items { padding: 8px 16px; }
  .plan-item { flex-wrap: wrap; gap: 10px; padding: 12px 0; }
  .plan-thumb { width: 60px; height: 60px; }
  .plan-time { width: 48px; }
  .time { font-size: 13px; }
  .type-icon { font-size: 20px; margin-top: 4px; }
  .plan-title { font-size: 15px; }
  .plan-meta { font-size: 11px; }
  .plan-ops { flex-wrap: wrap; gap: 6px; }
  .op-btn { padding: 6px 10px; font-size: 13px; min-height: 36px; flex: 1; text-align: center; }
  .fav-grid { grid-template-columns: 1fr; gap: 12px; }
  .fav-card img { height: 110px; }
  .fav-ops { flex-wrap: wrap; }
  .fav-ops .op-btn { flex: 1; text-align: center; min-height: 36px; }
}
@media (max-width: 768px) {
  .actions .btn-primary,
  .actions .btn-ghost,
  .actions .btn-danger {
    padding: 10px 14px;
    font-size: 13px;
  }
  .fav-grid { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
}
</style>
