<div align="center">
  
  # 🌿 SevaSetu
  **Your Personal AI-Powered Rural Health Navigator**

  [![Live Demo](https://img.shields.io/badge/Live-Demo-brightgreen.svg?style=for-the-badge)](https://the-seva-setu.vercel.app/)
  [![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](#)
  [![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](#)
  [![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](#)

</div>

<br />

<div align="center">
  <img src="/Screenshot 2026-07-11 042418.png" alt="SevaSetu Dashboard UI" width="350" style="border-radius: 15px; box-shadow: 0px 4px 10px rgba(0,0,0,0.1);" />
  <p><em>A mobile-first, glassmorphic UI designed specifically for accessibility and ease of use.</em></p>
</div>

<br />

## 📖 About The Project
 
In rural India, millions face significant barriers to accessing quality healthcare information due to low literacy rates, language barriers, and the sheer complexity of medical jargon. Furthermore, many citizens remain unaware of government health schemes designed specifically for their demographics.

**SevaSetu** bridges this gap. Built as a highly optimized **Progressive Web App (PWA)**, it serves as an all-in-one digital health companion. It leverages cutting-edge AI to process complex medical documents, provides multilingual voice assistance, and actively matches users with life-saving public health benefits—all through an interface that feels like a native mobile app without requiring an app store download.

---

## 📸 UI Showcase

### 📱 Mobile View
| 🏠 Dashboard Layout | 🏛️ Govt Schemes | 🚨 Emergency Quick Dial |
| :---: | :---: | :---: |
| <img src="./images/mobile-view0.png" alt="🏠 Mobile Dashboard" width="250" style="border-radius: 10px;"/> | <img src="./images/mobile-view4.png" alt="🏛️ Mobile Govt Schemes" width="250" style="border-radius: 10px;"/> | <img src="./images/mobile-view5.png" alt="🚨 Emergency Quick Dial" width="250" style="border-radius: 10px;"/> |

### 💻 Desktop View
| 🏠 Dashboard Layout | 🗣️ AI Voice Clinic |  📄 Medical Report Vault  |
| :---: | :---: | :---: |
| <img src="./images/Screenshot 2026-07-11 042418.png" alt="Desktop Dashboard" width="400" style="border-radius: 10px;"/> | <img src="./images/Screenshot 2026-07-11 042524.png" alt="Desktop AI Clinic" width="400" style="border-radius: 10px;"/> | <img src="./images/Screenshot 2026-07-11 042541.png" alt="Desktop Health Vault" width="400" style="border-radius: 10px;"/> |

### 💻 AI-Generated Health Report (Desktop/Export View)
*SevaSetu automatically generates clean, printable medical summaries from uploaded lab reports.*
<div align="center">
  <img src="./images/Screenshot 2026-07-11 043001.png" alt="Desktop Health Report" width="800" style="border-radius: 10px; box-shadow: 0px 4px 12px rgba(0,0,0,0.15); margin-top: 10px;"/>
</div>

---

## ✨ Core Features

### 🎙️ Multilingual AI Clinic
To combat literacy barriers, SevaSetu integrates real-time **Speech-to-Text (STT)** and **Text-to-Speech (TTS)**. Users can navigate the app, ask medical queries, and receive guidance using their voice in local languages (Hindi, Punjabi, English).

### 📄 Intelligent Health Vault
Medical reports are notoriously hard to read. Users can upload their lab results (PDF/JPG), and SevaSetu's AI-driven document analysis will parse the data. It returns a simplified, color-coded health summary, translating complex biomarkers into plain, actionable language.

### 🏛️ Smart Government Scheme Matcher
A multi-step filtering engine that assesses user demographics (age, income, location, medical history) to instantly match citizens with relevant, eligible government health programs, ensuring they get the financial and medical support they deserve.

### ⚡ Offline-Ready PWA Architecture
Designed for areas with unstable internet connections. SevaSetu caches vital resources locally, allowing users to load the application and view previously fetched data even when offline.

---

## 🛠️ Technology Stack

| Category | Technologies |
| :--- | :--- |
| **🎨 Frontend** | React, TypeScript, Vite |
| **💅 Styling & UI** | Tailwind CSS, Framer Motion, shadcn/ui |
| **⚙️ Backend** | Supabase (PostgreSQL, Edge Functions) |
| **🔒 Authentication**| Supabase Auth |
| **🗄️ Storage** | Supabase Storage (for Medical Reports) |
| **🚀 Deployment** | Vercel |

---

## 🏗️ Project Layout

```text
📦 SevaSetu
 ┣ 📂 client (or src)     # Frontend React components, hooks, and context
 ┣ 📂 supabase            # Backend configurations, database migrations, and edge functions
 ┣ 📂 public              # Static assets and PWA manifest (manifest.json)
 ┣ 📂 docs                # Architecture notes and technical documentation
 ┗ 📜 vite.config.ts      # Vite configuration for the PWA