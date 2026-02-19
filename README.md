# Workspace Smart Search (InterSystems IRIS)

**Workspace Smart Search** is a specialized navigation toolkit for developers working with **InterSystems IRIS / ObjectScript**. It solves the friction of jumping between Classes, Routines, and Labels when working across the `isfs://` file system.

---

## 🚀 Key Features

### 1. The "Smart Jump" (`Ctrl` + `Alt` + `G`)
Stop hunting through the file explorer. Use the command palette to jump directly to any code location using native InterSystems syntax.

* **Auto-Normalization:** Automatically converts Class dots (`User.Data.Class`) to folder slashes (`User/Data/Class`).
* **Extension Intelligence:** Automatically tries `.cls`, `.mac`, and `.int` extensions so you don't have to type them.
* **Deep Navigation:** Jumps directly to the Label or Method definition and centers it on your screen.

### 2. Intelligent Auto-Pinning
VS Code often opens files in "Preview Mode," meaning they disappear as soon as you click something else. 
* This extension **automatically pins** every `isfs` file you open.
* Keeps your workspace organized and ensures your tabs stay where you put them.

### 3. Multi-Server Support
If your workspace is connected to multiple IRIS namespaces or servers, the extension will prompt you to select the correct target, ensuring you always land in the right environment.

---

## ⌨️ Supported Syntax

| Input Format | Example | Action |
| :--- | :--- | :--- |
| **Class** | `User.Account` | Opens `User/Account.cls` |
| **Routine** | `MYROUTINE` | Opens `MYROUTINE.mac` or `.int` |
| **Label^Routine** | `START^ACCOUNT` | Opens Routine and jumps to `START` |
| **Offset Jump** | `START+5^ACCOUNT` | Opens Routine and jumps 5 lines past `START` |
| **Class#Method** | `User.Log#Write` | Opens Class and jumps to `Method Write` |

---

## 🛠 Configuration & Commands

| Command | Title | Keybinding |
| :--- | :--- | :--- |
| `workspace-smart-search.directGoTo` | **InterSystems: Jump to Label^Routine** | `Ctrl+Alt+G` |

> **Note:** The keybinding is context-aware and will only activate when you have an active InterSystems ObjectScript connection.

---

## 📦 Installation

1.  Open **Visual Studio Code**.
2.  Go to the **Extensions** view (`Ctrl+Shift+X`).
3.  Search for **Workspace Smart Search**.
4.  Click **Install**.

---

## 🤝 Contributing

This project is maintained by **alonpe**. If you encounter issues or have suggestions for new jump patterns, please visit the [GitHub Repository](https://github.com/AlonPeleg/workspace-smart-search).

---

**Happy Coding!**