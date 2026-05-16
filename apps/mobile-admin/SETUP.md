# KB Admin app — one-time setup

The mobile-admin shell is identical to `apps/mobile` (customer app) with these
swaps already in place:

- Name: `KB Admin`
- Bundle / package: `com.krishnasbliss.admin`
- Target URL: `https://admin.krishnasbliss.com`
- User-Agent suffix: `KrishnasBlissAdmin/1.0`
- Icon + splash: inverted palette (teal bg, cream/multicolored feather)

You only need to wire up two external services before the first build.

## 1. EAS project

```
cd apps/mobile-admin
npx eas init                    # creates a new EAS project (separate from the customer app)
```

EAS will print a project ID — copy it into `app.json` at `extra.eas.projectId`
(currently set to `REPLACE_WITH_NEW_EAS_PROJECT_ID`).

## 2. Firebase Android app (push notifications)

The cloned `google-services.json` is keyed to `com.krishnasbliss.shop` — it was
renamed to `google-services.json.placeholder` so an accidental build fails fast
instead of pushing to the wrong Firebase project.

In the Firebase console for your existing `krishnasbliss` project:

1. Add a new Android app → package name **`com.krishnasbliss.admin`**, nickname **KB Admin**.
2. Download the new `google-services.json` for that app.
3. Drop it into `apps/mobile-admin/google-services.json`.
4. (Optional) Delete `google-services.json.placeholder` once the real one is in place.

iOS push (if you ever build for iOS) is configured separately via APNs in the
Apple Developer portal — same process you used for the customer app, just keyed
to the new bundle id.

## 3. Build

```
cd apps/mobile-admin
npm install
npm run build:android           # APK preview build via EAS
```

The first build will fail with a clear error if either step 1 or step 2 was
skipped.

## Push token namespace

Device tokens registered by this app go to `POST /api/account/device-token`
with `Authorization: Bearer <admin JWT>`. Since admin JWTs are issued by
`/api/admin/auth/login` (not the customer auth flow), pushes sent via
`pushToCustomer()` won't reach admin devices — they're cleanly partitioned by
the JWT subject.

If you later want admin-targeted push (e.g. new-order alerts to phones), add a
separate `pushToAdmin()` helper that selects by admin_user_id rather than
customer_id.
