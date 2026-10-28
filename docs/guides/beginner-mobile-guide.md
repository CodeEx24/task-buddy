# Beginner's Guide to the Task Buddy Codebase

A plain-language tour of how a React Native (Expo) app is built and where each kind of code lives in this repo.
If you know a bit of web development (HTML, CSS, a website), the comparisons below will help. If you don't, the restaurant comparison in section 3 covers the same ground.

> Source of truth for rules: [`CLAUDE.md`](../../CLAUDE.md). This guide only explains them.

---

## 1. Building blocks: mobile vs web

React Native looks like React for the web, but it draws **real phone UI** (iOS/Android native views) instead of HTML.

| Mobile (React Native / Expo Router) | Web equivalent | What it does |
|---|---|---|
| `<View>` | `<div>` | A box. Holds other things and controls layout (rows, columns, spacing). |
| `<Text>` | `<p>`, `<span>`, `<h1>` | Shows words. **All text must be inside `<Text>`**, or the app crashes. |
| `<Image>` | `<img>` | Shows a picture. |
| `<Pressable>` / `<TouchableOpacity>` | `<button>` | Something you tap. |
| `<TextInput>` | `<input>` | A box you type into. |
| `<ScrollView>` / `<FlatList>` | A page that scrolls | Phone screens don't scroll by default. You opt in. `FlatList` is for long lists. |
| `<Link href="/">` | `<a href="/">` | Tap to go to another screen. |
| `<Stack>` | Browser history (back button) | Screens pile up like cards. Open a screen = new card on top; back = remove it. |
| Tabs (`(tabs)/` folder) | A navigation bar | The bottom bar: Today, Inbox, Buddy, Settings. |
| `StyleSheet.create({...})` | CSS | Styles written as JS objects: `fontSize: 18` instead of `font-size: 18px`. |
| NativeWind `className="p-4"` | Tailwind CSS | Same Tailwind class names, but for mobile. (Coming in a later ticket.) |
| Flexbox (default `column`) | Flexbox (default `row`) | Same layout system, but on mobile things stack **top-to-bottom** by default. |

### Small example (from this repo)

`src/features/showcase/components/UiShowcaseScreen.tsx` (simplified):

```tsx
<View style={styles.container}>      {/* like <div> that fills the screen and centers */}
  <Text style={styles.title}>         {/* like <h1> */}
    Task Buddy
  </Text>
</View>
```

The web version would be:

```html
<div class="container"><h1 class="title">Task Buddy</h1></div>
```

---

## 2. Folder structure: what goes where

**Built** means the folder already has real code (ticket TB-15). **Planned** means it only has a `README.md` placeholder, or doesn't exist yet and gets filled by later tickets.

```
task-buddy/
├─ src/
│  ├─ app/               ← SCREENS / ROUTES (the "pages")
│  ├─ features/          ← FEATURE CODE (the real logic, grouped by feature)
│  ├─ components/ui/     ← SHARED UI PIECES (buttons, cards, inputs)
│  ├─ db/                ← LOCAL DATABASE on the phone
│  ├─ lib/               ← SMALL HELPERS (dates, logger, supabase client)
│  ├─ stores/            ← APP MEMORY (UI state, e.g. "is the sheet open?")
│  └─ theme/             ← COLORS, FONTS, SPACING
├─ packages/schemas/     ← DATA RULES shared by app and server (Zod)
├─ supabase/             ← THE SERVER / CLOUD side
├─ assets/               ← IMAGES, ICONS, SPLASH SCREEN
├─ evals/                ← TESTS FOR AI QUALITY
├─ .maestro/             ← "ROBOT USER" TESTS (taps through the app)
└─ docs/                 ← DOCUMENTATION (tickets, workflow, guides)
```

