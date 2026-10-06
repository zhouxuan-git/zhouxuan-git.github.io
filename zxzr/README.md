# Album

A static photo album for GitHub Pages. Visitors can browse publicly. The owner can upload from the website after connecting Supabase. The kraft-paper cover carries an oil painting of the bouquet and opens by tap or right swipe; each transparent page holds 20 photos. The layout works on phones and desktops without a build step or CDN.

At this repository's default GitHub Pages address, the album is available at `https://zhouxuan-git.github.io/zxzr/`. The path contains `zxzr`. For a domain name containing those letters, register a custom domain and connect it in GitHub Pages and DNS. Domain availability depends on the registrar.

## Enable website uploads

1. Create a Supabase project. In **Authentication → Users**, create one owner account, verify its email, make sure password sign-in works, and copy its user UUID. Disable public sign-ups. Keep the email and password out of the repository. If you later use invitations, email confirmation, or password recovery, set the Site URL and allowed Redirect URLs under **Authentication → URL Configuration** to `https://zhouxuan-git.github.io/zxzr/` and any custom domain. Ordinary password sign-in does not redirect.
2. Run the SQL below in the Supabase SQL Editor. **Replace both instances of `00000000-0000-0000-0000-000000000000` with the owner's Auth user UUID.** It creates a publicly readable bucket and permits only that user to upload or delete files under `photos/`. It does not permit overwriting existing files. Check Storage Policies first if policies with these names already exist.
3. Confirm the project URL in [`config.js`](./config.js) and add the **publishable key** (or the legacy `anon` key) from **Project Settings → API Keys**. These settings are public; the server-side policies protect uploads. **Never put a `service_role` or secret key in this file.**
4. Push the changes to `main` and make sure GitHub Pages is enabled. Open the album, select **Add Photos**, sign in, and select one or more photos. New photos appear first. Sign in again after refreshing the page; the browser does not save the password.

**Where to find the owner UID:** In the Supabase project dashboard, open **Authentication → Users** and click the row for the email you will use to sign in to the album. Copy its **UID** (sometimes labeled **User ID** or **id**) from the user details. If there is no row, create an Auth user first; your Supabase dashboard account is not automatically an album user. You can also run `select id, email from auth.users;` in the SQL Editor; the `id` beside your album owner's email is the UID. Do not use the project ID.

The project URL is set in `config.js`, but the publishable key is still empty. Until that key and the Storage policies are configured, the website shows **Set Up Uploads** instead of an upload form. Uploads and policies have not been verified against a live Supabase project yet.

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

Anyone with the URL can view photos. Uploaded originals may retain GPS or other EXIF metadata; remove private metadata before uploading. File names become captions. To delete a photo, use the Supabase Storage dashboard. The website currently supports adding photos only.

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
