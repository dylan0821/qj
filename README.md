# 强基计划数学题库

前端部署在 `https://dylandong.top/qj/`，GitHub 仓库 `dylan0821/qj`。Cloudflare Workers + D1 在服务端验证邀请码，原始 TeX 只保留本地。

## 邀请码

- 一次性码只能兑换一次，兑换后当前浏览器持续可用；清除浏览器数据、换浏览器或退出登录后需重新发码。
- 长期码可重复兑换。管理员停用任意邀请码后，所有关联访问凭据失效；包括已兑换的一次性码。
- 管理页面为 `https://qj-reader-api.dylan-dong.workers.dev/admin`。登录后可生成、复制邀请码、填写备注、查看兑换次数和停用。完整码仅在创建时显示，请复制保存。
- 浏览器访问凭据保存在当前浏览器；数据库只存邀请码和凭据的哈希。管理口令通过 Cloudflare Secret 设置，管理会话使用 HttpOnly Cookie。
- 已提供给获准读者的内容可以被保存；此功能控制访问资格，并不防止获准读者复制内容。

## 目录与发布边界

公开仓库只包含网页界面、MathJax、后端代码、数据库结构和发布配置。`private-assets/data/` 存阅读 JSON，`private-assets/assets/questions/` 存配图，均被 Git 忽略，只上传到 Cloudflare 的受保护资源绑定。没有原始 TeX、题源路径、PDF 或个人收藏数据。

Cloudflare 的 `run_worker_first=true` 确保任何文件请求都先经过后端；只有 `/protected/` 的白名单路径可通过验证读取。禁止直接访问原资源路径，受保护响应不使用公共缓存。Pages 工作流另按白名单组装 `_site`，不上传数据库、题目 JSON、配图或凭据。

原来包含阅读 JSON 的完整网站与 Git 历史已移到旁边私有题库的 `归档/强基发布仓库/20261012-邀请码前/`，不在此发布仓库内。本仓库使用全新 `main` 历史。

## 本地验收

安装依赖后，在本文件夹创建被忽略的 `.dev.vars`：`ADMIN_KEY` 为本地管理口令，`ALLOWED_ORIGINS` 含 `http://127.0.0.1:8770`。不要提交这个文件。

```sh
npm run db:local
npm run dev:api
```

另开终端：

```sh
npm run preview
npm run test:auth
```

浏览器打开 `http://127.0.0.1:8770/`，管理页面 `http://127.0.0.1:8787/admin`。预览服务按公开文件白名单响应，不能用普通文件服务器替代。测试会创建本地测试邀请码，不操作远程数据库。

## 正式部署

先完成本地与浏览器验收，再登录 Cloudflare。确认 `wrangler.jsonc` 中数据库 `qj-invitations` 的 ID，然后执行远程数据库迁移，设置 `ADMIN_KEY` secret，部署后端。将 `site-config.js` 的 `apiBase` 设置为实际 HTTPS Worker 地址。生产 CORS 仅允许 `https://dylandong.top` 和 `https://dylan0821.github.io`，不要上传本地测试配置。

GitHub 仓库启用 Pages 的 GitHub Actions 发布方式，只推送无题目数据历史的 `main`。域名沿用账号已有的自定义域名，不迁移 DNS。上线后仍需复查未登录题目和图片访问被拒绝，以及两类邀请码兑换、保持访问与停用行为。

## 更新题库

题源与台账继续在旁边的私有 `题库` 文件夹维护。在该目录运行 `python3 -B 工具/build_strong_static_site.py`，更新本仓库被忽略的 `private-assets/`，然后重新部署 Cloudflare 后端。无需把阅读数据推送到 GitHub。

网页仅保留“整卷”和“分类”，去掉原指定的筛选工具及额外功能；选择题选项逐行显示，题号不补零，标题不重复显示学校的“强基计划”。收藏、最近浏览和选题篮只存当前浏览器。学生版与教师版通过浏览器打印保存 PDF。

## 上线验收（2026-10-12）

本地与 Cloudflare 正式后端各通过 32 项实际请求验收，涵盖一次性码 10 请求并发仅成功一次、长期码重复兑换、关联会话停用、退出、限流、跨域限制、管理员操作保护和 842 道题目录及配图访问保护。管理口令与阅读数据未提交到 GitHub。
