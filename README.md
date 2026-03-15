# Kaido - Anime Streaming Website
![image](https://github.com/Manj0tBenipal/kaido/assets/108014780/fb96dfe3-0a3a-4b95-9633-bd20509e7b84)


Welcome to Kaido, your one-stop destination for streaming your favorite anime series and movies! This website is built using React and leverages several libraries and APIs to provide a seamless anime streaming experience.



## Features

- **Anime Library**: Browse and search for a wide range of anime series and movies.

- **Anime Details**: Get detailed information about each anime, including synopsis, genres, release date, and more.

- **Streaming**: Stream anime episodes and movies directly from the website.

- **User-friendly**: Kaido is designed with a user-friendly interface to enhance your viewing experience.

## Technologies Used

- **React**: The website is built using the React JavaScript library for creating dynamic user interfaces.

- **React Router**: React Router is used for handling client-side routing and navigation within the app.

- **React Query**: React Query is used for efficient data fetching and state management.

- **p-queue**: p-queue is utilized to manage concurrent API requests efficiently.

- **Node.js Library**: This website uses a Node.js library for consuming data from various publicly available anime APIs.

- **Jikan REST API**: Jikan is used to retrieve anime information, including details about episodes, genres, and more.

- **Kitsu API**: The Kitsu API provides additional data and information about anime titles.

## Getting Started

If you want to set up Kaido locally on your machine, follow these steps:

1. Clone the repository and install the frontend dependencies:

   ```shell
   git clone https://github.com/Manj0tBenipal/kaido.git
   cd kaido
   npm install
   npm --prefix server install
   ```

2. Start the self-hosted anime API:

   ```shell
   npm run api
   ```

3. In a second terminal, start the frontend:

   ```shell
   npm run dev
   ```

Kaido now uses the local self-hosted API at `http://127.0.0.1:3000` by default.
The backend includes HiAnime extraction plus Kaido search, info, server, and
source resolution. For HLS playback you can use either:

- the backend proxy at `/anime/gogoanime/proxy-stream`
- a separate `proxy-m3u8` service, like Kitsune uses

If your deployed backend host is blocked by stream CDNs, prefer the separate proxy.

If you want to point the frontend at a deployed backend instead, create a `.env.local`
file from `.env.example` and set `VITE_CONSUMET_API_URL` to that backend origin before
starting Vite. The variable name is legacy, but it now points at your Kaido-backed API
rather than the old public Consumet service.

If you want the Kitsune-style split setup, also set:

```shell
VITE_PROXY_URL=http://127.0.0.1:4040
```

or in production:

```shell
VITE_PROXY_URL=https://your-proxy-domain.example.com
```

When `VITE_PROXY_URL` is set, the frontend asks the backend for raw stream URLs and
routes playback through the external proxy instead of the API host.

For backend-specific local settings, create `server/.env` from [server/.env.example](/Users/robert/kaido/server/.env.example). The backend automatically loads env files from both the repo root and `server/` in local development.

The backend envs now mean:

- `FRONTEND_ORIGIN`: which frontend origins may call the API
- `PUBLIC_URL`: the public backend URL used when rewriting proxied HLS URLs

The frontend envs now mean:

- `VITE_CONSUMET_API_URL`: backend API origin
- `VITE_PROXY_URL`: optional external `proxy-m3u8` origin for playback

After that you can access Kaido locally by visiting the URL displayed in the shell window.

## Deployment

### Frontend on Vercel

Deploy the repository root to Vercel as a Vite app.

Set this environment variable in Vercel:

```shell
VITE_CONSUMET_API_URL=https://your-backend-domain.example.com
VITE_PROXY_URL=https://your-proxy-domain.example.com
```

The SPA rewrite config is already included in [vercel.json](/Users/robert/kaido/vercel.json), so routes like `/watch` and `/details/...` resolve correctly after deployment.

### Backend on Render

This repo includes [render.yaml](/Users/robert/kaido/render.yaml) for the backend service.

Create a Render Blueprint or a new Web Service from this repository and set:

```shell
FRONTEND_ORIGIN=https://your-vercel-domain.vercel.app
PUBLIC_URL=https://your-render-service.onrender.com
```

If you use a custom frontend domain, include that in `FRONTEND_ORIGIN` instead. For multiple frontend origins, use a comma-separated list.

Render can serve the API, but some stream CDNs may reject HLS proxy requests from
Render IPs. If that happens, keep Render for the API and set `VITE_PROXY_URL` to a
separate `proxy-m3u8` deployment.

### Backend on Railway

This repo includes [railway.json](/Users/robert/kaido/railway.json) for the backend service.

Deploy the repository to Railway and set:

```shell
FRONTEND_ORIGIN=https://your-vercel-domain.vercel.app
PUBLIC_URL=https://your-railway-domain.up.railway.app
```

Railway will run the backend with:

```shell
npm install --prefix server
npm --prefix server start
```

For Railway production:

- set `FRONTEND_ORIGIN` to your deployed frontend domain
- set `PUBLIC_URL` to the deployed Railway backend domain
- point the frontend `VITE_CONSUMET_API_URL` at that backend domain
- set `VITE_PROXY_URL` to your deployed `proxy-m3u8` domain if you are using the Kitsune-style split setup

Railway is a better fit for the standalone proxy service than Render when upstream
CDNs are sensitive to the API host.

## Contributing
We welcome contributions to improve and enhance Kaido. If you have any bug reports, feature requests, or code contributions, please feel free to open an issue or submit a pull request.