### 2.1 `src/app/`: screens (routes)
- **Status:** Built (`_layout.tsx`, `index.tsx`, `+not-found.tsx`).
- **Why inside `src/`:** all code lives under one folder. Expo Router looks in `src/app/` automatically, so no setting is needed.
- **Web comparison:** the `pages/` folder in Next.js. **Each file is a screen**, and its file name becomes its address.
  - `src/app/index.tsx` → `/` (home). The `src/app` part is not in the address.
  - `src/app/task/[id].tsx` → `/task/123` (`[id]` is a fill-in-the-blank)
  - `src/app/(tabs)/today.tsx` → the Today tab. Folders in `( )` group screens **without** adding to the address.
  - `src/app/_layout.tsx` → the frame around every screen (it holds the `<Stack>`).
  - `src/app/+not-found.tsx` → the "404 page".
- **Rule:** keep these files **thin**. A route file should mostly just show a screen from `src/features/`. For example, `src/app/(tabs)/index.tsx` only renders `TaskListScreen` from `src/features/tasks`.

### 2.2 `src/features/`: the real work, grouped by feature
- **Status:** Built for `home/`. Planned for `tasks/`, `capture/`, `ai/`, `plan/`, `buddy/`, `review/`, `notifications/`, `spaces/`, `auth/`, `settings/`, `billing/`.
- **Idea:** everything about one feature lives together, so you don't hunt across the whole repo.
- Inside each feature (example `tasks/`):

| Subfolder / file | Holds | Web comparison |
|---|---|---|
| `components/` | Screens and pieces only this feature uses (`TaskRow.tsx`) | Page-specific components |
| `hooks/` | Reusable logic for components (`use-tasks.ts` → `useTasks()`) | React hooks |
| `repo/` | **Database operations** for this feature (`task-repo.ts`: `createTask()`, `listTasks()`) | The "API/data layer" |
| `schema.ts` | Data shape rules for this feature | Form/validation rules |

### 2.3 Database operations: two places, two jobs
This is the part beginners mix up most often.

| Folder | What it is | Comparison |
|---|---|---|
| `src/db/` | **Setup** of the phone's local database (SQLite + Drizzle): table definitions, migrations, the connection. | Creating the spreadsheet and its columns |
| `src/features/*/repo/` | **Operations** on that database: create, read, update, delete tasks. | The person who reads and writes rows |
| `supabase/migrations/` | Setup of the **cloud** database (Postgres) for sync and sharing. | The same, but on the server |

**Rule:** components **never** write SQL directly. A screen calls a hook → the hook calls the repo → the repo talks to the database.

```
Screen (TaskList.tsx)
   ↓ calls
Hook (useTasks)
   ↓ calls
Repo (task-repo.ts: listTasks())
   ↓ reads
Local DB (src/db, SQLite on the phone)
```

Why: if the database ever changes, you fix one repo file instead of 40 screens.

### 2.4 `src/components/ui/`: shared UI pieces
- **Status:** Planned (README only).
- **Holds:** the app's own "LEGO bricks": `Button`, `Card`, `Input`, `Sheet`. They're built once, styled once, and used everywhere.
- **Difference from `features/*/components/`:**
  - Used by **many** features → `src/components/ui/`
  - Used by **one** feature → `src/features/<that-feature>/components/`
- **Rule (reuse-first):** before making a new component, check whether one already exists here.

### 2.5 `src/lib/`: helpers
- **Status:** Built (`app-info.ts` holds `APP_NAME`).
- **Holds:** small tools that aren't UI and aren't a feature: date formatting, the logger, environment settings, the Supabase client.
- **Web comparison:** a `utils/` folder.

### 2.6 `src/stores/`: app memory (UI state)
- **Status:** Planned.
- **Holds:** Zustand stores for things the app needs to remember while running, such as "which filter is selected" or "is the quick-add box open".
- **Not for:** tasks themselves. Those live in the database (`src/db`), and TanStack Query handles loading them.

### 2.7 `src/theme/`: look and feel
- **Status:** Planned.
- **Holds:** color tokens, spacing and font sizes, light/dark mode.
- **Web comparison:** CSS variables or a Tailwind config.

### 2.8 `packages/schemas/`: shared data rules
- **Status:** Planned.
- **Holds:** Zod schemas, which are rules like "a task must have a title, and the due date must be a real date".
- **Why shared:** the app and the server use **the same rules**, so they always agree. AI output gets checked against these too.

### 2.9 `supabase/`: the server side
- **Status:** Planned.

