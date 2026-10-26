# Dixply Website

Astro static site with a Cloudflare Pages Function for the Brevo contact form.

## Local development

```sh
npm install
npm run dev
```

Use `npm run dev` for the static Astro site. To test the contact endpoint and static output together, build and run it through Cloudflare Pages tooling:

```sh
npm run pages:dev
```

Create `.dev.vars` in the project root with this placeholder replaced by the real key, then start the local Pages server:

```text
BREVO_API_KEY=your_brevo_api_key
```

Do not commit `.dev.vars`. Wrangler loads it only for local Pages Functions. Never add the key to `PUBLIC_*` variables, Astro source, generated files, or Git.

## Cloudflare deployment

In Cloudflare Pages, configure the project with:

- Framework preset: `Astro`
- Build command: `npm run build`
- Build output directory: `dist`
- Node.js version: `22.23.4` or newer

Add `BREVO_API_KEY` as a Secret in the Pages project's Settings > Environment variables for the environments that should accept inquiries. The sender `hello@dixply.com` must be authenticated in Brevo and belong to the configured sending domain. DNS changes are handled separately.

The contact endpoint is available at `/api/contact` and runs from `functions/api/contact.ts`.

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
│   └── favicon.svg
├── src
│   ├── assets
│   │   └── astro.svg
│   ├── components
│   │   └── Welcome.astro
│   ├── layouts
│   │   └── Layout.astro
│   └── pages
│       └── index.astro
└── package.json
```

To learn more about the folder structure of an Astro project, refer to [our guide on project structure](https://docs.astro.build/en/basics/project-structure/).

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).
