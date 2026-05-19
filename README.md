# Qwik City App ⚡️

- [Qwik Docs](https://qwik.dev/)
- [Discord](https://qwik.dev/chat)
- [Qwik GitHub](https://github.com/QwikDev/qwik)
- [@QwikDev](https://twitter.com/QwikDev)
- [Vite](https://vitejs.dev/)

---

## Project Structure

This project is using Qwik with [QwikCity](https://qwik.dev/qwikcity/overview/). QwikCity is just an extra set of tools on top of Qwik to make it easier to build a full site, including directory-based routing, layouts, and more.

Inside your project, you'll see the following directory structure:

```
├── public/
│   └── ...
└── src/
    ├── components/
    │   └── ...
    └── routes/
        └── ...
```

- `src/routes`: Provides the directory-based routing, which can include a hierarchy of `layout.tsx` layout files, and an `index.tsx` file as the page. Additionally, `index.ts` files are endpoints. Please see the [routing docs](https://qwik.dev/qwikcity/routing/overview/) for more info.

- `src/components`: Recommended directory for components.

- `public`: Any static assets, like images, can be placed in the public directory. Please see the [Vite public directory](https://vitejs.dev/guide/assets.html#the-public-directory) for more info.

## Add Integrations and deployment

Use the `npm run qwik add` command to add additional integrations. Some examples of integrations includes: Cloudflare, Netlify or Express Server, and the [Static Site Generator (SSG)](https://qwik.dev/qwikcity/guides/static-site-generation/).

```shell
npm run qwik add # or `yarn qwik add`
```

## Development

Development mode uses [Vite's development server](https://vitejs.dev/). The `dev` command will server-side render (SSR) the output during development.

```shell
npm start # or `yarn start`
```

> Note: during dev mode, Vite may request a significant number of `.js` files. This does not represent a Qwik production build.

## Preview

The preview command will create a production build of the client modules, a production build of `src/entry.preview.tsx`, and run a local server. The preview server is only for convenience to preview a production build locally and should not be used as a production server.

```shell
npm run preview # or `yarn preview`
```

## Production

The production build will generate client and server modules by running both client and server build commands. The build command will use Typescript to run a type check on the source code.

```shell
npm run build # or `yarn build`
```


## TODO

 - interactive graph
 - integrate stoat communication

 - interactive 3d models of molecules

 - admin equipment command dashboard
 - interactive dummy database dashboard
 - data visualizations on dashboard (maybe some clustering)


## Done
 - bold dynamic splash page

# Graphs

## ML
conditions: reagent rations, temp, time, solvent, modulator
 - synthesis -> yield, crystalilinity
 - synthesis -> structure, PXRD phase, BET surface area, pore geometry
 - structure -> function, CO2 uptake, binding affinity, catalytic activity

## DB

### INPUT STREAM
Physical Data (components, tools)
Process Data (operation that acts on the molecule)

### OUTPUT STREAM
Sample Data
Sample ID

## TEST REGISTRY

test definition structure
 - test id
 - level, identity/function
 - method (Complete Procedure)
 - parent / child (inheritance from more generic tests)
 - instruments ( hardware id and category )
 - throughput (samples/hr)
 - sample requirements (mass, volume, state)
 - output data (type, size, format)
 - status (active, inactive, in development, deprecated)
 
test validation
- proposed by members
- validated by chemist
- confirms it is sound and reproducible
- updating test procedure creates new test id, marks old a deprecated

Phases
Experimental Design: ELN synthesis, every experiment carried out must have an ELN associated
Synthesis Execution: 