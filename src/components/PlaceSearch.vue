<script setup>
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { getInputTips } from '../utils/amap'
import { hasAmapKey } from '../config'
import { popularCities } from '../utils/cities'
import { ElMessage } from 'element-plus'

const props = defineProps({
  modelValue: { type: Object, default: null },
  placeholder: { type: String, default: '请输入城市或地点' },
  label: { type: String, default: '' },
  showSearchBtn: { type: Boolean, default: true }
})
const emit = defineEmits(['update:modelValue', 'searchAttraction'])

const keyword = ref(props.modelValue?.name || '')
const tips = ref([])
const showDropdown = ref(false)
const loading = ref(false)

const inputBoxRef = ref(null)
const dropdownStyle = ref({})

watch(() => props.modelValue, (v) => {
  keyword.value = v?.name || ''
})

function updateDropdownPos() {
  if (!inputBoxRef.value || !showDropdown.value) return
  const rect = inputBoxRef.value.getBoundingClientRect()
  dropdownStyle.value = {
    position: 'fixed',
    top: `${rect.bottom + 4}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    zIndex: 9999
  }
}

let timer = null
function onInput(val) {
  keyword.value = val
  emit('update:modelValue', null)
  if (timer) clearTimeout(timer)
  if (!val) { tips.value = []; showDropdown.value = false; return }
  timer = setTimeout(async () => {
    if (hasAmapKey) {
      loading.value = true
      try {
        const result = await getInputTips(val)
        // 过滤：排除非景点类型（地铁、公交、酒店、停车场等）
        const excludeKeywords = ['地铁', '公交站', '汽车站', '火车站', '机场', '航站楼', '停车场', '停车', '酒店', '宾馆', '旅馆', '客栈', '民宿', '加油站', '充电站', '充电', '服务区', '收费站', '医院', '诊所', '药店', '药房', '医疗', '保健', '护理', '体检', '学校', '大学', '幼儿园', '银行', 'ATM', '超市', '商场', '市场', '购物中心', '写字楼', '办公楼', '小区', '公寓', '别墅区', '政府机关', '街道办事处', '派出所', '公安局', '餐厅', '饭店', '餐馆', '小吃', '火锅', '烧烤', '咖啡', '茶馆', '奶茶', '美食', '购物', '影城', '电影院', 'KTV', '酒吧', '健身房', '健身', '美容', '美发', '理发', '4S店', '汽车维修', '洗车', '汽车', '物流', '快递', '邮局', '营业厅', '保险', '证券', '售楼处', '房产中介', '房产', '家政', '婚庆', '婚纱', '摄影', '写真', '影楼', '儿童摄影', '写真馆', '宠物医院', '洗浴', '汗蒸', 'SPA', '按摩', '足疗', '会所', '协会', '托儿所', '培训', '驾校', '维修', '厂房', '仓库', '基地', '开发区', '高新区', '产业园', '科技园', '大学城', '公司', '企业', '事务所', '工作室', '门市部', '经销部', '办事处']
        const filtered = result.filter(t => {
          const name = t.name || ''
          // 排除名称中包含排除关键词的
          return !excludeKeywords.some(k => name.includes(k))
        })
        tips.value = filtered.map(t => ({
          name: t.name,
          lng: t.location.lng,
          lat: t.location.lat,
          city: (t.district || '').replace(/省|市|自治区|特别行政区/g, ''),
          address: t.district + t.name
        }))
        showDropdown.value = tips.value.length > 0
        await nextTick()
        updateDropdownPos()
      } catch {
        tips.value = matchLocal(val)
        showDropdown.value = true
        await nextTick()
        updateDropdownPos()
      } finally {
        loading.value = false
      }
    } else {
      tips.value = matchLocal(val)
      showDropdown.value = true
      await nextTick()
      updateDropdownPos()
    }
  }, 300)
}

function matchLocal(val) {
  return popularCities
    .filter(c => c.name.includes(val) || (val.includes(c.name)))
    .map(c => ({ name: c.name, lng: c.lng, lat: c.lat, city: c.name, address: c.desc }))
}

function selectTip(tip) {
  emit('update:modelValue', tip)
  keyword.value = tip.name
  showDropdown.value = false
}

function useKeyword() {
  if (!keyword.value || !keyword.value.trim()) {
    ElMessage.warning('请输入城市或景点名')
    return
  }
  const name = keyword.value.trim()
  const found = popularCities.find(c => c.name === name)
  if (found) {
    emit('update:modelValue', {
      name: found.name,
      lng: found.lng,
      lat: found.lat,
      city: found.name,
      address: found.desc
    })
    tips.value = []
    ElMessage.success(`已选择城市「${name}」`)
  } else {
    emit('searchAttraction', { keyword: name, mode: 'confirm' })
    tips.value = []
  }
  showDropdown.value = false
}

function onKeyup(e) {
  if (e.key === 'Enter') {
    useKeyword()
  }
}

function blur() {
  setTimeout(() => {
    showDropdown.value = false
  }, 200)
}

function focus() {
  if (tips.value.length) {
    showDropdown.value = true
    nextTick(() => updateDropdownPos())
  }
}

function quickPick(city) {
  const item = popularCities.find(c => c.name === city)
  if (item) {
    selectTip({ name: item.name, lng: item.lng, lat: item.lat, city: item.name, address: item.desc })
  }
}

function clearInput() {
  keyword.value = ''
  tips.value = []
  showDropdown.value = false
  emit('update:modelValue', null)
}

function onWindowResize() { updateDropdownPos() }
function onScroll() { if (showDropdown.value) updateDropdownPos() }

onMounted(() => {
  window.addEventListener('resize', onWindowResize)
  window.addEventListener('scroll', onScroll, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowResize)
  window.removeEventListener('scroll', onScroll, true)
})

defineExpose({ quickPick })
</script>

<template>
  <div class="place-search">
    <label v-if="label" class="ps-label">{{ label }}</label>
    <div class="ps-input-wrap">
      <div ref="inputBoxRef" class="ps-input-box">
        <span class="ps-icon">{{ label.includes('出发') ? '🛫' : '🎯' }}</span>
        <input
          class="ps-input"
          type="text"
          :placeholder="placeholder"
          :value="keyword"
          @input="onInput($event.target.value)"
          @focus="focus"
          @blur="blur"
          @keyup.enter="onKeyup"
        />
        <button
          v-if="keyword"
          class="ps-clear"
          type="button"
          @click="clearInput"
        >✕</button>
        <button
          v-if="showSearchBtn"
          class="ps-search-btn"
          type="button"
          @click="useKeyword"
        >
          <span v-if="loading" class="ps-loading"></span>
          <span v-else class="ps-search-icon">🔍</span>
        </button>
      </div>
    </div>
    <Teleport to="body">
      <div
        v-if="showDropdown && tips.length"
        class="ps-dropdown"
        :style="dropdownStyle"
      >
        <div
          v-for="(tip, i) in tips"
          :key="i"
          class="ps-tip"
          @mousedown.prevent="selectTip(tip)"
        >
          <div class="ps-tip-name">{{ tip.name }}</div>
          <div class="ps-tip-addr">{{ tip.address }}</div>
        </div>
      </div>
    </Teleport>
    <div v-if="!hasAmapKey" class="ps-quick">
      <span class="quick-label">热门:</span>
      <a
        v-for="c in ['北京','上海','杭州','成都','三亚','丽江'].slice(0,6)"
        :key="c"
        class="quick-city"
        @click="quickPick(c)"
      >{{ c }}</a>
    </div>
  </div>
</template>

<style scoped>
.place-search { position: relative; }
.ps-label {
  display: block;
  font-size: 13px;
  color: var(--text-light);
  margin-bottom: 6px;
  font-weight: 600;
}
.ps-input-wrap { position: relative; }
.ps-input-box {
  display: flex;
  align-items: center;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  transition: border-color 0.2s, box-shadow 0.2s;
  position: relative;
}
.ps-input-box:focus-within {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(255, 107, 53, 0.1);
}
.ps-icon {
  padding: 0 10px 0 14px;
  font-size: 16px;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.ps-input {
  flex: 1;
  border: none;
  outline: none;
  padding: 10px 8px;
  font-size: 14px;
  font-family: inherit;
  background: transparent;
  min-width: 0;
}
.ps-input::placeholder {
  color: #c0c4cc;
}
.ps-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  min-width: 22px;
  height: 22px;
  min-height: 22px;
  aspect-ratio: 1 / 1;
  border: none;
  background: #c0c4cc;
  border-radius: 50%;
  color: #fff;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  margin-right: 4px;
  flex-shrink: 0;
}
.ps-clear:hover { background: #909399; }
.ps-search-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  min-width: 44px;
  height: 40px;
  min-height: 40px;
  aspect-ratio: auto;
  border: none;
  background: var(--primary);
  border-radius: 0 7px 7px 0;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s;
}
.ps-search-btn:hover { background: var(--primary-dark); }
.ps-search-icon {
  font-size: 16px;
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ps-loading {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.ps-dropdown {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
  max-height: 300px;
  overflow-y: auto;
}
.ps-tip {
  padding: 10px 14px;
  cursor: pointer;
  border-bottom: 1px solid #f5f5f5;
  transition: background 0.1s;
}
.ps-tip:last-child { border-bottom: none; }
.ps-tip:hover { background: #fff7f3; }
.ps-tip-name { font-size: 14px; font-weight: 600; color: var(--text); }
.ps-tip-addr { font-size: 12px; color: var(--text-light); margin-top: 2px; }

.ps-quick {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.quick-label { font-size: 12px; color: var(--text-light); }
.quick-city {
  font-size: 12px;
  color: var(--primary);
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 4px;
  background: #fff3ee;
  transition: all 0.15s;
}
.quick-city:hover { background: var(--primary); color: #fff; }

@media (max-width: 640px) {
  .ps-search-btn { width: 44px; }
  .ps-input { font-size: 15px; }
}
</style>
