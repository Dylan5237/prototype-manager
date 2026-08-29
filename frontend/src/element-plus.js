import { ElAlert } from 'element-plus/es/components/alert/index.mjs'
import { ElBadge } from 'element-plus/es/components/badge/index.mjs'
import { ElButton } from 'element-plus/es/components/button/index.mjs'
import { ElCard } from 'element-plus/es/components/card/index.mjs'
import { ElContainer, ElHeader, ElMain } from 'element-plus/es/components/container/index.mjs'
import { ElDialog } from 'element-plus/es/components/dialog/index.mjs'
import { ElDrawer } from 'element-plus/es/components/drawer/index.mjs'
import { ElDropdown, ElDropdownItem, ElDropdownMenu } from 'element-plus/es/components/dropdown/index.mjs'
import { ElEmpty } from 'element-plus/es/components/empty/index.mjs'
import { ElForm, ElFormItem } from 'element-plus/es/components/form/index.mjs'
import { ElIcon } from 'element-plus/es/components/icon/index.mjs'
import { ElImage } from 'element-plus/es/components/image/index.mjs'
import { ElInput } from 'element-plus/es/components/input/index.mjs'
import { ElLoading } from 'element-plus/es/components/loading/index.mjs'
import { ElMenu, ElMenuItem } from 'element-plus/es/components/menu/index.mjs'
import { ElPagination } from 'element-plus/es/components/pagination/index.mjs'
import { ElPopover } from 'element-plus/es/components/popover/index.mjs'
import { ElRadio, ElRadioButton, ElRadioGroup } from 'element-plus/es/components/radio/index.mjs'
import { ElOption, ElSelect } from 'element-plus/es/components/select/index.mjs'
import { ElTable, ElTableColumn } from 'element-plus/es/components/table/index.mjs'
import { ElTabPane, ElTabs } from 'element-plus/es/components/tabs/index.mjs'
import { ElTag } from 'element-plus/es/components/tag/index.mjs'
import { ElTooltip } from 'element-plus/es/components/tooltip/index.mjs'
import { ElTransfer } from 'element-plus/es/components/transfer/index.mjs'

const components = [
  ElAlert,
  ElBadge,
  ElButton,
  ElCard,
  ElContainer,
  ElDialog,
  ElDrawer,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElHeader,
  ElIcon,
  ElImage,
  ElInput,
  ElMain,
  ElMenu,
  ElMenuItem,
  ElOption,
  ElPagination,
  ElPopover,
  ElRadio,
  ElRadioButton,
  ElRadioGroup,
  ElSelect,
  ElTabPane,
  ElTable,
  ElTableColumn,
  ElTabs,
  ElTag,
  ElTooltip,
  ElTransfer
]

export function installElementPlus(app) {
  components.forEach(component => app.use(component))
  app.use(ElLoading)
}
