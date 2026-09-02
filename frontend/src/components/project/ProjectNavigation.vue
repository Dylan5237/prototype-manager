<template>
  <nav class="portal-menu" aria-label="项目菜单">
    <div v-for="group in menuConfig?.items" :key="group.key" class="menu-group">
      <div class="group-label">{{ group.label }}</div>
      <div
        v-for="item in group.children"
        :key="item.key"
        :class="['menu-item', { active: isActive(group, item) }]"
        role="button"
        tabindex="0"
        :aria-current="isActive(group, item) ? 'page' : undefined"
        @click="$emit('select', group, item)"
        @keydown.enter="$emit('select', group, item)"
        @keydown.space.prevent="$emit('select', group, item)"
      >
        <span class="item-label"><i class="menu-dot"></i>{{ item.label }}</span>
        <span
          v-if="getMenuState(group, item)"
          class="menu-state"
          :class="getMenuState(group, item).tone"
        >{{ getMenuState(group, item).text }}</span>
      </div>
    </div>
    <el-empty v-if="!hasMenu" description="暂无菜单配置" />
    <div v-else class="nav-footnote">
      <strong>项目结构提示</strong>
      左侧只放稳定的业务入口；任务、成员和快照在右侧上下文区展开。
    </div>
  </nav>
</template>

<script setup>
const props = defineProps({
  menuConfig: { type: Object, default: () => ({ items: [] }) },
  hasMenu: { type: Boolean, default: false },
  activeGroup: { type: Object, default: null },
  activeItem: { type: Object, default: null },
  getCheckoutStatus: { type: Function, required: true },
  getMenuState: { type: Function, default: () => null }
})

defineEmits(['select'])

function isActive(group, item) {
  return props.activeGroup?.key === group.key && props.activeItem?.key === item.key
}
</script>

<style scoped>
.portal-menu { width: 228px; min-height: 0; overflow: auto; padding: 20px 14px; border-right: 1px solid #e7ebf2; background: #fff; }
.menu-group {
  margin: 12px 0 18px;
}
.group-label {
  padding: 0 8px 6px;
  color: #9ba7bb;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-radius: 8px;
  padding: 9px;
  color: #5e6c85;
  cursor: pointer;
  font-size: 12px;
  transition: .18s ease;
}
.menu-item:hover,
.menu-item:focus-visible {
  color: #2958d5;
  background: #f4f7ff;
  outline: none;
}
.menu-item.active {
  color: #2958d5;
  background: #edf2ff;
  font-weight: 700;
}
.item-label { display: flex; align-items: center; gap: 8px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.menu-dot { width: 7px; height: 7px; flex: 0 0 auto; border: 1.5px solid #89a1d6; border-radius: 3px; background: #fff; }
.menu-item.active .menu-dot { border-color: #3c6ff2; background: #3c6ff2; }
.menu-state { border-radius: 99px; padding: 2px 5px; color: #11966c; background: #eaf8f2; font-size: 9px; white-space: nowrap; }
.menu-state.warn { color: #c47a16; background: #fff6e5; }
.menu-state.empty { color: #9ba7bb; background: #f1f3f6; }
.nav-footnote { margin: 22px 5px 0; border: 1px solid #e0e7f6; border-radius: 9px; padding: 10px; color: #72809a; background: #f6f8ff; font-size: 11px; line-height: 1.55; }
.nav-footnote strong { display: block; margin-bottom: 3px; color: #2958d5; }

@media (max-width: 600px) { .portal-menu { display: none; } }
</style>
