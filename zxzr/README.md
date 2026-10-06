# ZXZR 时光相簿

这是一个可直接放在 GitHub Pages 上的静态相簿。访客可以公开浏览；站长登录后可从网页上传照片。封面点击或向右滑动翻开，内页每页固定 20 个透明相片位，支持翻页和查看大图。页面可在手机和电脑使用，不依赖 CDN 或打包工具。

部署在当前仓库时，网址为 `https://zhouxuan-git.github.io/zxzr/`。网址路径包含 `zxzr`；如果需要**域名本身**包含 `zxzr`，须另行注册域名并在 GitHub Pages 设置和 DNS 中绑定。域名是否可注册取决于注册商。

## 从网站直接上传：一次性配置

1. 创建一个 Supabase 项目。在 **Authentication → Users** 中手动创建唯一的站长账号，确认邮箱已验证且可用密码登录，记下该用户的 UUID。关闭公开自助注册；不要让访客自行注册。邮箱和密码不要写进仓库。若日后使用邀请、邮箱确认或找回密码邮件，在 **Authentication → URL Configuration** 中将 Site URL 和允许的 Redirect URLs 设为 `https://zhouxuan-git.github.io/zxzr/`；如绑定了自定义域名，也加入新网址。普通密码登录本身无需重定向。
2. 在 Supabase 的 SQL Editor 中运行下面的 SQL。**先将两处 `00000000-0000-0000-0000-000000000000` 替换为站长的 Auth 用户 UUID。** 它创建公开读取的存储桶；只有该用户能在 `photos/` 上传或删除，且不允许覆盖更新已有文件。若已建立同名策略，先在 Storage Policies 中检查，避免重复创建。
3. 在 Project Settings → API 中复制项目 URL 和 **publishable key**（旧项目可用 `anon` key），填入 [`config.js`](./config.js)。这些是公开的前端配置，保护上传权限的是下面的服务端策略。**绝对不要填写 `service_role` / secret key。**
4. 将仓库变更推送到 `main` 并确认 GitHub Pages 已启用。站长打开相簿，点“添加照片”，用创建的账号登录后可一次选择多张照片上传。新照片会自动显示在第一页。刷新页面后需重新登录，密码不会保存在浏览器。

仓库随附的 `config.js` 目前为空；在填入自己的 Supabase 项目配置并实际执行上传前，在线上传和访问策略尚未经过真实项目验证。页面会明确显示“在线上传尚未启用”。

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'zxzr-photos', 'zxzr-photos', true, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "zxzr_public_photo_list"
on storage.objects for select to anon, authenticated
using (bucket_id = 'zxzr-photos' and name like 'photos/%');

create policy "zxzr_owner_photo_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'zxzr-photos'
  and name like 'photos/%'
  and split_part(name, '/', 3) = ''
  and auth.uid() = '00000000-0000-0000-0000-000000000000'::uuid
);

create policy "zxzr_owner_photo_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'zxzr-photos'
  and name like 'photos/%'
  and split_part(name, '/', 3) = ''
  and auth.uid() = '00000000-0000-0000-0000-000000000000'::uuid
);
```

公开存储意味着任何知道网址的人都可查看照片。上传使用原始文件，照片可能保留拍摄位置等 EXIF 元数据；请在上传前清除不希望公开的信息。文件名会成为相簿中的标题。若需要删除照片，可在 Supabase Storage 管理后台操作；网页目前只提供新增功能。

## 不使用在线上传时，手动添加照片

相簿也能从仓库中的 [`photos.json`](./photos.json) 读取照片。将图片加入 `assets/photos/`，再在 JSON 数组中加入一项：

```json
[
  {
    "src": "./assets/photos/example.jpg",
    "caption": "这一天的花",
    "alt": "花束放在桌上"
  }
]
```

每 20 张自动生成一页。Supabase 配好后，在线照片会显示在手动添加的照片前面。静态网站无法直接写入 GitHub 仓库；网页直接上传需要按前述步骤配置 Supabase。

## 本地预览

在仓库根目录运行 `python3 -m http.server 8000`，打开 `http://localhost:8000/zxzr/`。相簿界面无需安装依赖。`photos.json` 需要通过 HTTP 读取，因此不要直接用 `file://` 打开。

## 授权

本目录中的网页源代码和说明文档按 [MIT License](./LICENSE) 开源。`assets/cover-flowers.png` 是用户提供照片加工而成，**不包含在 MIT 授权中**；日后上传的照片及 `assets/photos/` 中的照片也不自动按 MIT 授权。请取得照片权利人的许可后再复用。
