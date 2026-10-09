# Album

A static photo album for GitHub Pages. Visitors can browse publicly. The owner can upload from the website after connecting Supabase. The kraft-paper cover carries an oil painting of the bouquet and opens by tap or right swipe; each transparent page holds 20 photos. The layout works on phones and desktops without a build step or CDN.

At this repository's default GitHub Pages address, the album is available at `https://zhouxuan-git.github.io/zxzr/`. The path contains `zxzr`. For a domain name containing those letters, register a custom domain and connect it in GitHub Pages and DNS. Domain availability depends on the registrar.

## Enable website uploads

1. Create a Supabase project. In **Authentication → Users**, create one owner account, verify its email, make sure password sign-in works, and copy its user UUID. Disable public sign-ups. Keep the email and password out of the repository. If you later use invitations, email confirmation, or password recovery, set the Site URL and allowed Redirect URLs under **Authentication → URL Configuration** to `https://zhouxuan-git.github.io/zxzr/` and any custom domain. Ordinary password sign-in does not redirect.
2. Run the SQL below in the Supabase SQL Editor. **Replace both instances of `00000000-0000-0000-0000-000000000000` with the owner's Auth user UUID.** It creates a publicly readable bucket and permits only that user to upload or delete files under `photos/`. It does not permit overwriting existing files. The script can be rerun for these three named policies.
3. Confirm the project URL and **publishable key** (or the legacy `anon` key) in [`config.js`](./config.js). These settings are public; the server-side policies protect uploads. **Never put a `service_role` or secret key in this file.**
4. Push the changes to `main` and make sure GitHub Pages is enabled. Open the album, select **Add Photos**, sign in, and select one or more photos. New photos appear first. Sign in again after refreshing the page; the browser does not save the password.

When changing `config.js` or `app.js`, change their `?v=` values in `index.html` so browsers fetch the new files instead of a cached copy.

**Where to find the owner UID:** In the Supabase project dashboard, open **Authentication → Users** and click the row for the email you will use to sign in to the album. Copy its **UID** (sometimes labeled **User ID** or **id**) from the user details. If there is no row, create an Auth user first; your Supabase dashboard account is not automatically an album user. You can also run `select id, email from auth.users;` in the SQL Editor; the `id` beside your album owner's email is the UID. Do not use the project ID.

The project URL and publishable key are set in `config.js`. The website now shows **Add Photos**. Uploads require the Storage SQL below and a confirmed owner Auth account; live upload has not yet been verified.

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

drop policy if exists "zxzr_public_photo_list" on storage.objects;
drop policy if exists "zxzr_owner_photo_insert" on storage.objects;
drop policy if exists "zxzr_owner_photo_delete" on storage.objects;

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

Anyone with the URL can view photos. Uploaded originals may retain GPS or other EXIF metadata; remove private metadata before uploading. File names become captions. To remove an uploaded photo, sign in as the owner, open the photo, and choose **Delete Photo**. Confirm the deletion; it cannot be undone. The owner can also delete files in **Supabase Storage → zxzr-photos → photos**. Repository photos must be removed from `photos.json` and the repository separately.

iPhone HEIC/HEIF photos are converted to JPEG in the browser before upload, using the browser's own image decoder. The converted JPEG must be at most 10 MB and keeps the original file name as its caption. If the browser cannot decode a HEIC/HEIF photo, export it as JPG before selecting it. No conversion service receives the photo.

## Add photos through the repository

The album also reads [`photos.json`](./photos.json). Put images in `assets/photos/` and add entries to the JSON array:

```json
[
  {
    "src": "./assets/photos/example.jpg",
    "caption": "A day with flowers",
    "alt": "A bouquet on a table"
  }
]
```

A new page is generated every 20 photos. When Supabase is configured, uploaded photos appear before repository photos. A static website cannot write directly to its GitHub repository; direct website uploads require Supabase as described above.

## Local preview

From the repository root, run `python3 -m http.server 8000` and open `http://localhost:8000/zxzr/`. No dependencies are required. Open the page over HTTP so it can fetch `photos.json`; do not open it with `file://`.

## License

The website source code and documentation in this directory are available under the [MIT License](./LICENSE). The cover artwork (`assets/cover-painting.webp` and `assets/kraft-texture.webp`) is **excluded from the MIT License**. Future uploads and photos in `assets/photos/` are also excluded unless their owners grant permission separately.
