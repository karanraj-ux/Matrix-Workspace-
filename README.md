# Matrix Workspace

> **A Zero-Server, Client-Side Multi-Cloud Operating Layer.**  
> Aggregate fragmented free storage tiers, teleport files between accounts without local downloads, and route critical alerts in-browser without intermediate servers, third-party databases, or subscription fees.

---

## 💡 The Problem

Major cloud providers offer generous free tiers—**15 GB on Google Drive**, **5 GB on OneDrive**, **2 GB on Dropbox**. But they keep them strictly isolated in walled gardens:

1. **The Quota Wall:** When Account A hits 14.9 GB, Google blocks incoming emails and file creation—even if your secondary Account B has 14 GB of empty, unused space.
2. **The "Share" Trap:** Native Google Drive sharing does **not** transfer storage ownership. The file still consumes the sender's quota.
3. **The Intermediary Risk:** Existing cloud aggregators (like MultCloud, Zapier, or Superhuman) require you to hand your OAuth tokens and passwords to their backend servers, exposing your data to third-party tracking, leaks, and high monthly subscription costs.
4. **Account Switching Burnout:** Freelancers, students, and power users constantly juggle 3–5 accounts, repeatedly switching browser profiles just to catch OTP codes, check drive usage, or shift documents.

---

## ⚡ How Matrix Workspace Solves It

Matrix Workspace is built on a strict **Zero-Server Architecture**. It operates as an in-browser operating system that communicates directly with cloud provider APIs via client-side OAuth.

```
┌────────────────────────────────────────────────────────┐
│               User Browser / Client Sandbox            │
│                                                        │
│  ┌─────────────────┐ ┌───────────────────────────────┐ │
│  │ Multi-OAuth Hub │ │   Web Worker Crypto Engine    │ │
│  │  (IndexedDB)    │ │ (AES-256-GCM + XOR RAID-5)    │ │
│  └────────┬────────┘ └──────────────┬────────────────┘ │
│           │                         │                  │
│           │   Direct Browser HTTPS  │                  │
└───────────┼─────────────────────────┼──────────────────┘
            ▼                         ▼
   ┌─────────────────┐       ┌─────────────────┐
   │  Google Drive   │       │  Google Drive   │  ... [OneDrive / Dropbox]
   │   (Account A)   │       │   (Account B)   │
   └─────────────────┘       └─────────────────┘
   No Backend • No Database • No External Middleman
```

### 1. 🗄️ Unified Storage Pooling & Virtual RAID-5
* **Aggregated Quotas:** Combines quotas from multiple accounts (e.g., 15 GB + 15 GB = 30 GB virtual drive) visible in a single dashboard.
* **Dual Upload Strategy:**
  * **Standard Mode:** Upload clean, native files straight to any chosen account with normal, one-click public sharing.
  * **Vault Mode (RAID-5 Sharding):** Slices files into binary chunks, computes XOR parity recovery data, encrypts each shard using browser-native **AES-256-GCM**, and stripes the pieces across different cloud accounts. Cloud providers only see opaque `.bin` shards.

### 2. 🚀 In-Memory File Teleportation (Magic Transfer)
* Move large files, PDFs, or photos from Account A to Account B directly inside browser memory.
* Google Docs, Sheets, and Slides are automatically exported into open standards (`.pdf`, `.xlsx`) and transferred without writing a single byte to your physical device storage.

### 3. 🛡️ Decentralized P2P Magic Links
* Generate self-contained sharing links where the decryption key and shard manifest live entirely in the URL hash (`#magic=...`).
* The sender's app injects the public client configuration into the hash payload, allowing the recipient to authenticate with Google Drive API directly without manually configuring Client IDs.

### 4. 📬 Unified Inbox & Zero-Server Automation
* Aggregate incoming emails from multiple connected accounts into a consolidated feed.
* **Live In-Browser Automation:** Background Web Workers monitor inboxes without third-party server relaying:
  * **Time-Boundary Guard:** Only triggers on emails received *after* rule creation, skipping historical unread clutter.
  * **Loop Prevention:** Tags auto-forwarded threads with `[Matrix Auto-Fwd]` headers to prevent infinite forwarding loops.
  * **Targeted Routing:** Forward priority messages (like bank alerts or GitHub notifications) directly to your primary email address.

---

## 🛠️ Architecture & Technical Stack

* **Framework:** React 18, Vite, TypeScript, Tailwind CSS
* **Animations & Icons:** Motion (`motion/react`), Lucide React
* **Concurrency & Processing:** Dedicated Browser Web Workers (`matrixWorker`, `daemonWorker`)
* **Cryptography:** Native Web Crypto API (AES-256-GCM, PBKDF2, SHA-256)
* **Local Persistence:** Client-side Key-Value Store (`idb-keyval` / IndexedDB)
* **Identity & Protocols:** Google Identity Services (GIS), Google Drive v3 REST API, Gmail v1 REST API

---

## 🚀 Getting Started

### Prerequisites
* Node.js (v18 or higher)
* A Google Cloud OAuth 2.0 Client ID (Web Application)

### Setup Instructions

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/matrix-workspace.git
   cd matrix-workspace
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the local development server:**
   ```bash
   npm run dev
   ```

4. **Configure your Google Cloud Client ID:**
   * Visit the [Google Cloud Console](https://console.cloud.google.com/).
   * Create an OAuth 2.0 Web Application credential with `http://localhost:3000` (or your deployment domain) listed under **Authorized JavaScript origins**.
   * Ensure the following scopes are enabled:
     - `https://www.googleapis.com/auth/drive`
     - `https://www.googleapis.com/auth/drive.appdata`
     - `https://www.googleapis.com/auth/gmail.modify`
     - `https://www.googleapis.com/auth/gmail.send`
   * Open the app, navigate to **Settings**, paste your Client ID, and connect your accounts.

---

## 🔒 Security & Privacy Model

* **No Intermediate Infrastructure:** The project has no server backend, API relay, or external telemetry database. If the host domain goes offline, your data remains safely in your own cloud accounts.
* **Ephemeral Memory Pipelines:** File transfers pipe chunks directly between fetch streams in RAM.
* **Client-Side Key Derivation:** Cryptographic master keys are generated and stored locally in browser storage, never transmitted across network boundaries.

---

## 📄 License

MIT License. Free for personal, academic, and open-source use.
