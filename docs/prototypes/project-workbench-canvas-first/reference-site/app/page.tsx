"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Bell,
  Boxes,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  FileBox,
  FolderTree,
  GitBranch,
  ListTodo,
  Maximize2,
  Menu,
  MessageSquare,
  Monitor,
  MoreHorizontal,
  PanelLeftOpen,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tablet,
  UserRound,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type NodeId = "entity" | "method" | "interface" | "permission";
type Mode = "project" | "workspace";
type CandidateState = "pending" | "returned" | "adopted";

type ModuleInfo = {
  id: NodeId;
  name: string;
  group: string;
  owner: string;
  avatar: string;
  avatarTone: string;
  prototype: string;
  version: string;
  pending: number;
  description: string;
};

const moduleMap: Record<NodeId, ModuleInfo> = {
  entity: {
    id: "entity",
    name: "实体建模",
    group: "业务域建模",
    owner: "陈琳",
    avatar: "陈",
    avatarTone: "bg-violet-100 text-violet-700",
    prototype: "实体建模工作台",
    version: "v2.4.0",
    pending: 0,
    description: "维护业务实体、属性与实体间关系。",
  },
  method: {
    id: "method",
    name: "方法建模",
    group: "业务域建模",
    owner: "林川",
    avatar: "林",
    avatarTone: "bg-cyan-100 text-cyan-700",
    prototype: "方法建模工作台",
    version: "v1.8.2",
    pending: 0,
    description: "设计领域方法、输入输出与业务约束。",
  },
  interface: {
    id: "interface",
    name: "接口建模",
    group: "业务域建模",
    owner: "赵明",
    avatar: "赵",
    avatarTone: "bg-amber-100 text-amber-700",
    prototype: "接口建模工作台",
    version: "v1.6.0",
    pending: 0,
    description: "定义接口契约、参数结构与调用关系。",
  },
  permission: {
    id: "permission",
    name: "权限管理中心",
    group: "建模开发平台",
    owner: "wushengzhi",
    avatar: "W",
    avatarTone: "bg-blue-100 text-blue-700",
    prototype: "权限管理中心 MVP",
    version: "v1.0.2",
    pending: 1,
    description: "统一身份、角色、用户组与系统菜单管理。",
  },
};

const tableRows: Record<NodeId, Array<string[]>> = {
  permission: [
    ["zhangsan", "张三", "产品部", "138****0001", "启用"],
    ["lisi", "李四", "研发部", "138****0002", "启用"],
    ["wangwu", "王五", "测试部", "138****0003", "停用"],
    ["zhaoliu", "赵六", "运维部", "138****0004", "启用"],
    ["sunqi", "孙七", "产品部", "138****0005", "启用"],
  ],
  entity: [
    ["patient", "患者", "主数据", "18 个属性", "已发布"],
    ["encounter", "就诊", "诊疗域", "24 个属性", "设计中"],
    ["order", "医嘱", "医嘱域", "31 个属性", "已发布"],
    ["diagnosis", "诊断", "诊疗域", "16 个属性", "已发布"],
  ],
  method: [
    ["createOrder", "创建医嘱", "医嘱实体", "3 个参数", "已发布"],
    ["cancelOrder", "取消医嘱", "医嘱实体", "2 个参数", "设计中"],
    ["closeEncounter", "结束就诊", "就诊实体", "2 个参数", "已发布"],
  ],
  interface: [
    ["POST", "/orders", "创建医嘱", "业务接口", "已发布"],
    ["GET", "/patients/{id}", "查询患者", "查询接口", "已发布"],
    ["PUT", "/encounters/{id}", "更新就诊", "业务接口", "设计中"],
  ],
};

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

function Avatar({ info, small = false }: { info: ModuleInfo; small?: boolean }) {
  return (
    <span
      className={`${small ? "size-6 text-[11px]" : "size-9 text-sm"} ${
        info.avatarTone
      } inline-flex shrink-0 items-center justify-center rounded-full font-semibold`}
    >
      {info.avatar}
    </span>
  );
}

