import React, { useEffect, useRef } from "react";
import Hls from "hls.js";
export default function HlsVideoPlayer({ url, headers }) {
  const videoRef = useRef(null);
  const proxyOrigin =
    import.meta.env.VITE_PROXY_URL?.replace(/\/$/, "") || "";
  const referer = headers?.Referer || headers?.referer || "";
  const playbackUrl =
    proxyOrigin && url && referer
      ? `${proxyOrigin}/m3u8-proxy?url=${encodeURIComponent(
          url
        )}&referer=${encodeURIComponent(referer)}`
      : url;

  useEffect(() => {
    if (!playbackUrl) {
      return undefined;
    }

    // Check if HLS.js is supported in the current browser
    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(playbackUrl);
      hls.attachMedia(videoRef.current);

      // Listen for HLS events (optional)

      // Clean up when the component unmounts
      return () => {
        hls.destroy();
      };
    } else {
      // Neither HLS.js nor native HLS support is available
      console.error("HLS is not supported in this browser.");
    }
  }, [playbackUrl]);
  // full-screnn added
    const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      videoRef.current.requestFullscreen().catch((err) => {
        console.error("Error attempting to enable full-screen mode:", err);
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    document.addEventListener("keydown", handleKeyPress);
    return () => {
      document.removeEventListener("keydown", handleKeyPress);
    };
  }, []);

  const handleKeyPress = (event) => {
    if (event.key === "f" || event.key === "F") {
      toggleFullScreen();
    }
  };
  return (
    <div>
      <video ref={videoRef} controls />
    </div>
  );
}
