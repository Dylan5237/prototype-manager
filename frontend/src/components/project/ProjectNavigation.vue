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
        <span class="item-label">{{ item.label }}</span>
        <el-tag v-if="getCheckoutStatus(group, item)" :type="getCheckoutStatus(group, item).type" size="small" effect="dark">
          {{ getCheckoutStatus(group, item).text }}
        </el-tag>
      </div>
    </div>
    <el-empty v-if="!hasMenu" description="暂无菜单配置" />
  </nav>
</template>

<script setup>
const props = defineProps({
  menuConfig: { type: Object, default: () => ({ items: [] }) },
  hasMenu: { type: Boolean, default: false },
  activeGroup: { type: Object, default: null },
  activeItem: { type: Object, default: null },
  getCheckoutStatus: { type: Function, required: true }
})

defineEmits(['select'])

function isActive(group, item) {
  return props.activeGroup?.key === group.key && props.activeItem?.key === item.key
}
</script>

<style scoped>
.portal-menu {
  width: 240px;
  background: #fff;
  border-right: 1px solid #e4e7ed;
  overflow-y: auto;
  padding: 12px 0;
}
.menu-group {
  margin-bottom: 8px;
}
.group-label {
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 600;
  color: #909399;
  text-transform: uppercase;
}
.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px 10px 28px;
  font-size: 14px;
  color: #303133;
  cursor: pointer;
  transition: background 0.2s;
}
.menu-item:hover,
.menu-item:focus-visible {
  background: #f5f7fa;
  outline: none;
}
.menu-item.active {
  background: #ecf5ff;
  color: #409eff;
  font-weight: 600;
}
.item-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
