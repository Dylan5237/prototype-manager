<template>
  <div class="login-page">
    <el-card class="login-card" shadow="hover">
      <div class="login-header">
        <img src="/favicon.svg" class="login-logo" alt="logo" />
        <h2>伏羲元构</h2>
        <p>AI产出原型管理平台</p>
      </div>
      <el-form :model="form" :rules="rules" ref="formRef" @keyup.enter="handleLogin">
        <el-form-item prop="username">
          <el-input
            v-model="form.username"
            placeholder="账号"
            :prefix-icon="User"
            size="large"
          />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            :prefix-icon="Lock"
            size="large"
            show-password
          />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            size="large"
            class="login-btn"
            @click="handleLogin"
            :loading="loading"
          >
            登录
          </el-button>
        </el-form-item>
      </el-form>
      <div class="login-tip">
        <el-text type="info" size="small">默认账号：admin / admin123</el-text>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const formRef = ref(null)
const loading = ref(false)
const form = ref({ username: '', password: '' })

const rules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

async function handleLogin() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  
  loading.value = true
  try {
    const success = await authStore.login(form.value.username, form.value.password)
    if (success) {
      ElMessage.success('登录成功')
      router.push('/')
    } else {
      ElMessage.error('登录失败')
    }
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '登录失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f5f7fa 0%, #c6e2ff 100%);
}

.login-card {
  width: 400px;
  padding: 20px;
}

.login-header {
  text-align: center;
  margin-bottom: 30px;
}

.login-logo {
  width: 56px;
  height: 56px;
  margin-bottom: 8px;
}

.login-header h2 {
  margin: 8px 0 4px;
  font-size: 24px;
  font-weight: 700;
  color: #303133;
  letter-spacing: 2px;
}

.login-header p {
  margin: 0;
  font-size: 13px;
  color: #909399;
}

.login-btn {
  width: 100%;
}

.login-tip {
  text-align: center;
  margin-top: 12px;
}
</style>
