# Matrix Workspace Boilerplate

A React/Vite boilerplate designed to aggregate multiple Google Workspace accounts (Gmail, Google Drive, Google Calendar) into a single unified dashboard without relying on a backend server.

This application uses a strict **Bring Your Own Key (BYOK)** architecture. It stores OAuth tokens securely in the browser's IndexedDB, ensuring complete client-side privacy.

## Features
- **Multi-Account Concurrent Login:** Authorize up to 5 different Google accounts and fetch data simultaneously.
- **Unified Dashboard:** View latest files, emails, and upcoming calendar events from all active profiles in one place.
- **100% Client-Side:** No databases, no backend servers, no privacy risks.
- **BYOK (Bring Your Own Key):** Users supply their own Google OAuth Client ID via the Settings tab to bypass shared quota limits.

## How to Set Up Your Google Cloud Client ID (Required)

To use this application, you must provide a Google OAuth Client ID. 

### Step 1: Create a Google Cloud Project
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Click the project dropdown at the top and select **New Project**. Name it whatever you want (e.g., "Matrix Workspace").

### Step 2: Configure the OAuth Consent Screen
1. In the search bar, search for **OAuth consent screen**.
2. Choose **External** user type and click **Create**.
3. Fill out the required fields (App name, User support email, Developer contact email). You don't need a logo or domains yet.
4. On the **Scopes** screen, click **Add or Remove Scopes**. You *must* add the following scopes:
   - `https://www.googleapis.com/auth/drive`
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/calendar.readonly`
5. Save and continue. **Leave the Publishing Status in "Testing" mode.**

### Step 3: Add Test Users (CRITICAL)
Because your app is in "Testing" mode, Google will block anyone from logging in unless you manually whitelist their email address.
1. On the OAuth consent screen summary page, scroll down to **Test users**.
2. Click **+ Add Users**.
3. Type in the email addresses of the accounts you want to connect to Matrix Workspace (your personal email, your client emails, your work email).
4. Click Save. *If you do not add your secondary emails here, you will see an "Access Blocked: verification process" error when trying to log in.*

### Step 4: Generate the Client ID
1. Go to **APIs & Services > Credentials** in the left sidebar.
2. Click **+ Create Credentials > OAuth client ID**.
3. Select **Web application** as the Application type.
4. Under **Authorized JavaScript origins**, click **+ Add URI**. 
   - Add your local development URL (e.g., `http://localhost:3000` or `http://localhost:5173`).
   - Add your live deployment URL (e.g., `https://your-vercel-app.vercel.app`).
5. Click **Create**.
6. Copy the **Client ID** (it looks like `123456789-abcde12345.apps.googleusercontent.com`).

### Step 5: Connect in the App
1. Run the app (`npm install` and `npm run dev`).
2. Open the app in your browser and navigate to the **Settings** tab.
3. Paste your Client ID into the "Google OAuth Client ID" field.
4. Go to the Dashboard and click **Add Account**. 
5. Select one of the emails you added to the "Test users" list.

## Local Development

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev

# Build for production
npm run build
```

## Security & Deployment
- Do not paste your Google Client ID into `.env` or source code files. The application is designed to ingest the key dynamically through the UI to allow individual end-users to provide their own keys.
- When deploying to production (Vercel, Netlify), ensure you update your **Authorized JavaScript origins** in Google Cloud Console to match your live production URL.