function GlobalNav({ compact = false }: { compact?: boolean }) {
  return (
    <header className={`global-nav ${compact ? "global-nav--compact" : ""}`}>
      <div className="flex min-w-0 items-center gap-8">
        <div className="flex shrink-0 items-center gap-3">
          <BrandMark />
          <strong className="text-lg tracking-tight">伏羲平台</strong>
        </div>
        <nav className="global-links" aria-label="全局导航">
          <button type="button">原型列表</button>
          <button type="button" className="is-active">项目</button>
          <button type="button">系统管理</button>
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" aria-label="通知"><Bell /></Button>
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700">W</span>
        <span className="hidden text-sm font-medium md:inline">wushengzhi</span>
        <ChevronDown className="size-4 text-slate-400" />
      </div>
    </header>
  );
}

function MenuTree({ selected, onSelect, dense = false }: { selected: NodeId; onSelect: (id: NodeId) => void; dense?: boolean }) {
  const children: NodeId[] = ["entity", "method", "interface"];
  return (
    <div className={`menu-tree ${dense ? "menu-tree--dense" : ""}`}>
      <div className="tree-group-row">
        <span className="flex items-center gap-2 font-medium">
          <ChevronDown className="size-4" /><FolderTree className="size-4 text-slate-500" />业务域建模
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Users className="size-3.5" />3 人</span>
      </div>
      <div className="tree-children">
        {children.map((id) => {
          const item = moduleMap[id];
          return (
            <button type="button" key={id} className={`tree-item ${selected === id ? "is-active" : ""}`} onClick={() => onSelect(id)}>
              <span>{item.name}</span><Avatar info={item} small />
            </button>
          );
        })}
      </div>
      <button type="button" className={`tree-item tree-item--root ${selected === "permission" ? "is-active" : ""}`} onClick={() => onSelect("permission")}>
        <span className="flex items-center gap-2"><ShieldCheck className="size-4" />权限管理中心</span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-slate-500"><FileBox className="size-3.5" />1</span>
          <Avatar info={moduleMap.permission} small />
        </span>
      </button>
    </div>
  );
}

