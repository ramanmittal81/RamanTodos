# Todos

A very simple, single-user task app that runs in the browser. No accounts, no server, no Asana connection.

## What it does

- Create tasks
- Tag a task to one or more projects
- Set priority (High / Medium / Low)
- Check a task off when it's done
- Filter by project and by priority
- Export / import a backup file

## How to run it

Double-click **`My Todos.html`**. It opens in your default browser and works offline.

If your browser blocks saving on `file://` (Safari does), run a tiny local server instead:

```bash
cd "/Users/raman/Claude Projects/Todos App" && python3 -m http.server 8787
```

Then open http://localhost:8787/My%20Todos.html — Chrome and Safari both save fine there.

## Where the data lives

Everything is stored in your browser's **localStorage**, on this laptop only. Nothing is uploaded anywhere.

That means the data is tied to this browser on this machine. It survives closing the tab, quitting the browser, and restarting the Mac. It does **not** survive:

- a dead laptop (no copy exists anywhere else)
- switching to a different browser or another computer
- clearing "cookies and site data" in browser settings
- opening the app from a different address (`file://` and `localhost` are separate stores)

**So: use "Export backup" regularly.** It downloads a `.json` file — keep it in iCloud/Dropbox/Google Drive and you're covered. "Import backup" restores it on any machine.

## Files

| File | Purpose |
| --- | --- |
| `My Todos.html` | The app — double-click this one |
| `starter-data.js` | The 26 Asana tasks, loaded automatically on first run |
| `styles.css` | Styling (light + dark) |
| `app.js` | All logic and storage |

Storage key: `todos-app-v1`.
