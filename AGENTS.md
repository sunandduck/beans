# 项目上下文

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4

## 目录结构

```
├── public/                 # 静态资源
├── scripts/                # 构建与启动脚本
│   ├── build.sh            # 构建脚本
│   ├── dev.sh              # 开发环境启动脚本
│   ├── prepare.sh          # 预处理脚本
│   └── start.sh            # 生产环境启动脚本
├── src/
│   ├── app/                # 页面路由与布局
│   ├── components/ui/      # Shadcn UI 组件库
│   ├── hooks/              # 自定义 Hooks
│   ├── lib/                # 工具库
│   │   └── utils.ts        # 通用工具函数 (cn)
│   └── server.ts           # 自定义服务端入口
├── next.config.ts          # Next.js 配置
├── package.json            # 项目依赖管理
└── tsconfig.json           # TypeScript 配置
```

- 项目文件（如 app 目录、pages 目录、components 等）默认初始化到 `src/` 目录下。

## 包管理规范

**仅允许使用 pnpm** 作为包管理器，**严禁使用 npm 或 yarn**。
**常用命令**：
- 安装依赖：`pnpm add <package>`
- 安装开发依赖：`pnpm add -D <package>`
- 安装所有依赖：`pnpm install`
- 移除依赖：`pnpm remove <package>`

## 开发规范

### 编码规范

- 默认按 TypeScript `strict` 心智写代码；优先复用当前作用域已声明的变量、函数、类型和导入，禁止引用未声明标识符或拼错变量名。
- 禁止隐式 `any` 和 `as any`；函数参数、返回值、解构项、事件对象、`catch` 错误在使用前应有明确类型或先完成类型收窄，并清理未使用的变量和导入。

### next.config 配置规范

- 配置的路径不要写死绝对路径，必须使用 path.resolve(__dirname, ...)、import.meta.dirname 或 process.cwd() 动态拼接。

### Hydration 问题防范

1. 严禁在 JSX 渲染逻辑中直接使用 typeof window、Date.now()、Math.random() 等动态数据。**必须使用 'use client' 并配合 useEffect + useState 确保动态内容仅在客户端挂载后渲染**；同时严禁非法 HTML 嵌套（如 <p> 嵌套 <div>）。
2. **禁止使用 head 标签**，优先使用 metadata，详见文档：https://nextjs.org/docs/app/api-reference/functions/generate-metadata
   1. 三方 CSS、字体等资源可在 `globals.css` 中顶部通过 `@import` 引入或使用 next/font
   2. preload, preconnect, dns-prefetch 通过 ReactDOM 的 preload、preconnect、dns-prefetch 方法引入
   3. json-ld 可阅读 https://nextjs.org/docs/app/guides/json-ld

## UI 设计与组件规范 (UI & Styling Standards)

- 模板默认预装核心组件库 `shadcn/ui`，位于`src/components/ui/`目录下
- Next.js 项目**必须默认**采用 shadcn/ui 组件、风格和规范，**除非用户指定用其他的组件和规范。**

## API 路由

### `/api/generate` - AI 卡通化（拼豆图纸生成）
- **方法**: POST
- **参数**: `{ imageUrl: string, prompt?: string, subjectDesc?: string }`
- **功能**: 调用火山引擎 Seedream 5.0 Lite 图生图 API，将照片转换为拼豆风格的 Q 版卡通图
- **模型**: `doubao-seedream-5-0-260128`（Seedream 5.0 Lite）
- **输出尺寸**: 2048×2048
- **价格**: 0.22 元/张
- **提示词**: 内置拼豆图纸设计原则（Q 版 chibi 风格、透明背景、4-8 种颜色、粗黑色轮廓线）

### `/api/remove-bg` - 通用抠图（去背景）⚠️ 已禁用
- **状态**: 未使用，前端未集成此功能
- **原功能**: 调用腾讯云数据万象 AIPicMatting 接口进行抠图
- **依赖**: 腾讯云 COS + 数据万象 CI（需配置 TENCENTCLOUD_SECRET_ID 等环境变量）

## 代码推送与部署规范（CRITICAL）

### 工作流程
```
1. 在沙箱环境开发代码
   ↓
2. 在沙箱环境测试验证（本地预览）
   ↓
3. 测试通过后，告诉用户"代码已准备好"
   ↓
4. 用户确认要推送
   ↓
5. 执行 git push（并询问是否同步 main）
   ↓
6. 用户在服务器上拉取部署
```

### 规则
1. **不擅自推送**：未经用户明确允许，不要自动执行 `git push` 推送代码到服务器
2. **推送前询问**：需要推送时，先告诉用户要推送的内容，等待用户确认
3. **分支同步询问**：推送 master 分支时，必须询问用户是否需要同步到 main 分支
4. **只提供命令**：给出部署命令让用户自己执行，不要自动执行 `git push`
5. **本地 commit 可以自动执行**：`git add` 和 `git commit` 可以自动执行，但 `git push` 必须等待用户确认
6. **沙箱测试优先**：每次调试都需要先在沙箱环境中测试，测试完才会推送到服务端

## 环境变量

| 变量名 | 说明 | 必需 |
|--------|------|------|
| `ARK_API_KEY` | 火山方舟 API Key（Seedream 5.0 Lite） | ✅ 是 |
| `TENCENTCLOUD_SECRET_ID` | 腾讯云 SecretId（抠图功能，已禁用） | ❌ 否 |
| `TENCENTCLOUD_SECRET_KEY` | 腾讯云 SecretKey（抠图功能，已禁用） | ❌ 否 |
| `COS_BUCKET` | COS 存储桶名称（抠图功能，已禁用） | ❌ 否 |
| `COS_REGION` | COS 地域（抠图功能，已禁用） | ❌ 否 |

## 核心模块

### `src/lib/perler-engine.ts` - 拼豆图纸引擎
- `processImage()`: 图片处理（像素化、颜色量化、风格滤镜）
- `renderPattern()`: 图纸渲染（支持 colored/numbered/hybrid 三种显示模式）
- `downloadPatternImage()`: 导出图纸图片
- `downloadColorList()`: 导出色号清单
- `findNearestColor()`: 感知加权色彩匹配（MARD 色卡）
- 支持 `preserveTransparency` 选项保留透明通道

### `src/lib/mard-colors.ts` - MARD 拼豆色卡
- MARD 291 完整色卡（291色）
- MARD 221 标准色板、MARD 24 基础色板
- 复古游戏风格 16 色精简色板
