# DPWH Oversight Mobile

Expo SDK 57 mobile client for the DPWH public project portal and inspector workflow.

## First-time setup

Requirements:

- Node.js 22.13 or newer
- Android Studio emulator, or Expo Go on an Android phone
- The companion Django project at `D:\lacre-abragan-capstone\dpwh-web`

Install the mobile dependencies:

```powershell
cd D:\dpwh-oversight-app
npm ci
```

## Run the local public portal API

In one PowerShell terminal:

```powershell
cd D:\lacre-abragan-capstone\dpwh-web
py manage.py migrate
py manage.py seed_public_projects
py manage.py runserver 0.0.0.0:8000
```

The sample-data command is optional and safe to run again. It creates clearly labeled demonstration projects only when they do not already exist.

## View the mobile app

Keep the Django terminal running. In a second PowerShell terminal:

```powershell
cd D:\dpwh-oversight-app
npm start
```

Then either:

- Scan the terminal QR code with Expo Go while the phone and computer are on the same Wi-Fi network.
- Press `a` in the Expo terminal to open the app in a running Android emulator.

The app normally detects the computer's LAN address from Expo. If the public project list cannot connect, run `ipconfig`, then set `EXPO_PUBLIC_LOCAL_IP` in `.env` to the computer's Wi-Fi IPv4 address and restart Expo.

For a deployed backend, set `EXPO_PUBLIC_WEB_URL` to its HTTPS origin. Example:

```dotenv
EXPO_PUBLIC_WEB_URL=https://oversight.example.gov.ph
```

The mobile browse screen reads approved public records from `/public/api/public/projects/`. Inspector login remains available from the button in the public header.