function ProjectBrowser({ selected, onSelect, onOpen }: { selected: NodeId; onSelect: (id: NodeId) => void; onOpen: () => void }) {
  const info = moduleMap[selected];
  return (
    <div className="app-shell">
      <GlobalNav />
      <section className="project-heading">
        <div>
          <p className="eyebrow">项目 / 建模开发平台</p>
          <div className="mt-1 flex items-center gap-3"><h1>建模开发平台</h1><Badge variant="secondary">4 个菜单节点</Badge></div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost"><Menu />管理菜单</Button>
          <Button variant="ghost"><Users />项目成员</Button>
          <Button variant="ghost"><Camera />项目快照</Button>
        </div>
      </section>
      <div className="project-layout">
        <aside className="project-sidebar">
          <div className="sidebar-title"><span>项目菜单</span><Button variant="ghost" size="icon-sm" aria-label="编辑项目菜单"><Settings2 /></Button></div>
          <MenuTree selected={selected} onSelect={onSelect} />
          <div className="sidebar-note"><CircleDot className="size-4 text-blue-600" />菜单节点连接负责人和原型</div>
        </aside>
        <main className="project-main">
          <section className="module-hero">
            <div className="min-w-0"><p className="eyebrow">当前功能模块</p><h2>{info.name}</h2><p>{info.description}</p></div>
            <div className="owner-chip"><Avatar info={info} /><span><small>负责人</small><strong>{info.owner}</strong></span></div>
          </section>
          <section className="content-grid">
            <article className="prototype-card">
              <div className="card-kicker"><span>绑定原型</span><Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">正式版</Badge></div>
              <div className="prototype-card-body">
                <div className="prototype-thumb"><div className="thumb-top" /><div className="thumb-rail" /><div className="thumb-lines"><i /><i /><i /></div></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h3>{info.prototype}</h3><Badge variant="outline">{info.version}</Badge></div>
                  <p>最近更新：今天 09:42 · 当前菜单节点已绑定 1 个原型</p>
                  <div className="mt-5 flex items-center gap-3"><Button onClick={onOpen}>进入原型工作台<ChevronRight /></Button><Button variant="outline">原型详情</Button></div>
                </div>
              </div>
            </article>
            <article className="collab-card">
              <div className="card-title-row"><h3>模块协作</h3><Button variant="ghost" size="icon-sm" aria-label="更多"><MoreHorizontal /></Button></div>
              <div className="metric-list">
                <div><span>负责人</span><strong>1</strong></div>
                <div><span>待处理候选</span><strong className={info.pending ? "text-amber-600" : ""}>{info.pending}</strong></div>
                <div><span>最近活动</span><strong>3</strong></div>
              </div>
            </article>
          </section>
          <section className="activity-section">
            <div className="card-title-row"><div><p className="eyebrow">协作动态</p><h3>围绕当前菜单节点</h3></div><Button variant="ghost">查看全部</Button></div>
            <div className="activity-list">
              <div className="activity-item"><span className="activity-icon bg-blue-50 text-blue-700"><Sparkles /></span><div><strong>wushengzhi 创建了候选“视觉优化 v3”</strong><p>涉及页面间距、表格对齐与按钮层级</p></div><time>刚刚</time></div>
              <div className="activity-item"><span className="activity-icon bg-emerald-50 text-emerald-700"><Check /></span><div><strong>{info.owner} 发布了 {info.version}</strong><p>版本已设为当前正式版</p></div><time>昨天</time></div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function PrototypeSurface({ node, candidate }: { node: NodeId; candidate: boolean }) {
  const info = moduleMap[node];
  const isPermission = node === "permission";
  const rows = tableRows[node];
  const headers = isPermission ? ["用户名", "姓名", "部门", "手机号", "状态"] : node === "entity" ? ["标识", "实体名称", "所属域", "属性", "状态"] : node === "method" ? ["方法标识", "方法名称", "所属实体", "参数", "状态"] : ["方法", "路径", "接口名称", "类型", "状态"];
  return (
    <div className={`prototype-surface ${candidate ? "is-candidate" : ""}`}>
      <header className="prototype-topbar">
        <div className="flex min-w-0 items-center gap-3"><span className="prototype-logo">{isPermission ? "权" : "模"}</span><span className="min-w-0"><strong>{isPermission ? "权限管理中心" : "业务域建模"}</strong><small>{info.name} · MVP</small></span></div>
        <div className="flex items-center gap-3"><Badge className="border-0 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">演示环境</Badge><UserRound className="size-4" /><span className="hidden text-sm sm:inline">管理员</span><ChevronDown className="size-4" /></div>
      </header>
      <nav className="prototype-tabs">
        {(isPermission ? ["用户管理", "角色管理", "用户组管理", "系统菜单管理"] : ["实体建模", "方法建模", "接口建模", "模型关系"]).map((label, index) => (
          <button type="button" className={index === 0 ? "is-active" : ""} key={label}>{index === 0 ? <UserRound /> : index === 3 ? <Menu /> : <Boxes />}{label}</button>
        ))}
      </nav>
      <main className="prototype-content">
        <div className="prototype-page-heading"><div><h3>{isPermission ? "用户管理" : info.name}</h3><p>{info.description}</p></div><Button className="bg-[#1769e0] hover:bg-[#145ac0]"><Plus />新建{isPermission ? "用户" : "模型"}</Button></div>
        <div className="prototype-filters">
          <label><Search /><input aria-label="搜索" placeholder={isPermission ? "搜索用户名 / 姓名 / 部门" : "搜索名称 / 标识"} /></label>
          <button type="button">全部状态 <ChevronDown /></button><button type="button">重置</button>
        </div>
        <div className="data-table" role="table" aria-label={info.name}>
          <div className="data-row data-head" role="row">{headers.map((header) => <span role="columnheader" key={header}>{header}</span>)}<span role="columnheader">操作</span></div>
          {rows.map((row, rowIndex) => (
            <div className="data-row" role="row" key={`${node}-${rowIndex}`}>
              {row.map((cell, index) => <span role="cell" key={`${cell}-${index}`}>{index === 4 ? <span className="inline-flex items-center gap-2"><i className={cell.includes("停用") ? "status-dot is-off" : "status-dot"} />{cell}</span> : cell}</span>)}
              <span role="cell" className="table-actions">编辑　查看</span>
            </div>
          ))}
        </div>
        <div className="table-footer"><span>共 {rows.length + 2} 条</span><div><button>‹</button><button className="is-active">1</button><button>›</button></div></div>
      </main>
    </div>
  );
}

function ProjectMenuSheet({ open, onOpenChange, selected, onSelect }: { open: boolean; onOpenChange: (open: boolean) => void; selected: NodeId; onSelect: (id: NodeId) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[350px] gap-0 p-0 sm:max-w-[350px]">
        <SheetHeader className="border-b px-6 py-5"><SheetTitle className="flex items-center gap-2 text-lg"><BrandMark />建模开发平台</SheetTitle><SheetDescription>项目菜单 · 切换后显示该节点绑定的原型</SheetDescription></SheetHeader>
        <div className="flex-1 overflow-y-auto p-4"><MenuTree selected={selected} dense onSelect={(id) => { onSelect(id); onOpenChange(false); }} /></div>
        <div className="border-t bg-slate-50 px-6 py-4 text-sm text-slate-600"><div className="flex items-center justify-between"><span>项目成员</span><strong className="text-slate-950">4 人</strong></div></div>
      </SheetContent>
    </Sheet>
  );
}

function ReviewSheet({ open, onOpenChange, info, state, onState }: { open: boolean; onOpenChange: (open: boolean) => void; info: ModuleInfo; state: CandidateState; onState: (state: CandidateState) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[390px] gap-0 p-0 sm:max-w-[390px]">
        <SheetHeader className="border-b px-6 py-5"><SheetTitle className="text-lg">{info.name} · 模块协作</SheetTitle><SheetDescription>当前菜单节点范围内的负责人、候选与动态</SheetDescription></SheetHeader>
        <div className="flex-1 overflow-y-auto">
          <div className="border-b px-6 py-5"><p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">负责人</p><div className="flex items-center gap-3"><Avatar info={info} /><div><strong className="block text-sm">{info.owner}</strong><span className="text-xs text-slate-500">负责当前功能模块</span></div></div></div>
          <Tabs defaultValue="pending" className="gap-0"><TabsList variant="line" className="h-12 w-full justify-start border-b px-5"><TabsTrigger value="pending" className="flex-none px-3">待处理 {state === "pending" ? 1 : 0}</TabsTrigger><TabsTrigger value="activity" className="flex-none px-3">协作动态</TabsTrigger></TabsList></Tabs>
          {state === "pending" ? (
            <div className="p-6">
              <div className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-semibold">视觉优化 v3</h3><p className="mt-1 text-sm text-slate-500">wushengzhi · 刚刚创建</p></div><Badge className="border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50">待确认</Badge></div>
              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4"><h4 className="font-semibold">本次变更</h4><ol className="mt-4 space-y-4 text-sm text-slate-700">{["统一页面间距与字号", "优化表格对齐方式", "提升操作按钮层级"].map((item, index) => <li key={item} className="flex items-center gap-3"><span className="inline-flex size-6 items-center justify-center rounded-full bg-white text-xs font-semibold shadow-sm">{index + 1}</span>{item}</li>)}</ol></div>
              <p className="mt-5 flex gap-2 text-sm leading-6 text-slate-500"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-blue-600" />采用后将生成新版本，当前正式版不会被覆盖。</p>
            </div>
          ) : (
            <div className="flex h-64 flex-col items-center justify-center px-8 text-center"><span className={`mb-4 inline-flex size-12 items-center justify-center rounded-full ${state === "adopted" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{state === "adopted" ? <Check /> : <MessageSquare />}</span><h3 className="font-semibold">{state === "adopted" ? "候选已采用" : "已退回修改"}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{state === "adopted" ? "已生成新的正式版本。" : "负责人将在修改后重新提交候选。"}</p></div>
          )}
        </div>
        {state === "pending" && <SheetFooter className="grid grid-cols-2 border-t bg-white p-5"><Button variant="outline" className="h-10" onClick={() => onState("returned")}>退回修改</Button><Button className="h-10" onClick={() => onState("adopted")}>采用候选</Button></SheetFooter>}
      </SheetContent>
    </Sheet>
  );
}

function PrototypeWorkspace({ selected, onSelect, onBack }: { selected: NodeId; onSelect: (id: NodeId) => void; onBack: () => void }) {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [version, setVersion] = useState("candidate");
  const [focus, setFocus] = useState(false);
  const [candidateState, setCandidateState] = useState<CandidateState>("pending");
  const info = moduleMap[selected];
  const pendingCount = candidateState === "pending" && selected === "permission" ? 1 : 0;
  return (
    <div className={`workspace-shell ${focus ? "is-focus" : ""}`}>
      {!focus && <GlobalNav compact />}
      <header className="workspace-context">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {!focus && <Button variant="ghost" size="icon" onClick={onBack} aria-label="返回项目"><ArrowLeft /></Button>}
          <Button variant="outline" className="shrink-0" onClick={() => { setReviewOpen(false); setProjectMenuOpen(true); }}><PanelLeftOpen /><span className="hidden sm:inline">项目菜单</span></Button>
          <span className="context-divider" />
          <div className="min-w-0"><div className="flex min-w-0 items-center gap-2"><strong className="truncate text-sm">{info.prototype}</strong><Badge variant="outline" className="hidden sm:inline-flex">{info.version}</Badge><Badge className="hidden border-0 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 md:inline-flex">正式版</Badge></div><p className="truncate text-xs text-slate-500">建模开发平台 / {info.group !== "建模开发平台" ? `${info.group} / ` : ""}{info.name}</p></div>
        </div>
        <div className="flex items-center gap-2">
          {!focus && <Button variant="ghost" className="hidden lg:inline-flex"><GitBranch />版本记录</Button>}
          <Button variant={pendingCount ? "outline" : "ghost"} onClick={() => { setProjectMenuOpen(false); setReviewOpen(true); }}><ListTodo /><span className="hidden sm:inline">待处理</span>{pendingCount > 0 && <span className="pending-count">{pendingCount}</span>}</Button>
          <Button onClick={() => setFocus((value) => !value)}><Maximize2 /><span className="hidden sm:inline">{focus ? "退出专注" : "专注模式"}</span></Button>
        </div>
      </header>
      <div className="preview-toolbar">
        <Tabs value={version} onValueChange={setVersion} className="gap-0"><TabsList className="h-9"><TabsTrigger value="formal" className="px-4">正式版 {info.version}</TabsTrigger><TabsTrigger value="candidate" className="px-4">候选版 v3</TabsTrigger></TabsList></Tabs>
        <div className="ml-auto flex items-center gap-2"><div className="device-switch" aria-label="预览设备"><button className="is-active" aria-label="桌面"><Monitor /></button><button aria-label="平板"><Tablet /></button><button aria-label="手机"><Smartphone /></button></div><Button variant="outline" className="hidden md:inline-flex"><Maximize2 />适配宽度</Button><Button><Sparkles />让 AI 修改</Button></div>
      </div>
      <main className="preview-canvas"><PrototypeSurface node={selected} candidate={version === "candidate"} /></main>
      <ProjectMenuSheet open={projectMenuOpen} onOpenChange={setProjectMenuOpen} selected={selected} onSelect={onSelect} />
      <ReviewSheet open={reviewOpen} onOpenChange={setReviewOpen} info={info} state={candidateState} onState={setCandidateState} />
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("project");
  const [selected, setSelected] = useState<NodeId>("permission");
  const selectedInfo = useMemo(() => moduleMap[selected], [selected]);
  return mode === "project" ? <ProjectBrowser selected={selected} onSelect={setSelected} onOpen={() => setMode("workspace")} /> : <PrototypeWorkspace key={selectedInfo.id} selected={selected} onSelect={setSelected} onBack={() => setMode("project")} />;
}
