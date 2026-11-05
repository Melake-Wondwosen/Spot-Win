# Spot Win

Habesha's engagement payment record app. Sales team members record every payment they make at an outlet: where and when, which outlet, which activity, how much in Birr or crates, a photo of the receipt and a photo of the engagement. Managers watch their division live. Managers and admins download the records as an Excel file in one click.

Built from the Habesha Outlet Survey app. White, gold and black only. Works on phones from 320 px up to wide desktops with no sideways scrolling.

| Item | Detail |
| --- | --- |
| Front end | React 19, Vite, Tailwind 4, React Router, Leaflet (manager map), SheetJS (Excel) |
| Hosting | Vercel, auto-deploys from `main` |
| Back end | Google Apps Script web app, `apps-script/SpotWin.gs` |
| Data | Google Sheet "Spot Win" |
| Outlet master | National Outlet tab of the Habesha Survey sheet (read only) |
| Photos | Google Drive folder "Spot Win Photos", one subfolder per month |
| Phone storage | IndexedDB for the visit in progress, the upload queue and photos |

## Deploy

1. Open [script.google.com](https://script.google.com), create a new project and name it Spot Win.
2. Replace `Code.gs` with `apps-script/SpotWin.gs`. In Project Settings tick "Show appsscript.json" and replace it with `apps-script/appsscript.json`.
3. Optional: in Project Settings > Script properties set `SHEET_ID`, `OUTLET_SHEET_ID` and `PHOTO_FOLDER_ID` if you already made the sheet and folder. Leave them empty and setup creates a "Spot Win" sheet and a "Spot Win Photos" folder for you. `OUTLET_SHEET_ID` defaults to the Habesha Survey sheet.
4. Pick `paymentSetup` in the function list and Run. Grant the Sheets and Drive permissions. It creates every tab, the signing secret, the default settings and an `admin` account. The sheet link, folder link and admin password are in the execution log.
5. Run `importSurveyUsers` if the sales team should start from the survey app's users. Then set roles and regions in the Users tab (or in the admin console).
6. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone. Copy the URL ending in `/exec`. Opening it in a browser shows `ok`.
7. Put the URL in `API_URL` in `src/config.js`, push to `main`, and import the repo in Vercel (framework preset Vite, root directory empty).
8. Share the "Spot Win Photos" folder as view only with the managers' and admins' Google accounts, so the photo links in the Excel file open.

After any change to the script use Deploy > Manage deployments > Edit > New version, so the URL stays the same.

## Roles

Everyone signs in on the same page. The Users tab decides where they land.

| Role (Users tab) | Lands on | Sees |
| --- | --- | --- |
| blank or any other word | home screen | own visits and upload queue |
| "ASM" or "Area Sales Manager" | /manager | sales users with the same agent and visits to that agent's outlets; can export |
| "RTM" or "Trade Marketing" | /manager | sales users and visits of their region, like a manager |
| contains "manager" | /manager | sales users and visits of their region; all divisions if region is blank; can export |
| contains "admin" | /admin | everything, the manager view, users, outlets, settings |

Users tab columns: id, username, password, name, staffId, role, region, agent, active. A sales user's agent decides which outlets download to their phone (their region is used when agent is blank) and which ASM sees them. An ASM can cover several agents: separate the names with commas. Put `no` in active to block someone; they lose access within a minute.

Passwords given by an admin are temporary. The first time someone signs in, the app asks them to pick their own (at least 6 characters, no spaces, different from the one they were given) and opens nothing else until they do. The date they did it goes in the `passwordChanged` column. Setting a new password in the admin console clears that date, so they choose again at their next sign-in.

ASMs, RTMs and managers get two views: Live (who is online, map, latest visits) and Spending (totals, spending by agent, territory, sales person or activity, visits per day, Excel export), both limited to their agent or division.

## How a visit is saved

1. The phone keeps the visit and both photos in IndexedDB after every answer, so a reload or a flat battery loses nothing.
2. Finish puts the visit in the phone's queue and goes home. Nothing waits on the network.
3. The queue uploads the receipt photo, the engagement photo, then the visit row. Each step is safe to send twice: same visit ID and kind = one photo, same visit ID = one row.
4. Photos leave the phone only once the server has the visit row.

## Alerts

| Alert | Raised when |
| --- | --- |
| High amount | amount above the Birr or crate limit in Settings (the user confirms first) |
| Away from outlet | finished more than the distance limit from the outlet's coordinates |
| Very short visit | finished less than a minute after start |
| Duplicate receipt | the receipt file matches a receipt on another visit (SHA-256 of the original file) |
| GPS jump | two location points imply over 150 km/h (manager view) |
| Dev tools | a debugger is attached on a sales user's phone |
| Location off | location permission removed during a session |

Outlet coordinates for the distance check come from the Outlets tab, or from Latitude and Longitude columns in National Outlet if it has them.

## Excel export

One click on Export Excel (manager header, admin Visits tab) downloads `Spot_Win_<division>_<from>_to_<to>.xlsx` with three sheets: Visits (bold gold header, frozen, filters on every column, Addis times as real Excel dates, Outlet IDs as text, clickable photo links), Summary (by division and by activity) and Filters (who, when, which filters). Void visits are included only when the status filter asks for them. Every export is logged in the Exports tab.

## Speed

- First load is about 100 KB gzipped. The visit screens load in the background while the home screen is up. The map and manager screens load only for managers and admins. SheetJS (140 KB) loads only when someone exports.
- A service worker keeps the app on the phone, so it opens instantly and works with no signal.
- The user's division of National Outlet sits on the phone, so an Outlet ID fills in on the keystroke.
- Photos are shrunk on the phone to under 400 KB before upload. Managers see 200 px thumbnails stored in the sheet; full photos load only when a visit is opened.
- On the server, sign-in and location reports never wait for the lock, and users, settings, divisions and outlet lookups are cached.

## Local

```
npm install
npm run dev
```

`npm run preview:html` builds `preview.html`, a single file with made-up data that never calls the server. Any username signs in as a sales user; a username containing "manager" or "admin" opens those views.

## Limits worth knowing

- Passwords are plain text in the Users tab. Share the sheet only with admins.
- Sessions don't expire; blocking the user is how you end one.
- A web page can't see whether a fake-GPS app is on. The location checks are a deterrent, not a guarantee.
- A receipt from the gallery can be an old photo. The hash check catches only exact repeats of the same file.
- The Track tab grows by about 20 rows per user per hour of use. Archive it monthly once it passes 100,000 rows.
