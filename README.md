# 💠 Matrix Workspace

> **Combine your Google Drive, Microsoft OneDrive, and Dropbox into one giant, secure hard drive inside your browser — with zero servers, automatic backup protection, and complete privacy.**

<div align="center">

[![Zero Backend](https://img.shields.io/badge/Server-Zero%20Server%20(100%25%20In%20Browser)-10b981.svg?style=for-the-badge)](#-why-matrix)
[![Encryption](https://img.shields.io/badge/Security-AES--256--GCM%20Military%20Grade-8b5cf6.svg?style=for-the-badge)](#-how-your-files-stay-private)
[![Backup](https://img.shields.io/badge/Backup-RAID--5%20Crash%20Protection-f59e0b.svg?style=for-the-badge)](#-how-raid-5-crash-protection-works)
[![Transfer](https://img.shields.io/badge/Sharing-Direct%20P2P%20(No%20Cloud)-ec4899.svg?style=for-the-badge)](#-cool-features-you-can-use-right-now)
[![License](https://img.shields.io/badge/License-MIT-3b82f6.svg?style=for-the-badge)](LICENSE)

<br/>

**[What is Matrix?](#-what-is-matrix)** • **[Why Do You Need It?](#-why-do-you-need-it)** • **[How It Works (In Simple Terms)](#-how-it-works-in-simple-terms)** • **[Cool Features](#-cool-features-you-can-use-right-now)** • **[Quick Setup](#-how-to-run-it-on-your-computer)**

</div>

---

## 💡 What is Matrix?

Think of **Matrix** as a smart virtual hard drive that runs completely inside your web browser. 

Instead of keeping separate files on Google Drive, OneDrive, and Dropbox, Matrix lets you connect all your accounts into **one unified storage pool**. 

When you upload a file:
1. Matrix locks and encrypts it on your computer.
2. It slices the file into small pieces.
3. It spreads the pieces across your different cloud accounts.
4. It creates a special **rescue piece (backup)** so that even if one cloud goes down or deletes your account, **you never lose your file!**

Best of all: **There is no middle server.** Matrix does not have a backend company watching your data, storing your passwords, or reading your emails. Everything happens right on your device.

---

## ❓ Why Do You Need It?

| What Happens Today ❌ | What Matrix Gives You ✅ |
| :--- | :--- |
| **Scattered Storage**: You have files on Google, files on Microsoft, and files on Dropbox. Keeping track is a mess. | **One Big Storage Pool**: Connect as many accounts as you have (free or paid) and see all your combined space in one simple bar. |
| **Lost Files If an Account Fails**: If Google suspends your account or OneDrive has an outage, your file is gone. | **Crash Proof**: If one cloud account breaks or disappears, Matrix uses smart math to rebuild your file automatically. |
| **Big Tech Reads Your Data**: Cloud providers can scan your personal photos, tax files, and private work documents. | **Total Privacy**: Your files are encrypted with bank-level security before they leave your computer. Clouds only see scrambled, unreadable puzzle pieces. |
| **Expensive Monthly Subscriptions**: Paying $10/month on multiple accounts just to store a few big files. | **100% Free & Open Source**: Maximize the storage you already have without extra monthly fees. |

---

## 🧩 How It Works (In Simple Terms)

You don't need a computer science degree to understand Matrix. Here is the entire journey of a file:

```
Step 1: You drop a file (e.g. Vacation.mp4) into Matrix.
  │
  ▼
Step 2: Matrix locks it with a secret key only you own (AES-256-GCM Encryption).
  │
  ▼
Step 3: Matrix cuts the encrypted file into 3 pieces:
  ├── Piece 1  ───> Saved safely in Google Drive
  ├── Piece 2  ───> Saved safely in Microsoft OneDrive
  └── Piece 3  ───> Saved safely in Dropbox
  │
  ▼
Step 4: Matrix creates an extra "Rescue Piece" (Parity):
  └── Rescue Piece ───> If ANY cloud goes down, this piece rebuilds the missing data!
```

When you want your file back, Matrix downloads the pieces, snaps them back together, unlocks your file, and gives you your original file in less than a second.

---

## 🛡️ How RAID-5 Crash Protection Works

Have you ever had a USB stick corrupt or an online account get locked? It hurts. 

Matrix solves this with a technique called **RAID-5**:
- Imagine your file is the math equation: **`2 + 3 = 5`**
- Matrix saves `2` in Google Drive, `3` in OneDrive, and the answer `5` (the rescue piece) in Dropbox.
- If Google Drive is down and you lose the `2`, Matrix looks at `_ + 3 = 5` and immediately knows the missing piece was `2`!
- Your file is instantly fixed and downloaded without you doing anything.

---

## 🔐 How Your Files Stay Private

1. **Zero-Knowledge**: When Google, Microsoft, or Dropbox look at their servers, they only see random junk names like `Vacation.mp4.part0`. They cannot see what is inside, open it, or preview it.
2. **No Middleman Server**: Matrix runs directly in your browser. There is no "Matrix Company Server" between you and your clouds.
3. **Your Keys Stay on Your Device**: The password key that opens your files is saved in your browser's private memory (`IndexedDB`). It never gets sent to the internet.

---

## 🌟 Cool Features You Can Use Right Now

### 1. 📂 Mount Your Computer's Real Folder
Click **"Mount Desktop Folder"** to connect a folder from your actual laptop or desktop (like `C:\Users\You\Documents\MatrixVault`). 
- Any file you add can be synced straight to your cloud pool with 1 click.
- Decrypted files can be saved straight back onto your physical hard drive without download popups.

### 2. ⚡ Direct P2P Transfer (Send Big Files Friend-to-Friend)
Need to send a huge video or file to a friend without uploading it to a public website?
- Open the **P2P Direct Tunnel**.
- Share a short connection code with your friend.
- Your computers connect directly (browser to browser). The file streams straight to them with zero cloud limits.

### 3. ⚖️ Smart Auto-Balancer
If your Google Drive is 90% full, but your OneDrive has plenty of free space, the **Matrix Rebalancer** automatically moves file pieces to where there is more room. You never have to manually shuffle files again.

### 4. ✉️ Unified Inbox (Gmail + Outlook)
Check your Gmail and Outlook in one clean screen. Send emails, search across all your inboxes, and attach files from your secure multi-cloud drive without switching tabs.

### 5. ⌘K Fast Command Bar
Press `Ctrl + K` (or `Cmd + K` on Mac) anywhere in the app to open the quick launcher. Search your files, check storage, compose an email, or jump to any setting in half a second.

---

## 🚀 How to Run It on Your Computer

Anyone can run Matrix locally in 3 minutes.

### What you need:
- A computer (Windows, Mac, or Linux)
- [Node.js](https://nodejs.org/) installed (version 18 or newer)

### Step-by-Step:

1. **Download the code**:
   ```bash
   git clone https://github.com/your-username/matrix-workspace.git
   cd matrix-workspace
   ```

2. **Install the dependencies**:
   ```bash
   npm install
   ```

3. **Start the app**:
   ```bash
   npm run dev
   ```

4. **Open your browser**:
   Go to: `http://localhost:3000`

That's it! You are now running your own private multi-cloud operating system.

---

## 🧪 Try the 30-Second Test

Want to see the magic in action right away?

1. Open **Virtual Drive** in the app.
2. Drag and drop any image or PDF into the box.
3. You will see Matrix slice it up, encrypt it, and create the backup rescue piece right before your eyes.
4. Try downloading it — it reassembles back into your exact original file with zero quality loss!

---

## 📜 Simple Tech Stack Summary (For Curious Devs)

- **Frontend**: React + TypeScript + Tailwind CSS
- **Fast Build Tool**: Vite
- **Encryption**: Web Crypto API (`AES-256-GCM` + `PBKDF2`)
- **Background Speed**: Web Workers (keeps the UI fast during big file encryption)
- **Direct Transfers**: WebRTC `RTCDataChannel`
- **Local Disk Sync**: Native HTML5 `showDirectoryPicker` (File System Access API)
- **Storage & State**: `idb-keyval` (IndexedDB)
- **APIs**: Direct Google Drive REST, Microsoft Graph API, Dropbox v2

---

## 📄 License

This project is licensed under the [MIT License](LICENSE). It is completely free for everyone to use, study, and improve.
