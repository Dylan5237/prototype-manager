<template>
  <div class="login-page">
    <!-- 动态背景 -->
    <div class="bg-layer">
      <div class="bg-orb orb-1"></div>
      <div class="bg-orb orb-2"></div>
      <div class="bg-orb orb-3"></div>
      <div class="bg-grid"></div>
    </div>

    <!-- 登录卡片 -->
    <div class="login-container">
      <div class="login-card">
        <div class="card-glow"></div>

        <div class="login-header">
          <div class="logo-ring">
            <svg class="login-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2"/>
              <polyline points="2 17 12 22 22 17"/>
              <polyline points="2 12 12 17 22 12"/>
            </svg>
          </div>
          <h1>伏羲平台</h1>
          <p class="subtitle">AI 原型管理平台</p>
        </div>

        <el-form
          v-if="!registerMode"
          :model="form"
          :rules="rules"
          ref="formRef"
          @keyup.enter="handleLogin"
          class="login-form"
        >
          <el-form-item prop="username">
            <el-input
              v-model="form.username"
              placeholder="请输入账号"
              :prefix-icon="User"
              size="large"
              class="dark-input"
            />
          </el-form-item>

          <el-form-item prop="password">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="请输入密码"
              :prefix-icon="Lock"
              size="large"
              show-password
              class="dark-input"
            />
          </el-form-item>

          <el-form-item>
            <button
              type="button"
              class="login-btn"
              @click="handleLogin"
              :disabled="loading"
            >
              <span class="btn-text">{{ loading ? '登录中...' : '登 录' }}</span>
              <span class="btn-shine"></span>
            </button>
          </el-form-item>
        </el-form>
        <el-form
          v-else
          :model="registerForm"
          :rules="registerRules"
          ref="registerFormRef"
          @keyup.enter="handleRegister"
          class="login-form"
        >
          <el-form-item prop="username">
            <el-input v-model="registerForm.username" placeholder="例如：zhangsan1" :prefix-icon="User" size="large" class="dark-input" />
            <span class="form-help">账号填写姓名全拼英文小写；重名可加数字后缀。</span>
          </el-form-item>
          <el-form-item prop="password">
            <el-input v-model="registerForm.password" type="password" placeholder="请输入密码" :prefix-icon="Lock" size="large" show-password class="dark-input" />
          </el-form-item>
          <el-form-item prop="passwordConfirmation">
            <el-input v-model="registerForm.passwordConfirmation" type="password" placeholder="请再次输入密码" :prefix-icon="Lock" size="large" show-password class="dark-input" />
          </el-form-item>
          <el-form-item prop="nickname">
            <el-input v-model="registerForm.nickname" placeholder="请输入昵称" :prefix-icon="User" size="large" class="dark-input" />
          </el-form-item>
          <el-form-item>
            <button type="button" class="login-btn" @click="handleRegister" :disabled="loading">
              <span class="btn-text">{{ loading ? '注册中...' : '注册并登录' }}</span>
              <span class="btn-shine"></span>
            </button>
          </el-form-item>
        </el-form>
        <button type="button" class="mode-switch" @click="toggleMode">
          {{ registerMode ? '已有账号？返回登录' : '还没有账号？注册账号' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import { User, Lock } from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const formRef = ref(null)
const registerFormRef = ref(null)
const loading = ref(false)
const registerMode = ref(false)
const form = ref({ username: '', password: '' })
const registerForm = ref({ username: '', password: '', passwordConfirmation: '', nickname: '' })

const rules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

const registerRules = {
  username: [
    { required: true, message: '请输入账号', trigger: 'blur' },
    { pattern: /^[a-zA-Z][a-zA-Z0-9]*$/, message: '账号必须以字母开头，只含英文字母和数字', trigger: 'blur' }
  ],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
  passwordConfirmation: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    { validator: (_rule, value, callback) => value === registerForm.value.password ? callback() : callback(new Error('两次输入的密码不一致')), trigger: 'blur' }
  ],
  nickname: [{ required: true, message: '请输入昵称', trigger: 'blur' }]
}

function toggleMode() {
  registerMode.value = !registerMode.value
  formRef.value?.clearValidate()
  registerFormRef.value?.clearValidate()
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

async function handleRegister() {
  registerForm.value.username = registerForm.value.username.trim().toLowerCase()
  const valid = await registerFormRef.value.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  try {
    const success = await authStore.register(registerForm.value)
    if (success) {
      ElMessage.success('注册成功，已登录')
      router.push('/')
    } else {
      ElMessage.error('注册失败')
    }
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '注册失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #0b1120;
}

/* 背景层 */
.bg-layer {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.bg-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  opacity: 0.3;
  animation: orb-float 20s ease-in-out infinite;
}

.orb-1 {
  width: 500px;
  height: 500px;
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  top: -150px;
  left: -150px;
  animation-delay: 0s;
}

.orb-2 {
  width: 400px;
  height: 400px;
  background: linear-gradient(135deg, #a8edea 0%, #c4f0f2 100%);
  bottom: -100px;
  right: -100px;
  animation-delay: -7s;
}

.orb-3 {
  width: 350px;
  height: 350px;
  background: linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%);
  top: 40%;
  left: 55%;
  animation-delay: -14s;
}

@keyframes orb-float {
  0%, 100% { transform: translate(0, 0) scale(1); }
  25% { transform: translate(40px, -30px) scale(1.08); }
  50% { transform: translate(-20px, 20px) scale(0.95); }
  75% { transform: translate(30px, 40px) scale(1.03); }
}

.bg-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
  background-size: 60px 60px;
  mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
  -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
}

/* 登录容器 */
.login-container {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 440px;
  padding: 20px;
}

/* 登录卡片 */
.login-card {
  position: relative;
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  padding: 48px 40px 40px;
  box-shadow:
    0 25px 50px -12px rgba(0, 0, 0, 0.5),
    inset 0 1px 1px rgba(255, 255, 255, 0.05);
  overflow: hidden;
}

.card-glow {
  position: absolute;
  top: -60%;
  left: -60%;
  width: 220%;
  height: 220%;
  background: radial-gradient(circle at 50% 50%, rgba(79, 172, 254, 0.06) 0%, transparent 60%);
  pointer-events: none;
  animation: glow-rotate 30s linear infinite;
}

@keyframes glow-rotate {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 头部 */
.login-header {
  text-align: center;
  margin-bottom: 40px;
  position: relative;
}

.logo-ring {
  width: 68px;
  height: 68px;
  margin: 0 auto 20px;
  border-radius: 18px;
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 32px rgba(79, 172, 254, 0.35);
  position: relative;
}

.logo-ring::before {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 20px;
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  filter: blur(12px);
  opacity: 0.4;
  z-index: -1;
}

.login-logo {
  width: 32px;
  height: 32px;
  color: #fff;
}

.login-header h1 {
  margin: 0 0 8px;
  font-size: 28px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 6px;
}

.subtitle {
  margin: 0;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.45);
  letter-spacing: 2px;
}

/* 表单 */
.login-form :deep(.el-form-item) {
  margin-bottom: 20px;
}

.login-form :deep(.el-form-item:last-child) {
  margin-bottom: 0;
  margin-top: 8px;
}

.mode-switch {
  display: block;
  margin: 4px auto 0;
  padding: 5px 8px;
  color: #67d8ff;
  border: 0;
  background: transparent;
}

.mode-switch:hover { text-decoration: underline; }
.form-help { display: block; margin-top: 5px; color: rgba(255,255,255,.4); font-size: 12px; }

/* 深色输入框 */
.dark-input :deep(.el-input__wrapper) {
  background: rgba(255, 255, 255, 0.04) !important;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.1) inset !important;
  border-radius: 12px !important;
  padding: 4px 16px !important;
  transition: all 0.3s ease !important;
}

.dark-input :deep(.el-input__inner) {
  color: #fff !important;
  font-size: 15px !important;
  height: 44px !important;
}

.dark-input :deep(.el-input__inner::placeholder) {
  color: rgba(255, 255, 255, 0.3) !important;
}

.dark-input :deep(.el-input__icon) {
  color: rgba(255, 255, 255, 0.4) !important;
  font-size: 18px !important;
}

.dark-input :deep(.el-input__suffix-inner) {
  color: rgba(255, 255, 255, 0.4) !important;
}

.dark-input.is-focus :deep(.el-input__wrapper) {
  box-shadow:
    0 0 0 1px rgba(79, 172, 254, 0.6) inset,
    0 0 20px rgba(79, 172, 254, 0.15) !important;
  background: rgba(255, 255, 255, 0.06) !important;
}

/* 覆盖浏览器自动填充样式 */
.dark-input :deep(.el-input__inner:-webkit-autofill),
.dark-input :deep(.el-input__inner:-webkit-autofill:hover),
.dark-input :deep(.el-input__inner:-webkit-autofill:focus),
.dark-input :deep(.el-input__inner:-webkit-autofill:active) {
  -webkit-box-shadow: 0 0 0 1000px rgba(255, 255, 255, 0.04) inset !important;
  -webkit-text-fill-color: #fff !important;
  caret-color: #fff !important;
  transition: background-color 5000s ease-in-out 0s;
}

/* 登录按钮 */
.login-btn {
  width: 100%;
  height: 50px;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 6px;
  color: #fff;
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  border: none;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.login-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 12px 36px rgba(79, 172, 254, 0.45);
}

.login-btn:active:not(:disabled) {
  transform: translateY(0);
}

.login-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.btn-shine {
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent);
  transition: left 0.6s ease;
}

.login-btn:hover:not(:disabled) .btn-shine {
  left: 100%;
}

.btn-text {
  position: relative;
  z-index: 1;
}

/* 响应式 */
@media (max-width: 480px) {
  .login-card {
    padding: 36px 24px 32px;
  }

  .login-header h1 {
    font-size: 24px;
    letter-spacing: 4px;
  }
}
</style>
