<template>
  <header class="management-page-head">
    <div class="management-page-title">
      <div class="management-title-line">
        <h1>{{ title }}</h1>
        <span class="management-count">{{ count }}</span>
      </div>
      <p class="management-description">{{ description }}</p>
    </div>
    <div class="management-toolbar">
      <slot />
    </div>
  </header>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  count: { type: [Number, String], default: 0 },
  description: { type: String, default: '' }
})
</script>