| Subfolder | Holds |
|---|---|
| `migrations/` | Cloud database tables and security rules (RLS = "who can see which rows") |
| `functions/ai-gateway/` | The **only** place that talks to the AI. The app asks this, and this asks Claude. Keeps the secret API key off the phone. |
| `functions/send-checkins/` | Sends the buddy's check-in notifications |
| `functions/revenuecat-webhook/` | Handles payments (later phase) |
| `tests/` | Tests for the security rules |

**Rule:** code in `supabase/functions/` is server-only. Never import it into `src/`.

### 2.10 Other folders

| Folder | Holds |
|---|---|
| `assets/` | App icon, splash screen, images |
| `evals/` | Golden examples that check that AI answers stay good |
| `.maestro/` | End-to-end tests: a robot that opens the app and taps through it like a person |
| `docs/tickets/TB-###/` | Notes for each ticket (intent, spec, plan, verification) |
| `docs/actions/` | Step-by-step guides for things a human must do (e.g. set up the emulator) |
| `docs/workflow/` | How work moves from Jira to a merged PR |

Tests sit **next to** the code they test, for example `TaskListScreen.tsx` and `TaskListScreen.test.tsx` in the same folder.

---

## 3. The restaurant comparison

| Restaurant | Task Buddy folder |
|---|---|
| The menu / list of rooms you can walk into | `src/app/` (screens) |
| Each station in the kitchen (grill, salads, desserts) | `src/features/*` |
| Shared plates, cups and cutlery every station uses | `src/components/ui/` |
| The pantry and fridge | `src/db/` (local database) |
| The cook who fetches and stores ingredients | `features/*/repo/` |
| The recipe rules ("a burger must have a bun") | `packages/schemas/` (Zod) |
| The restaurant's paint, logo and decor | `src/theme/` |
| The whiteboard of "table 4 is waiting" | `src/stores/` |
| The head office and the supplier | `supabase/` (server) |
| The one manager allowed to call the expensive supplier | `supabase/functions/ai-gateway/` |

---

## 4. "Where do I put this?" cheat sheet

| I want to... | Put it in |
|---|---|
| Add a new screen | `src/app/...` (thin) + the real screen in `src/features/<feature>/components/` |
| Make a button every screen can use | `src/components/ui/` |
| Make a component only the Tasks feature uses | `src/features/tasks/components/` |
| Save or load tasks | `src/features/tasks/repo/task-repo.ts` |
| Add a new table to the phone database | `src/db/` + run `pnpm db:generate` |
| Add a new table to the cloud database | `supabase/migrations/` (with RLS!) |
| Describe what valid data looks like | `packages/schemas/` (or the feature's `schema.ts`) |
| Remember a UI choice while the app runs | `src/stores/` |
| Change colors or fonts | `src/theme/` |
| Write a date or format helper | `src/lib/` |
| Call the AI | `src/features/ai/` (client) → `supabase/functions/ai-gateway/` (server) |
| Add an image or icon | `assets/` |

---

## 5. File naming

| Kind of file | Style | Example |
|---|---|---|
| Component | PascalCase | `TaskRow.tsx` |
| Screen route | lowercase | `today.tsx`, `[id].tsx` |
| Hook, helper, repo | kebab-case | `use-tasks.ts`, `task-repo.ts` |
| Test | same name + `.test` | `task-repo.test.ts` |

---

## 6. Words you'll hear

- **Expo**: a toolkit that makes building React Native apps easier (running on your phone, building and publishing).
- **Expo Go / dev client**: the app on your phone that runs your code while you develop.
- **Route**: a screen you can navigate to.
- **Component**: a reusable piece of UI (a function that returns JSX).
- **Hook**: a function starting with `use` that adds logic or state to a component.
- **State**: data the app remembers that can change and redraw the screen.
- **Local-first**: data is saved on the phone first, so the app works offline, then syncs to the cloud.
- **Migration**: a script that changes database tables in a trackable, reversible way.
- **RLS (Row Level Security)**: database rules so users only see their own data.
- **Schema (Zod)**: a description of what valid data looks like, used to reject bad data.
- **Edge Function**: a small piece of server code running on Supabase.
